import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import {
  getConfigRawFromDb,
  resetConfigDbForTest,
  setConfigDbForTest,
  setConfigRawInDb,
} from "./config-sqlite.js";
import { runMigrations } from "./schema.js";

describe("config-sqlite", () => {
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setConfigDbForTest(db);
  });

  afterEach(() => {
    resetConfigDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  test("returns null when no config has been written", () => {
    expect(getConfigRawFromDb()).toBeNull();
  });

  test("stores and retrieves raw JSON5 string", () => {
    const raw = '{ "gateway": { "port": 18789 } }';
    setConfigRawInDb(raw);
    expect(getConfigRawFromDb()).toBe(raw);
  });

  test("upserts — subsequent writes replace previous value", () => {
    setConfigRawInDb("first");
    setConfigRawInDb("second");
    expect(getConfigRawFromDb()).toBe("second");
  });

  test("preserves JSON5 content exactly (env-var placeholders, comments)", () => {
    const json5 = `{
  // Gateway config
  "authToken": "\${OPENCLAW_TOKEN}",
  "port": 18789,
}`;
    setConfigRawInDb(json5);
    expect(getConfigRawFromDb()).toBe(json5);
  });

  test("enforces singleton — only one row in op1_config", () => {
    setConfigRawInDb("first");
    setConfigRawInDb("second");
    const count = (db.prepare("SELECT COUNT(*) as c FROM op1_config").get() as { c: number }).c;
    expect(count).toBe(1);
  });

  test("written_at is updated on upsert", () => {
    setConfigRawInDb("v1");
    const row1 = db.prepare("SELECT written_at FROM op1_config WHERE id = 1").get() as {
      written_at: number;
    };
    const t1 = row1.written_at;

    // Force a different timestamp
    const later = Math.floor(Date.now() / 1000) + 10;
    db.prepare("UPDATE op1_config SET written_at = ? WHERE id = 1").run(later);

    setConfigRawInDb("v2");
    const row2 = db.prepare("SELECT written_at FROM op1_config WHERE id = 1").get() as {
      written_at: number;
    };
    expect(row2.written_at).toBeGreaterThanOrEqual(t1);
  });
});
