/**
 * SQLite adapter for gateway config.
 *
 * Replaces:
 *   ~/.openclaw/openclaw.json → op1_config (singleton row, id=1)
 *
 * The table stores the raw JSON5 string exactly as-is so that all existing
 * parse/validate/env-var/include logic in src/config/io.ts is untouched.
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setConfigDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetConfigDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Config read/write ────────────────────────────────────────────────────────

/** Returns the raw JSON5 string stored in op1_config, or null if not yet written. */
export function getConfigRawFromDb(): string | null {
  const db = resolveDb();
  try {
    const row = db.prepare("SELECT raw_json5 FROM op1_config WHERE id = 1").get() as
      | { raw_json5: string }
      | undefined;
    return row?.raw_json5 ?? null;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

/** Upserts the raw JSON5 string into op1_config (singleton row id=1). */
export function setConfigRawInDb(raw: string): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO op1_config (id, raw_json5, written_at)
     VALUES (1, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       raw_json5 = excluded.raw_json5,
       written_at = excluded.written_at`,
  ).run(raw, now);
}
