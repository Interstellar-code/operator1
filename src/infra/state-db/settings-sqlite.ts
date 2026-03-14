/**
 * SQLite adapter for op1_settings — a generic scoped KV store.
 *
 * Replaces agent-managed heartbeat-state.json with server-side state tracking.
 * Usage: setOp1Setting("heartbeat", "qmd_keepalive", "2026-03-14T05:00:00Z")
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setSettingsDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetSettingsDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Types ────────────────────────────────────────────────────────────────────

interface SettingsRow {
  scope: string;
  key: string;
  value_json: string;
  updated_at: number;
}

export interface SettingsEntry {
  scope: string;
  key: string;
  value: unknown;
  updatedAt: number;
}

function rowToEntry(row: SettingsRow): SettingsEntry {
  return {
    scope: row.scope,
    key: row.key,
    value: JSON.parse(row.value_json),
    updatedAt: row.updated_at,
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

/** Get a single setting value. Returns undefined if not found. */
export function getOp1Setting(scope: string, key = ""): SettingsEntry | undefined {
  const db = resolveDb();
  const row = db
    .prepare(
      "SELECT scope, key, value_json, updated_at FROM op1_settings WHERE scope = ? AND key = ?",
    )
    .get(scope, key) as SettingsRow | undefined;
  return row ? rowToEntry(row) : undefined;
}

/** Get all settings for a scope as a Record<key, value>. */
export function getOp1SettingsByScope(scope: string): Record<string, unknown> {
  const db = resolveDb();
  const rows = db
    .prepare("SELECT key, value_json FROM op1_settings WHERE scope = ?")
    .all(scope) as Array<{ key: string; value_json: string }>;
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = JSON.parse(row.value_json);
  }
  return result;
}

// ── Write ────────────────────────────────────────────────────────────────────

/** Upsert a setting. Value is JSON-serialized. */
export function setOp1Setting(scope: string, key: string, value: unknown): void {
  const db = resolveDb();
  db.prepare(
    `INSERT INTO op1_settings (scope, key, value_json, updated_at)
     VALUES (?, ?, ?, unixepoch())
     ON CONFLICT (scope, key)
     DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(scope, key, JSON.stringify(value));
}

// ── Delete ───────────────────────────────────────────────────────────────────

/** Delete a single setting. */
export function deleteOp1Setting(scope: string, key = ""): void {
  const db = resolveDb();
  db.prepare("DELETE FROM op1_settings WHERE scope = ? AND key = ?").run(scope, key);
}

/** Delete all settings for a scope. */
export function deleteOp1SettingsByScope(scope: string): void {
  const db = resolveDb();
  db.prepare("DELETE FROM op1_settings WHERE scope = ?").run(scope);
}
