/**
 * SQLite adapter for the workspace_state table.
 *
 * Replaces {workspace}/.openclaw/workspace-state.json with rows in the
 * workspace_state table, keyed by a deterministic workspace ID derived
 * from the workspace directory path.
 *
 * Schema: workspace_state(workspace_id TEXT PK, workspace_path TEXT, agent_id TEXT,
 *                         state_json TEXT, updated_at INTEGER)
 */
import crypto from "node:crypto";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setWorkspaceStateDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetWorkspaceStateDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Derive a stable workspace ID from its absolute directory path. */
function deriveWorkspaceId(workspacePath: string): string {
  const normalized = path.resolve(workspacePath);
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

// ── Read ────────────────────────────────────────────────────────────────────

export function getWorkspaceStateFromDb<T = unknown>(workspacePath: string): T | null {
  const db = resolveDb();
  const wsId = deriveWorkspaceId(workspacePath);
  try {
    const row = db
      .prepare("SELECT state_json FROM workspace_state WHERE workspace_id = ?")
      .get(wsId) as { state_json: string | null } | undefined;
    if (!row || row.state_json == null) {
      return null;
    }
    return JSON.parse(row.state_json) as T;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

// ── Write ───────────────────────────────────────────────────────────────────

export function setWorkspaceStateInDb(workspacePath: string, state: unknown, agentId = ""): void {
  const db = resolveDb();
  const wsId = deriveWorkspaceId(workspacePath);
  const normalized = path.resolve(workspacePath);
  const json = JSON.stringify(state);
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(
      `INSERT INTO workspace_state (workspace_id, workspace_path, agent_id, state_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (workspace_id) DO UPDATE SET
         state_json = excluded.state_json,
         workspace_path = excluded.workspace_path,
         updated_at = excluded.updated_at`,
    ).run(wsId, normalized, agentId, json, now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

// ── Delete ──────────────────────────────────────────────────────────────────

export function deleteWorkspaceStateFromDb(workspacePath: string): boolean {
  const db = resolveDb();
  const wsId = deriveWorkspaceId(workspacePath);
  try {
    const result = db.prepare("DELETE FROM workspace_state WHERE workspace_id = ?").run(wsId);
    return Number(result.changes) > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}
