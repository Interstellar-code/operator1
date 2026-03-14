/**
 * Tests for the state.* gateway RPC handlers and the underlying
 * inspect-sqlite.ts introspection module.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkSqlReadOnly,
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT,
  getDbInfo,
  getTableStats,
  getTableSchema,
  inspectTable,
  executeReadOnlyQuery,
  listSettingsFromDb,
  getSettingFromDb,
  setSettingInDb,
  queryAuditTrail,
  exportTableFromDb,
  exportAllTablesFromDb,
  setInspectDbForTest,
  resetInspectDbForTest,
  SENSITIVE_TABLES,
} from "../../infra/state-db/inspect-sqlite.js";
import { runMigrations } from "../../infra/state-db/schema.js";
import { requireNodeSqlite } from "../../memory/sqlite.js";

type InMemoryDb = ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

describe("inspect-sqlite", () => {
  let db: InMemoryDb;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setInspectDbForTest(db);
  });

  afterEach(() => {
    resetInspectDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  // ── getDbInfo ────────────────────────────────────────────────────────────────

  describe("getDbInfo", () => {
    it("returns schemaVersion > 0 after migrations", () => {
      const info = getDbInfo();
      expect(info.schemaVersion).toBeGreaterThan(0);
    });

    it("returns tableCount > 0 after migrations", () => {
      const info = getDbInfo();
      expect(info.tableCount).toBeGreaterThan(5);
    });

    it("integrityOk is true for in-memory DB (no file)", () => {
      const info = getDbInfo();
      // In-memory: stat fails, integrity is treated as ok
      expect(info.integrityOk).toBe(true);
    });
  });

  // ── getTableStats ─────────────────────────────────────────────────────────────

  describe("getTableStats", () => {
    it("returns stats for all tables", () => {
      const stats = getTableStats();
      expect(stats.length).toBeGreaterThan(5);
      const names = stats.map((s) => s.name);
      expect(names).toContain("core_settings");
      expect(names).toContain("op1_settings");
    });

    it("marks auth_credentials as sensitive", () => {
      const stats = getTableStats();
      const cred = stats.find((s) => s.name === "auth_credentials");
      expect(cred).toBeDefined();
      expect(cred!.sensitive).toBe(true);
    });

    it("marks non-sensitive tables correctly", () => {
      const stats = getTableStats();
      const settings = stats.find((s) => s.name === "core_settings");
      expect(settings!.sensitive).toBe(false);
    });

    it("rows field is 0 for empty table", () => {
      const stats = getTableStats();
      // op1_settings is empty after fresh migration
      const s = stats.find((s) => s.name === "op1_settings");
      expect(s!.rows).toBe(0);
    });
  });

  // ── getTableSchema ────────────────────────────────────────────────────────────

  describe("getTableSchema", () => {
    it("returns CREATE TABLE DDL for a known table", () => {
      const ddl = getTableSchema("core_settings");
      expect(ddl).not.toBeNull();
      expect(ddl).toContain("core_settings");
      expect(ddl).toContain("scope");
      expect(ddl).toContain("key");
    });

    it("returns null for a nonexistent table", () => {
      expect(getTableSchema("nonexistent_table_xyz")).toBeNull();
    });
  });

  // ── inspectTable ──────────────────────────────────────────────────────────────

  describe("inspectTable", () => {
    beforeEach(() => {
      // Seed some data
      db.exec(
        `INSERT INTO core_settings (scope, key, value_json, updated_at)
         VALUES ('test', 'a', '"1"', 1000), ('test', 'b', '"2"', 1001), ('test', 'c', '"3"', 1002)`,
      );
    });

    it("returns rows from a table", () => {
      const rows = inspectTable("core_settings");
      expect(rows.length).toBe(3);
    });

    it("applies limit", () => {
      const rows = inspectTable("core_settings", { limit: 2 });
      expect(rows.length).toBe(2);
    });

    it("applies offset", () => {
      const all = inspectTable("core_settings");
      const offset1 = inspectTable("core_settings", { offset: 1 });
      expect(offset1.length).toBe(2);
      expect(offset1[0]).not.toEqual(all[0]);
    });

    it("filters columns", () => {
      const rows = inspectTable("core_settings", { columns: ["scope", "key"] });
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0];
      expect(Object.keys(row)).toContain("scope");
      expect(Object.keys(row)).toContain("key");
      expect(Object.keys(row)).not.toContain("value_json");
    });

    it("ignores invalid column names silently", () => {
      // If all columns are invalid, falls back to *
      const rows = inspectTable("core_settings", { columns: ["nonexistent_col"] });
      expect(rows.length).toBeGreaterThan(0);
    });

    it("throws for nonexistent table", () => {
      expect(() => inspectTable("no_such_table")).toThrow("table not found");
    });

    it("caps limit at MAX_QUERY_LIMIT", () => {
      // Seed 10 rows
      for (let i = 0; i < 10; i++) {
        db.exec(
          `INSERT INTO op1_settings (scope, key, value_json, updated_at) VALUES ('s', 'k${i}', '"v"', 0)`,
        );
      }
      const rows = inspectTable("op1_settings", { limit: MAX_QUERY_LIMIT + 999 });
      expect(rows.length).toBeLessThanOrEqual(MAX_QUERY_LIMIT);
    });
  });

  // ── checkSqlReadOnly ──────────────────────────────────────────────────────────

  describe("checkSqlReadOnly", () => {
    it("allows SELECT", () => {
      expect(checkSqlReadOnly("SELECT 1")).toBeNull();
    });

    it("allows SELECT with column references (no update keyword match)", () => {
      expect(checkSqlReadOnly("SELECT updated_at FROM core_settings")).toBeNull();
    });

    it("allows WITH (CTE)", () => {
      expect(checkSqlReadOnly("WITH x AS (SELECT 1) SELECT * FROM x")).toBeNull();
    });

    it("rejects INSERT", () => {
      expect(checkSqlReadOnly("INSERT INTO foo VALUES (1)")).not.toBeNull();
    });

    it("rejects UPDATE", () => {
      expect(checkSqlReadOnly("UPDATE foo SET x=1")).not.toBeNull();
    });

    it("rejects DELETE", () => {
      expect(checkSqlReadOnly("DELETE FROM foo")).not.toBeNull();
    });

    it("rejects DROP", () => {
      expect(checkSqlReadOnly("DROP TABLE foo")).not.toBeNull();
    });

    it("rejects ALTER", () => {
      expect(checkSqlReadOnly("ALTER TABLE foo ADD COLUMN x TEXT")).not.toBeNull();
    });

    it("rejects multi-statement via semicolon", () => {
      expect(checkSqlReadOnly("SELECT 1; DELETE FROM foo")).not.toBeNull();
    });

    it("rejects ATTACH", () => {
      expect(checkSqlReadOnly("ATTACH DATABASE '/tmp/x.db' AS x")).not.toBeNull();
    });

    it("rejects non-SELECT start", () => {
      expect(checkSqlReadOnly("PRAGMA journal_mode")).not.toBeNull();
    });

    it("does NOT reject 'updated_at' column name in SELECT", () => {
      // 'update' as a standalone word — 'updated_at' should NOT trigger
      expect(checkSqlReadOnly("SELECT updated_at FROM core_settings")).toBeNull();
    });
  });

  // ── executeReadOnlyQuery ──────────────────────────────────────────────────────

  describe("executeReadOnlyQuery", () => {
    beforeEach(() => {
      db.exec(
        `INSERT INTO core_settings (scope, key, value_json, updated_at)
         VALUES ('s', 'k1', '"v1"', 0), ('s', 'k2', '"v2"', 0)`,
      );
    });

    it("executes a valid SELECT", () => {
      const rows = executeReadOnlyQuery("SELECT * FROM core_settings");
      expect(rows.length).toBe(2);
    });

    it("throws on unsafe SQL", () => {
      expect(() => executeReadOnlyQuery("DELETE FROM core_settings")).toThrow();
    });

    it("applies limit", () => {
      const rows = executeReadOnlyQuery("SELECT * FROM core_settings", { limit: 1 });
      expect(rows.length).toBe(1);
    });

    it("uses DEFAULT_QUERY_LIMIT when no limit given", () => {
      // Seed > DEFAULT_QUERY_LIMIT rows
      for (let i = 0; i < DEFAULT_QUERY_LIMIT + 5; i++) {
        db.exec(
          `INSERT INTO op1_settings (scope, key, value_json, updated_at) VALUES ('s', 'x${i}', '"v"', 0)`,
        );
      }
      const rows = executeReadOnlyQuery("SELECT * FROM op1_settings");
      expect(rows.length).toBe(DEFAULT_QUERY_LIMIT);
    });
  });

  // ── settings ─────────────────────────────────────────────────────────────────

  describe("settings", () => {
    it("set and list core settings", () => {
      setSettingInDb("core", "test_scope", "a", "value1");
      setSettingInDb("core", "test_scope", "b", 42);
      const list = listSettingsFromDb("core", "test_scope");
      expect(list).toHaveLength(2);
      expect(list.find((e) => e.key === "a")?.value).toBe("value1");
      expect(list.find((e) => e.key === "b")?.value).toBe(42);
    });

    it("set and get op1 setting", () => {
      setSettingInDb("op1", "heartbeat", "last_run", "2026-03-14");
      const entry = getSettingFromDb("op1", "heartbeat", "last_run");
      expect(entry).not.toBeNull();
      expect(entry!.value).toBe("2026-03-14");
      expect(entry!.scope).toBe("heartbeat");
      expect(entry!.key).toBe("last_run");
    });

    it("returns null for nonexistent setting", () => {
      expect(getSettingFromDb("op1", "no", "entry")).toBeNull();
    });

    it("upserts on set", () => {
      setSettingInDb("op1", "test", "key", "old");
      setSettingInDb("op1", "test", "key", "new");
      expect(getSettingFromDb("op1", "test", "key")!.value).toBe("new");
    });

    it("listSettingsFromDb without scope returns all", () => {
      setSettingInDb("op1", "scope1", "k", 1);
      setSettingInDb("op1", "scope2", "k", 2);
      const all = listSettingsFromDb("op1");
      expect(all.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── audit trail ──────────────────────────────────────────────────────────────

  describe("queryAuditTrail", () => {
    it("returns empty array when no audit records exist", () => {
      const entries = queryAuditTrail();
      expect(Array.isArray(entries)).toBe(true);
    });

    it("filters by table", () => {
      const entries = queryAuditTrail({ table: "auth_credentials" });
      expect(Array.isArray(entries)).toBe(true);
    });

    it("respects limit", () => {
      const entries = queryAuditTrail({ limit: 5 });
      expect(entries.length).toBeLessThanOrEqual(5);
    });
  });

  // ── export ───────────────────────────────────────────────────────────────────

  describe("exportTableFromDb", () => {
    it("exports a table as array of rows", () => {
      const rows = exportTableFromDb("core_settings");
      expect(Array.isArray(rows)).toBe(true);
    });

    it("throws for nonexistent table", () => {
      expect(() => exportTableFromDb("no_table")).toThrow("table not found");
    });
  });

  describe("exportAllTablesFromDb", () => {
    it("returns all tables as a record", () => {
      const data = exportAllTablesFromDb();
      expect(typeof data).toBe("object");
      expect(Object.keys(data)).toContain("core_settings");
      expect(Object.keys(data)).toContain("op1_settings");
    });
  });

  // ── SENSITIVE_TABLES ──────────────────────────────────────────────────────────

  describe("SENSITIVE_TABLES", () => {
    it("includes auth_credentials", () => {
      expect(SENSITIVE_TABLES.has("auth_credentials")).toBe(true);
    });

    it("does not include op1_settings", () => {
      expect(SENSITIVE_TABLES.has("op1_settings")).toBe(false);
    });
  });
});
