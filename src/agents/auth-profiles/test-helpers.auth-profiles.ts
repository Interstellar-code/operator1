/**
 * Test helpers for auth profiles SQLite tests.
 *
 * Sets up a per-test in-memory DB with migrations applied
 * and overrides the auth profiles DB accessor.
 */
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach } from "vitest";
import { runMigrations } from "../../infra/state-db/schema.js";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { setAuthProfilesDbForTest, resetAuthProfilesDbForTest } from "./auth-profiles-sqlite.js";

export function useAuthProfilesTestDb() {
  let db: DatabaseSync;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setAuthProfilesDbForTest(db);
  });

  afterEach(() => {
    resetAuthProfilesDbForTest();
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
