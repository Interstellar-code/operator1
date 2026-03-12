/**
 * SQLite adapter for channel thread bindings (telegram + discord).
 *
 * Both channels share the op1_channel_thread_bindings table, discriminated
 * by channel_type ('telegram' | 'discord').
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "../infra/state-db/connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setThreadBindingsDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetThreadBindingsDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Types ───────────────────────────────────────────────────────────────────

export type ThreadBindingRow = {
  binding_key: string;
  channel_type: string;
  account_id: string;
  thread_id: string;
  channel_id: string | null;
  target_kind: string;
  target_session_key: string;
  agent_id: string | null;
  label: string | null;
  bound_by: string | null;
  bound_at: number | null;
  last_activity_at: number | null;
  idle_timeout_ms: number | null;
  max_age_ms: number | null;
  webhook_id: string | null;
  webhook_token: string | null;
  extra_json: string | null;
};

// ── CRUD ────────────────────────────────────────────────────────────────────

export function loadThreadBindingsFromDb(
  channelType: string,
  accountId?: string,
): ThreadBindingRow[] {
  const db = resolveDb();
  try {
    if (accountId) {
      return db
        .prepare(
          "SELECT * FROM op1_channel_thread_bindings WHERE channel_type = ? AND account_id = ?",
        )
        .all(channelType, accountId) as ThreadBindingRow[];
    }
    return db
      .prepare("SELECT * FROM op1_channel_thread_bindings WHERE channel_type = ?")
      .all(channelType) as ThreadBindingRow[];
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function saveThreadBindingToDb(row: ThreadBindingRow): void {
  const db = resolveDb();
  db.prepare(
    `INSERT INTO op1_channel_thread_bindings
       (binding_key, channel_type, account_id, thread_id, channel_id,
        target_kind, target_session_key, agent_id, label, bound_by,
        bound_at, last_activity_at, idle_timeout_ms, max_age_ms,
        webhook_id, webhook_token, extra_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(binding_key) DO UPDATE SET
       thread_id = excluded.thread_id,
       channel_id = excluded.channel_id,
       target_kind = excluded.target_kind,
       target_session_key = excluded.target_session_key,
       agent_id = excluded.agent_id,
       label = excluded.label,
       bound_by = excluded.bound_by,
       bound_at = excluded.bound_at,
       last_activity_at = excluded.last_activity_at,
       idle_timeout_ms = excluded.idle_timeout_ms,
       max_age_ms = excluded.max_age_ms,
       webhook_id = excluded.webhook_id,
       webhook_token = excluded.webhook_token,
       extra_json = excluded.extra_json`,
  ).run(
    row.binding_key,
    row.channel_type,
    row.account_id,
    row.thread_id,
    row.channel_id,
    row.target_kind,
    row.target_session_key,
    row.agent_id,
    row.label,
    row.bound_by,
    row.bound_at,
    row.last_activity_at,
    row.idle_timeout_ms,
    row.max_age_ms,
    row.webhook_id,
    row.webhook_token,
    row.extra_json,
  );
}

export function deleteThreadBindingFromDb(bindingKey: string): void {
  const db = resolveDb();
  db.prepare("DELETE FROM op1_channel_thread_bindings WHERE binding_key = ?").run(bindingKey);
}

export function saveAllThreadBindingsToDb(
  channelType: string,
  accountId: string,
  rows: ThreadBindingRow[],
): void {
  const db = resolveDb();
  db.exec("BEGIN");
  try {
    db.prepare(
      "DELETE FROM op1_channel_thread_bindings WHERE channel_type = ? AND account_id = ?",
    ).run(channelType, accountId);
    for (const row of rows) {
      saveThreadBindingToDb(row);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
