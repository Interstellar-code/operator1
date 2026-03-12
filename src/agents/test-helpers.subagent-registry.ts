/**
 * Test helpers for subagent registry SQLite tests.
 *
 * Sets up a shared in-memory DB for both subagent registry and session store,
 * since the registry's orphan reconciliation reads session entries.
 */
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach } from "vitest";
import {
  setSessionStoreDbForTest,
  resetSessionStoreDbForTest,
} from "../config/sessions/store-sqlite.js";
import { runMigrations } from "../infra/state-db/schema.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import {
  setSubagentRegistryDbForTest,
  resetSubagentRegistryDbForTest,
} from "./subagent-registry-sqlite.js";

export function useSubagentRegistryTestDb() {
  let db: DatabaseSync;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setSubagentRegistryDbForTest(db);
    setSessionStoreDbForTest(db);
  });

  afterEach(() => {
    resetSubagentRegistryDbForTest();
    resetSessionStoreDbForTest();
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
