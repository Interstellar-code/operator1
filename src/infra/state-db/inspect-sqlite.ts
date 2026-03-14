/**
 * SQLite introspection utilities for the operator1 state DB.
 *
 * Used by the state.* gateway RPC methods to provide structured,
 * read-only (and limited-write for settings) access to the database.
 */
import fs from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { getStateDb, getStateDbPath } from "./connection.js";
import { checkStateDbIntegrity } from "./integrity.js";
import { getSchemaVersion, getTableRowCount, listTables } from "./schema.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setInspectDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetInspectDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Tables that contain sensitive credentials/tokens — excluded by default. */
export const SENSITIVE_TABLES = new Set(["auth_credentials"]);

/** Default row cap for queries. */
export const DEFAULT_QUERY_LIMIT = 100;

/** Hard row cap — callers cannot exceed this. */
export const MAX_QUERY_LIMIT = 1000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface DbInfo {
  path: string;
  sizeBytes: number;
  schemaVersion: number;
  tableCount: number;
  integrityOk: boolean;
  integrityError?: string;
}

export interface TableStat {
  name: string;
  rows: number;
  sensitive: boolean;
}

export interface InspectTableOpts {
  limit?: number;
  offset?: number;
  columns?: string[];
}

export interface QueryOpts {
  limit?: number;
}

export interface SettingEntry {
  scope: string;
  key: string;
  value: unknown;
  updatedAt: number;
}

export type SettingsStore = "core" | "op1";

export interface AuditEntry {
  id: number;
  tableName: string;
  recordKey: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  createdAt: number;
}

export interface AuditQueryOpts {
  table?: string;
  action?: "INSERT" | "UPDATE" | "DELETE";
  since?: number;
  limit?: number;
}

// ── DB info ──────────────────────────────────────────────────────────────────

export function getDbInfo(): DbInfo {
  const dbPath = getStateDbPath();
  let sizeBytes = 0;
  try {
    sizeBytes = fs.statSync(dbPath).size;
  } catch {
    // Not on disk (in-memory test DB) or not yet created
  }

  const db = resolveDb();
  const tables = listTables(db);
  const integrity = checkStateDbIntegrity(dbPath);

  return {
    path: dbPath,
    sizeBytes,
    schemaVersion: getSchemaVersion(db),
    tableCount: tables.length,
    integrityOk: integrity.ok,
    integrityError: integrity.error,
  };
}

// ── Table listing ────────────────────────────────────────────────────────────

export function getTableStats(): TableStat[] {
  const db = resolveDb();
  const tables = listTables(db);
  return tables.map((name) => ({
    name,
    rows: getTableRowCount(db, name),
    sensitive: SENSITIVE_TABLES.has(name),
  }));
}

// ── Schema DDL ───────────────────────────────────────────────────────────────

export function getTableSchema(tableName: string): string | null {
  const db = resolveDb();
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { sql: string } | undefined;
  return row?.sql ?? null;
}

// ── Row inspection ───────────────────────────────────────────────────────────

export function inspectTable(
  tableName: string,
  opts: InspectTableOpts = {},
): Record<string, unknown>[] {
  const db = resolveDb();
  const tables = listTables(db);
  if (!tables.includes(tableName)) {
    throw new Error(`table not found: ${tableName}`);
  }

  const limit = Math.min(opts.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);
  const offset = opts.offset ?? 0;

  // Validate requested column names against actual schema before interpolating
  let colExpr = "*";
  if (opts.columns && opts.columns.length > 0) {
    const tableInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{
      name: string;
    }>;
    const validCols = new Set(tableInfo.map((r) => r.name));
    const safe = opts.columns.filter((c) => validCols.has(c));
    if (safe.length > 0) {
      colExpr = safe.map((c) => `"${c}"`).join(", ");
    }
  }

  return db
    .prepare(`SELECT ${colExpr} FROM "${tableName}" LIMIT ? OFFSET ?`)
    .all(limit, offset) as Record<string, unknown>[];
}

// ── Read-only SQL query ──────────────────────────────────────────────────────

/**
 * Verify a SQL string is safe to run as a read-only query.
 * Returns an error string if unsafe, null if OK.
 *
 * Rules:
 *  1. Must start with SELECT or WITH (CTE)
 *  2. No semicolons (blocks multi-statement injection)
 *  3. No write/DDL keywords as standalone tokens
 */
export function checkSqlReadOnly(sql: string): string | null {
  const normalized = sql.trim().toLowerCase();

  if (!normalized.startsWith("select") && !normalized.startsWith("with")) {
    return "only SELECT (or WITH … SELECT) statements are allowed";
  }

  if (normalized.includes(";")) {
    return "multi-statement queries are not allowed";
  }

  // Block DML/DDL keywords that have no place in a pure SELECT
  const blocked: Array<[RegExp, string]> = [
    [/\binsert\b/, "insert"],
    [/\bdelete\b/, "delete"],
    [/\bdrop\b/, "drop"],
    [/\balter\b/, "alter"],
    [/\bcreate\b/, "create"],
    [/\battach\b/, "attach"],
    [/\bdetach\b/, "detach"],
    [/\breindex\b/, "reindex"],
    [/\bvacuum\b/, "vacuum"],
    [/\breplace\b/, "replace"],
  ];

  for (const [pattern, name] of blocked) {
    if (pattern.test(normalized)) {
      return `disallowed keyword in query: ${name}`;
    }
  }

  // "update" as a standalone word — not "updated_at", "last_update_time", etc.
  // \b ensures word boundary on both sides.
  if (/\bupdate\b/.test(normalized)) {
    return "disallowed keyword in query: update";
  }

  return null;
}

export function executeReadOnlyQuery(sql: string, opts: QueryOpts = {}): Record<string, unknown>[] {
  const safetyError = checkSqlReadOnly(sql);
  if (safetyError) {
    throw new Error(safetyError);
  }

  const db = resolveDb();
  const limit = Math.min(opts.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);

  // Execute and slice — works for both plain SELECT and CTEs (WITH … SELECT)
  const rows = db.prepare(sql).all() as Record<string, unknown>[];
  return rows.slice(0, limit);
}

// ── Settings ─────────────────────────────────────────────────────────────────

function settingsTable(store: SettingsStore): string {
  return store === "core" ? "core_settings" : "op1_settings";
}

export function listSettingsFromDb(store: SettingsStore, scope?: string): SettingEntry[] {
  const db = resolveDb();
  const table = settingsTable(store);
  type Row = { scope: string; key: string; value_json: string; updated_at: number };
  let rows: Row[];

  if (scope) {
    rows = db
      .prepare(
        `SELECT scope, key, value_json, updated_at FROM "${table}" WHERE scope = ? ORDER BY scope, key`,
      )
      .all(scope) as Row[];
  } else {
    rows = db
      .prepare(`SELECT scope, key, value_json, updated_at FROM "${table}" ORDER BY scope, key`)
      .all() as Row[];
  }

  return rows.map((r) => ({
    scope: r.scope,
    key: r.key,
    value: tryParseJson(r.value_json),
    updatedAt: r.updated_at,
  }));
}

export function getSettingFromDb(
  store: SettingsStore,
  scope: string,
  key: string,
): SettingEntry | null {
  const db = resolveDb();
  const table = settingsTable(store);
  const row = db
    .prepare(
      `SELECT scope, key, value_json, updated_at FROM "${table}" WHERE scope = ? AND key = ?`,
    )
    .get(scope, key) as
    | { scope: string; key: string; value_json: string; updated_at: number }
    | undefined;

  if (!row) {
    return null;
  }
  return {
    scope: row.scope,
    key: row.key,
    value: tryParseJson(row.value_json),
    updatedAt: row.updated_at,
  };
}

export function setSettingInDb(
  store: SettingsStore,
  scope: string,
  key: string,
  value: unknown,
): void {
  const db = resolveDb();
  const table = settingsTable(store);
  const json = JSON.stringify(value);
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO "${table}" (scope, key, value_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (scope, key)
     DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(scope, key, json, now);
}

// ── Audit trail ──────────────────────────────────────────────────────────────

export function queryAuditTrail(opts: AuditQueryOpts = {}): AuditEntry[] {
  const db = resolveDb();
  const conditions: string[] = [];
  const bindings: (string | number)[] = [];

  if (opts.table) {
    conditions.push("table_name = ?");
    bindings.push(opts.table);
  }
  if (opts.action) {
    conditions.push("action = ?");
    bindings.push(opts.action);
  }
  if (opts.since !== undefined) {
    conditions.push("created_at >= ?");
    bindings.push(opts.since);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(opts.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);

  type Row = {
    id: number;
    table_name: string;
    record_key: string;
    action: string;
    old_value: string | null;
    new_value: string | null;
    created_at: number;
  };

  const rows = db
    .prepare(
      `SELECT id, table_name, record_key, action, old_value, new_value, created_at
       FROM audit_state ${where}
       ORDER BY id DESC
       LIMIT ?`,
    )
    .all(...bindings, limit) as Row[];

  return rows.map((r) => ({
    id: r.id,
    tableName: r.table_name,
    recordKey: r.record_key,
    action: r.action,
    oldValue: r.old_value ? tryParseJson(r.old_value) : null,
    newValue: r.new_value ? tryParseJson(r.new_value) : null,
    createdAt: r.created_at,
  }));
}

// ── Export ───────────────────────────────────────────────────────────────────

export function exportTableFromDb(tableName: string): Record<string, unknown>[] {
  const db = resolveDb();
  const tables = listTables(db);
  if (!tables.includes(tableName)) {
    throw new Error(`table not found: ${tableName}`);
  }
  return db.prepare(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[];
}

export function exportAllTablesFromDb(): Record<string, Record<string, unknown>[]> {
  const db = resolveDb();
  const tables = listTables(db);
  const result: Record<string, Record<string, unknown>[]> = {};
  for (const t of tables) {
    result[t] = db.prepare(`SELECT * FROM "${t}"`).all() as Record<string, unknown>[];
  }
  return result;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
