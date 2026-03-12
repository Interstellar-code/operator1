/**
 * Test helpers for exec-approvals SQLite tests.
 */
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { setCoreSettingsDbForTest, resetCoreSettingsDbForTest } from "./core-settings-sqlite.js";
import { resetExecApprovalsDbForTest, setExecApprovalsDbForTest } from "./exec-approvals-sqlite.js";
import { runMigrations } from "./schema.js";

export function useExecApprovalsTestDb() {
  let db: DatabaseSync;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setExecApprovalsDbForTest(db);
    setCoreSettingsDbForTest(db);
  });

  afterEach(() => {
    resetExecApprovalsDbForTest();
    resetCoreSettingsDbForTest();
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
