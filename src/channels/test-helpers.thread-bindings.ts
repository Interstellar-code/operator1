/**
 * Test helpers for thread bindings SQLite tests.
 */
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach } from "vitest";
import { runMigrations } from "../infra/state-db/schema.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import {
  setThreadBindingsDbForTest,
  resetThreadBindingsDbForTest,
} from "./thread-bindings-sqlite.js";

export function useThreadBindingsTestDb() {
  let db: DatabaseSync;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setThreadBindingsDbForTest(db);
  });

  afterEach(() => {
    resetThreadBindingsDbForTest();
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
