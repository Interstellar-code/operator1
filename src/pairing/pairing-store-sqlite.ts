/**
 * SQLite adapter for channel pairing requests and allowlists.
 *
 * Replaces per-channel JSON files in credentials/ with rows in
 * op1_channel_pairing and op1_channel_allowlist tables.
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "../infra/state-db/connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setPairingStoreDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetPairingStoreDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Types ───────────────────────────────────────────────────────────────────

export type PairingRequestRow = {
  channel: string;
  account_id: string;
  sender_id: string;
  code: string;
  created_at: string;
  last_seen_at: string;
  meta_json: string | null;
};

// ── Pairing requests ────────────────────────────────────────────────────────

export function loadPairingRequestsFromDb(
  channel: string,
  accountId?: string,
): PairingRequestRow[] {
  const db = resolveDb();
  try {
    if (accountId) {
      return db
        .prepare(
          "SELECT channel, account_id, sender_id, code, created_at, last_seen_at, meta_json FROM op1_channel_pairing WHERE channel = ? AND account_id = ?",
        )
        .all(channel, accountId) as PairingRequestRow[];
    }
    return db
      .prepare(
        "SELECT channel, account_id, sender_id, code, created_at, last_seen_at, meta_json FROM op1_channel_pairing WHERE channel = ?",
      )
      .all(channel) as PairingRequestRow[];
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function upsertPairingRequestInDb(params: {
  channel: string;
  accountId: string;
  senderId: string;
  code: string;
  createdAt: string;
  lastSeenAt: string;
  metaJson?: string | null;
}): void {
  const db = resolveDb();
  db.prepare(
    `INSERT INTO op1_channel_pairing (channel, account_id, sender_id, code, created_at, last_seen_at, meta_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel, account_id, sender_id) DO UPDATE SET
       code = excluded.code,
       last_seen_at = excluded.last_seen_at,
       meta_json = excluded.meta_json`,
  ).run(
    params.channel,
    params.accountId,
    params.senderId,
    params.code,
    params.createdAt,
    params.lastSeenAt,
    params.metaJson ?? null,
  );
}

export function deletePairingRequestFromDb(
  channel: string,
  accountId: string,
  senderId: string,
): void {
  const db = resolveDb();
  db.prepare(
    "DELETE FROM op1_channel_pairing WHERE channel = ? AND account_id = ? AND sender_id = ?",
  ).run(channel, accountId, senderId);
}

export function deleteExpiredPairingRequestsFromDb(channel: string, cutoffIso: string): number {
  const db = resolveDb();
  const result = db
    .prepare("DELETE FROM op1_channel_pairing WHERE channel = ? AND created_at < ?")
    .run(channel, cutoffIso);
  return Number(result.changes);
}

export function savePairingRequestsToDb(channel: string, rows: PairingRequestRow[]): void {
  const db = resolveDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM op1_channel_pairing WHERE channel = ?").run(channel);
    const insert = db.prepare(
      `INSERT INTO op1_channel_pairing (channel, account_id, sender_id, code, created_at, last_seen_at, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      insert.run(
        row.channel,
        row.account_id,
        row.sender_id,
        row.code,
        row.created_at,
        row.last_seen_at,
        row.meta_json,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// ── Allowlist entries ───────────────────────────────────────────────────────

export function loadAllowlistEntriesFromDb(channel: string, accountId: string): string[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT sender_id FROM op1_channel_allowlist WHERE channel = ? AND account_id = ?")
      .all(channel, accountId) as Array<{ sender_id: string }>;
    return rows.map((r) => r.sender_id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function addAllowlistEntryToDb(
  channel: string,
  accountId: string,
  senderId: string,
): boolean {
  const db = resolveDb();
  try {
    db.prepare(
      "INSERT OR IGNORE INTO op1_channel_allowlist (channel, account_id, sender_id) VALUES (?, ?, ?)",
    ).run(channel, accountId, senderId);
    return db.prepare("SELECT changes() as c").get() !== undefined;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}

export function removeAllowlistEntryFromDb(
  channel: string,
  accountId: string,
  senderId: string,
): boolean {
  const db = resolveDb();
  try {
    const result = db
      .prepare(
        "DELETE FROM op1_channel_allowlist WHERE channel = ? AND account_id = ? AND sender_id = ?",
      )
      .run(channel, accountId, senderId);
    return result.changes > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}

export function saveAllowlistEntriesToDb(
  channel: string,
  accountId: string,
  entries: string[],
): void {
  const db = resolveDb();
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM op1_channel_allowlist WHERE channel = ? AND account_id = ?").run(
      channel,
      accountId,
    );
    const insert = db.prepare(
      "INSERT INTO op1_channel_allowlist (channel, account_id, sender_id) VALUES (?, ?, ?)",
    );
    for (const entry of entries) {
      insert.run(channel, accountId, entry);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
