/**
 * Test helpers for pairing store SQLite tests.
 */
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, afterEach } from "vitest";
import { runMigrations } from "../infra/state-db/schema.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { setPairingStoreDbForTest, resetPairingStoreDbForTest } from "./pairing-store-sqlite.js";

export function usePairingStoreTestDb() {
  let db: DatabaseSync;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setPairingStoreDbForTest(db);
  });

  afterEach(() => {
    resetPairingStoreDbForTest();
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
