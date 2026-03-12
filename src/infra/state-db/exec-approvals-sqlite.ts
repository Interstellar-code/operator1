/**
 * SQLite adapter for exec approvals — security-sensitive config + allowlist.
 *
 * Replaces ~/.openclaw/exec-approvals.json with two SQLite stores:
 *   - core_settings(scope='exec-approvals', key='config') → socket + defaults + per-agent defaults
 *   - security_exec_approvals → one row per allowlist entry per agent
 *
 * The adapter reconstructs `ExecApprovalsFile` for backward compat with
 * consumers that still operate on the full file structure.
 */
import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  ExecAllowlistEntry,
  ExecApprovalsAgent,
  ExecApprovalsDefaults,
  ExecApprovalsFile,
} from "../exec-approvals.js";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setExecApprovalsDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetExecApprovalsDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Types ───────────────────────────────────────────────────────────────────

/** Config stored in core_settings — everything except per-agent allowlist arrays. */
type ExecApprovalsConfig = {
  socket?: { path?: string; token?: string };
  defaults?: ExecApprovalsDefaults;
  /** Per-agent defaults (security/ask/askFallback/autoAllowSkills) without allowlist. */
  agents?: Record<string, Omit<ExecApprovalsAgent, "allowlist">>;
};

// ── Read ────────────────────────────────────────────────────────────────────

function loadConfigFromDb(): ExecApprovalsConfig | null {
  const db = resolveDb();
  try {
    const row = db
      .prepare("SELECT value_json FROM core_settings WHERE scope = ? AND key = ?")
      .get("exec-approvals", "config") as { value_json: string | null } | undefined;
    if (!row || row.value_json == null) {
      return null;
    }
    return JSON.parse(row.value_json) as ExecApprovalsConfig;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

function loadAllowlistEntriesFromDb(): Map<string, ExecAllowlistEntry[]> {
  const db = resolveDb();
  const map = new Map<string, ExecAllowlistEntry[]>();
  try {
    const rows = db
      .prepare(
        `SELECT approval_id, agent_id, pattern, last_used_at, last_used_command, last_resolved_path
         FROM security_exec_approvals
         WHERE kind = 'allowlist'
         ORDER BY created_at`,
      )
      .all() as Array<{
      approval_id: string;
      agent_id: string;
      pattern: string | null;
      last_used_at: number | null;
      last_used_command: string | null;
      last_resolved_path: string | null;
    }>;
    for (const row of rows) {
      const agentId = row.agent_id;
      const entry: ExecAllowlistEntry = {
        id: row.approval_id,
        pattern: row.pattern ?? "",
      };
      if (row.last_used_at != null) {
        entry.lastUsedAt = row.last_used_at * 1000; // epoch seconds → ms
      }
      if (row.last_used_command != null) {
        entry.lastUsedCommand = row.last_used_command;
      }
      if (row.last_resolved_path != null) {
        entry.lastResolvedPath = row.last_resolved_path;
      }
      const list = map.get(agentId) ?? [];
      list.push(entry);
      map.set(agentId, list);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return map;
    }
    throw err;
  }
  return map;
}

/** Reconstruct the full ExecApprovalsFile from SQLite stores. */
export function loadExecApprovalsFromDb(): ExecApprovalsFile | null {
  const config = loadConfigFromDb();
  if (config == null) {
    return null;
  }
  const allowlistMap = loadAllowlistEntriesFromDb();
  const agents: Record<string, ExecApprovalsAgent> = {};

  // Merge config agents with their allowlist entries
  if (config.agents) {
    for (const [agentId, agentConfig] of Object.entries(config.agents)) {
      agents[agentId] = {
        ...agentConfig,
        allowlist: allowlistMap.get(agentId),
      };
    }
  }

  // Add agents that only have allowlist entries but no config
  for (const [agentId, entries] of allowlistMap) {
    if (!agents[agentId]) {
      agents[agentId] = { allowlist: entries };
    }
  }

  return {
    version: 1,
    socket: config.socket,
    defaults: config.defaults,
    agents,
  };
}

/** Load allowlist entries for a specific agent from DB. */
export function getAgentAllowlistFromDb(agentId: string): ExecAllowlistEntry[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare(
        `SELECT approval_id, pattern, last_used_at, last_used_command, last_resolved_path
         FROM security_exec_approvals
         WHERE agent_id = ? AND kind = 'allowlist'
         ORDER BY created_at`,
      )
      .all(agentId) as Array<{
      approval_id: string;
      pattern: string | null;
      last_used_at: number | null;
      last_used_command: string | null;
      last_resolved_path: string | null;
    }>;
    return rows.map((row) => {
      const entry: ExecAllowlistEntry = {
        id: row.approval_id,
        pattern: row.pattern ?? "",
      };
      if (row.last_used_at != null) {
        entry.lastUsedAt = row.last_used_at * 1000;
      }
      if (row.last_used_command != null) {
        entry.lastUsedCommand = row.last_used_command;
      }
      if (row.last_resolved_path != null) {
        entry.lastResolvedPath = row.last_resolved_path;
      }
      return entry;
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

// ── Write ───────────────────────────────────────────────────────────────────

function saveConfigToDb(config: ExecApprovalsConfig): void {
  const db = resolveDb();
  const json = JSON.stringify(config);
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(
      `INSERT INTO core_settings (scope, key, value_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (scope, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run("exec-approvals", "config", json, now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

function replaceAllowlistEntriesInDb(agents: Record<string, ExecApprovalsAgent>): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    db.exec("DELETE FROM security_exec_approvals WHERE kind = 'allowlist'");
    const stmt = db.prepare(
      `INSERT INTO security_exec_approvals
       (approval_id, agent_id, kind, pattern, last_used_at, last_used_command, last_resolved_path, created_at)
       VALUES (?, ?, 'allowlist', ?, ?, ?, ?, ?)`,
    );
    for (const [agentId, agent] of Object.entries(agents)) {
      if (!Array.isArray(agent.allowlist)) {
        continue;
      }
      for (const entry of agent.allowlist) {
        const id = entry.id ?? crypto.randomUUID();
        const lastUsedAt = entry.lastUsedAt != null ? Math.floor(entry.lastUsedAt / 1000) : null;
        stmt.run(
          id,
          agentId,
          entry.pattern,
          lastUsedAt,
          entry.lastUsedCommand ?? null,
          entry.lastResolvedPath ?? null,
          now,
        );
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

/** Save the full ExecApprovalsFile to SQLite (config + allowlist). */
export function saveExecApprovalsToDb(file: ExecApprovalsFile): void {
  // Split into config (without allowlist arrays) and allowlist entries
  const agentsConfig: Record<string, Omit<ExecApprovalsAgent, "allowlist">> = {};
  if (file.agents) {
    for (const [agentId, agent] of Object.entries(file.agents)) {
      const { allowlist: _, ...config } = agent;
      agentsConfig[agentId] = config;
    }
  }

  const config: ExecApprovalsConfig = {
    socket: file.socket,
    defaults: file.defaults,
    agents: agentsConfig,
  };

  saveConfigToDb(config);
  replaceAllowlistEntriesInDb(file.agents ?? {});
}

/** Add a single allowlist entry for an agent. */
export function addAllowlistEntryInDb(agentId: string, entry: ExecAllowlistEntry): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  const id = entry.id ?? crypto.randomUUID();
  const lastUsedAt = entry.lastUsedAt != null ? Math.floor(entry.lastUsedAt / 1000) : null;
  try {
    db.prepare(
      `INSERT INTO security_exec_approvals
       (approval_id, agent_id, kind, pattern, last_used_at, last_used_command, last_resolved_path, created_at)
       VALUES (?, ?, 'allowlist', ?, ?, ?, ?, ?)`,
    ).run(
      id,
      agentId,
      entry.pattern,
      lastUsedAt,
      entry.lastUsedCommand ?? null,
      entry.lastResolvedPath ?? null,
      now,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

/** Update usage stats on an existing allowlist entry. */
export function recordAllowlistUseInDb(
  agentId: string,
  pattern: string,
  command: string,
  resolvedPath?: string,
): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    const result = db
      .prepare(
        `UPDATE security_exec_approvals
         SET last_used_at = ?, last_used_command = ?, last_resolved_path = ?
         WHERE agent_id = ? AND pattern = ? AND kind = 'allowlist'`,
      )
      .run(now, command, resolvedPath ?? null, agentId, pattern);
    // If no row matched, the entry might not have an id yet — try by pattern
    if (Number(result.changes) === 0) {
      // Entry doesn't exist in DB yet — create it
      addAllowlistEntryInDb(agentId, {
        id: crypto.randomUUID(),
        pattern,
        lastUsedAt: Date.now(),
        lastUsedCommand: command,
        lastResolvedPath: resolvedPath,
      });
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

/** Check if any allowlist entry exists for an agent with the given pattern. */
export function hasAllowlistEntryInDb(agentId: string, pattern: string): boolean {
  const db = resolveDb();
  try {
    const row = db
      .prepare(
        "SELECT 1 FROM security_exec_approvals WHERE agent_id = ? AND pattern = ? AND kind = 'allowlist'",
      )
      .get(agentId, pattern) as Record<string, unknown> | undefined;
    return row != null;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}

/** Compute a hash of the current exec approvals state (config + allowlist). */
export function computeExecApprovalsDbHash(): string {
  const config = loadConfigFromDb();
  const allowlistMap = loadAllowlistEntriesFromDb();
  const data = JSON.stringify({ config, allowlist: Object.fromEntries(allowlistMap) });
  return crypto.createHash("sha256").update(data).digest("hex");
}

/** Ensure agent config entry exists in the config blob. */
export function ensureAgentConfigInDb(agentId: string): void {
  const config = loadConfigFromDb() ?? {};
  if (!config.agents) {
    config.agents = {};
  }
  if (!config.agents[agentId]) {
    config.agents[agentId] = {};
    saveConfigToDb(config);
  }
}
