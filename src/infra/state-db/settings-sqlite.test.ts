import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { runMigrations } from "./schema.js";
import {
  deleteOp1Setting,
  deleteOp1SettingsByScope,
  getOp1Setting,
  getOp1SettingsByScope,
  resetSettingsDbForTest,
  setOp1Setting,
  setSettingsDbForTest,
} from "./settings-sqlite.js";

describe("settings-sqlite", () => {
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setSettingsDbForTest(db);
  });

  afterEach(() => {
    resetSettingsDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  // ── Migration ────────────────────────────────────────────────────────────────

  it("v13 migration creates op1_settings table", () => {
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(tables).toContain("op1_settings");
  });

  it("v13 migration runs idempotently", () => {
    expect(() => runMigrations(db)).not.toThrow();
  });

  // ── Set / Get ────────────────────────────────────────────────────────────────

  it("set and get a string value", () => {
    setOp1Setting("heartbeat", "qmd_keepalive", "2026-03-14T05:00:00Z");
    const entry = getOp1Setting("heartbeat", "qmd_keepalive");
    expect(entry).toBeDefined();
    expect(entry!.scope).toBe("heartbeat");
    expect(entry!.key).toBe("qmd_keepalive");
    expect(entry!.value).toBe("2026-03-14T05:00:00Z");
    expect(entry!.updatedAt).toBeGreaterThan(0);
  });

  it("set and get a numeric value", () => {
    setOp1Setting("metrics", "count", 42);
    const entry = getOp1Setting("metrics", "count");
    expect(entry!.value).toBe(42);
  });

  it("set and get an object value", () => {
    setOp1Setting("config", "flags", { dark: true, beta: false });
    const entry = getOp1Setting("config", "flags");
    expect(entry!.value).toEqual({ dark: true, beta: false });
  });

  it("returns undefined for missing key", () => {
    expect(getOp1Setting("heartbeat", "nonexistent")).toBeUndefined();
  });

  // ── Upsert ───────────────────────────────────────────────────────────────────

  it("upsert overwrites existing value", () => {
    setOp1Setting("heartbeat", "qmd_keepalive", "old");
    setOp1Setting("heartbeat", "qmd_keepalive", "new");
    const entry = getOp1Setting("heartbeat", "qmd_keepalive");
    expect(entry!.value).toBe("new");
  });

  // ── getByScope ───────────────────────────────────────────────────────────────

  it("returns all keys for a scope", () => {
    setOp1Setting("heartbeat", "qmd_keepalive", "2026-03-14T05:00:00Z");
    setOp1Setting("heartbeat", "memory_maintenance", "2026-03-12T10:00:00Z");
    setOp1Setting("heartbeat", "last_run", "2026-03-14T05:00:00Z");
    setOp1Setting("other", "key", "value");

    const result = getOp1SettingsByScope("heartbeat");
    expect(Object.keys(result)).toHaveLength(3);
    expect(result.qmd_keepalive).toBe("2026-03-14T05:00:00Z");
    expect(result.memory_maintenance).toBe("2026-03-12T10:00:00Z");
    expect(result.last_run).toBe("2026-03-14T05:00:00Z");
  });

  it("returns empty object for unknown scope", () => {
    expect(getOp1SettingsByScope("nonexistent")).toEqual({});
  });

  // ── Delete ───────────────────────────────────────────────────────────────────

  it("deletes a single setting", () => {
    setOp1Setting("heartbeat", "qmd_keepalive", "val");
    deleteOp1Setting("heartbeat", "qmd_keepalive");
    expect(getOp1Setting("heartbeat", "qmd_keepalive")).toBeUndefined();
  });

  it("deletes all settings for a scope", () => {
    setOp1Setting("heartbeat", "a", 1);
    setOp1Setting("heartbeat", "b", 2);
    setOp1Setting("other", "c", 3);
    deleteOp1SettingsByScope("heartbeat");
    expect(getOp1SettingsByScope("heartbeat")).toEqual({});
    expect(getOp1Setting("other", "c")).toBeDefined();
  });
});
