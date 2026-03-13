/**
 * SQLite adapter for op1_memory_activity table.
 *
 * Replaces raw JSONL scanning for the memory Activity tab.
 * Schema (v12): op1_memory_activity(id, agent_id, operation, tool_name,
 *   file_path, query, snippet, session_file, created_at)
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setMemoryActivityDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetMemoryActivityDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Types ────────────────────────────────────────────────────────────────────

export type MemoryActivityRow = {
  id: number;
  agent_id: string;
  operation: string;
  tool_name: string | null;
  file_path: string | null;
  query: string | null;
  snippet: string | null;
  session_file: string | null;
  created_at: number;
};

export type MemoryActivityEntry = {
  id: number;
  agentId: string;
  operation: "search" | "read" | "write" | "edit";
  toolName: string | null;
  filePath: string | null;
  query: string | null;
  snippet: string | null;
  sessionFile: string | null;
  createdAt: number;
};

// ── Write ───────────────────────────────────────────────────────────────────

export function insertMemoryActivity(entry: {
  agentId: string;
  operation: string;
  toolName?: string;
  filePath?: string;
  query?: string;
  snippet?: string;
  sessionFile?: string;
}): void {
  const db = resolveDb();
  try {
    db.prepare(
      `INSERT INTO op1_memory_activity (agent_id, operation, tool_name, file_path, query, snippet, session_file)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.agentId,
      entry.operation,
      entry.toolName ?? null,
      entry.filePath ?? null,
      entry.query ?? null,
      entry.snippet ?? null,
      entry.sessionFile ?? null,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return; // Migration hasn't run yet
    }
    throw err;
  }
}

// ── Read ────────────────────────────────────────────────────────────────────

export type MemoryActivityQueryOptions = {
  agentId?: string;
  operation?: string;
  limit?: number;
  offset?: number;
  afterDate?: number; // unix seconds
  beforeDate?: number; // unix seconds
};

export function queryMemoryActivity(opts: MemoryActivityQueryOptions = {}): MemoryActivityEntry[] {
  const db = resolveDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts.agentId) {
    conditions.push("agent_id = ?");
    params.push(opts.agentId);
  }
  if (opts.operation) {
    conditions.push("operation = ?");
    params.push(opts.operation);
  }
  if (opts.afterDate) {
    conditions.push("created_at >= ?");
    params.push(opts.afterDate);
  }
  if (opts.beforeDate) {
    conditions.push("created_at <= ?");
    params.push(opts.beforeDate);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;

  try {
    const rows = db
      .prepare(
        `SELECT id, agent_id, operation, tool_name, file_path, query, snippet, session_file, created_at
         FROM op1_memory_activity ${where}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as MemoryActivityRow[];

    return rows.map(rowToEntry);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function countMemoryActivity(agentId?: string): number {
  const db = resolveDb();
  try {
    const row = (
      agentId
        ? db
            .prepare("SELECT COUNT(*) as cnt FROM op1_memory_activity WHERE agent_id = ?")
            .get(agentId)
        : db.prepare("SELECT COUNT(*) as cnt FROM op1_memory_activity").get()
    ) as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return 0;
    }
    throw err;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowToEntry(row: MemoryActivityRow): MemoryActivityEntry {
  return {
    id: row.id,
    agentId: row.agent_id,
    operation: row.operation as MemoryActivityEntry["operation"],
    toolName: row.tool_name,
    filePath: row.file_path,
    query: row.query,
    snippet: row.snippet,
    sessionFile: row.session_file,
    createdAt: row.created_at,
  };
}
