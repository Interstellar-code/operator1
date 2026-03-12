/**
 * Test helpers for cron_jobs SQLite tests.
 */
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { resetCronDbForTest, setCronDbForTest } from "./cron-sqlite.js";
import { runMigrations } from "./schema.js";

export function useCronTestDb() {
  let db: DatabaseSync;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setCronDbForTest(db);
  });

  afterEach(() => {
    resetCronDbForTest();
    try {
      db?.close();
    } catch {
      // ignore
    }
  });

  return {
    getDb() {
      return db;
    },
  };
}
