/**
 * Agent installation scope management.
 *
 * Handles local → project → user scope resolution, lock file paths,
 * and cross-scope dependency checking.
 */
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  loadAgentLocksFromDb,
  saveAgentLockToDb,
  deleteAgentLockFromDb,
  deleteAllAgentLocksForScope,
} from "../agents/agent-locks-sqlite.js";
import { hasAgentMdFrontmatter, parseUnifiedAgentMd } from "./agent-manifest-validation.js";
import {
  AgentManifestSchema,
  type AgentManifest,
  type AgentsLock,
} from "./zod-schema.agent-manifest.js";

// ── Scope types ──────────────────────────────────────────────────────────────

export type AgentScope = "local" | "project" | "user";

export interface ScopedAgent {
  manifest: AgentManifest;
  scope: AgentScope;
  dir: string;
}

// ── Scope paths ──────────────────────────────────────────────────────────────

/**
 * Resolve the agents directory for a given scope.
 *
 * - local:   `<projectRoot>/.openclaw/agents.local/`
 * - project: `<projectRoot>/.openclaw/agents/`
 * - user:    `~/.openclaw/agents/`
 */
export function agentsDirForScope(scope: AgentScope, projectRoot: string): string {
  switch (scope) {
    case "local":
      return join(projectRoot, ".openclaw", "agents.local");
    case "project":
      return join(projectRoot, ".openclaw", "agents");
    case "user":
      return join(homedir(), ".openclaw", "agents");
  }
}

/**
 * Resolve the lock file path for a given scope.
 */
export function lockFileForScope(scope: AgentScope, projectRoot: string): string {
  switch (scope) {
    case "local":
      return join(projectRoot, ".openclaw", "agents.local-lock.yaml");
    case "project":
      return join(projectRoot, ".openclaw", "agents-lock.yaml");
    case "user":
      return join(homedir(), ".openclaw", "agents-lock.yaml");
  }
}

// ── Scope resolution ─────────────────────────────────────────────────────────

/**
 * Resolution order: local → project → user (narrowest wins).
 * A local-scope agent with the same ID as a user-scope agent overrides it.
 */
const SCOPE_PRIORITY: AgentScope[] = ["local", "project", "user"];

/**
 * Try to load an agent manifest from a directory.
 * Tries unified AGENT.md (with frontmatter) first, then falls back to agent.yaml.
 */
async function loadManifestFromDir(agentDir: string): Promise<AgentManifest | null> {
  // Try unified AGENT.md first
  try {
    const mdContent = await readFile(join(agentDir, "AGENT.md"), "utf-8");
    if (hasAgentMdFrontmatter(mdContent)) {
      const parsed = parseUnifiedAgentMd(mdContent);
      if (!("error" in parsed)) {
        const result = AgentManifestSchema.safeParse(parsed.frontmatter);
        if (result.success) {
          return result.data;
        }
      }
    }
  } catch {
    // No AGENT.md or read error — try legacy
  }

  // Fall back to agent.yaml
  try {
    const yamlContent = await readFile(join(agentDir, "agent.yaml"), "utf-8");
    const parsed = parseYaml(yamlContent);
    const result = AgentManifestSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
  } catch {
    // No agent.yaml either
  }

  return null;
}

/**
 * Load all agents from a single scope directory.
 */
async function loadAgentsFromScope(scope: AgentScope, projectRoot: string): Promise<ScopedAgent[]> {
  const dir = agentsDirForScope(scope, projectRoot);
  let entries: string[];
  try {
    const dirEntries = await readdir(dir, { withFileTypes: true });
    entries = dirEntries.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return []; // Directory doesn't exist yet
  }

  const agents: ScopedAgent[] = [];
  for (const entry of entries) {
    const agentDir = join(dir, entry);
    const manifest = await loadManifestFromDir(agentDir);
    if (manifest) {
      agents.push({ manifest, scope, dir: agentDir });
    }
  }
  return agents;
}

/**
 * Load and merge agents from all scopes. Narrowest scope wins on ID collision.
 */
export async function resolveAllAgents(projectRoot: string): Promise<ScopedAgent[]> {
  const merged = new Map<string, ScopedAgent>();

  // Load broadest scope first (user), then narrower scopes overwrite.
  // Order: user → project → local (last write wins, so local wins on collision).
  for (const scope of [...SCOPE_PRIORITY].toReversed()) {
    const agents = await loadAgentsFromScope(scope, projectRoot);
    for (const agent of agents) {
      merged.set(agent.manifest.id, agent);
    }
  }

  return Array.from(merged.values());
}

// ── Lock operations (SQLite-backed) ──────────────────────────────────────────

/**
 * Read lock entries for a scope, returning an AgentsLock envelope.
 * Returns null if no entries exist for the scope.
 */
export async function readLockFile(
  scope: AgentScope,
  _projectRoot: string,
): Promise<AgentsLock | null> {
  const rows = loadAgentLocksFromDb(scope);
  if (rows.length === 0) {
    return null;
  }
  const agents: NonNullable<AgentsLock["agents"]> = {};
  for (const row of rows) {
    agents[row.agentId] = {
      version: row.version,
      resolved: row.resolved,
      checksum: row.checksum,
      installed_at: row.installedAt ?? new Date().toISOString(),
      scope: row.scope as AgentScope,
      requires: row.requires,
    };
  }
  return { lockfile_version: 1, agents };
}

/**
 * Write a full lock set for a scope (replaces all entries for that scope).
 */
export async function writeLockFile(
  scope: AgentScope,
  _projectRoot: string,
  lock: AgentsLock,
): Promise<void> {
  deleteAllAgentLocksForScope(scope);
  if (!lock.agents) {
    return;
  }
  for (const [agentId, entry] of Object.entries(lock.agents)) {
    saveAgentLockToDb({
      agentId,
      scope,
      version: entry.version,
      resolved: entry.resolved,
      checksum: entry.checksum,
      installedAt: entry.installed_at,
      requires: entry.requires,
    });
  }
}

/**
 * Add or update an agent entry in the lock store.
 */
export async function addToLockFile(
  scope: AgentScope,
  _projectRoot: string,
  agentId: string,
  entry: {
    version: string;
    resolved?: string;
    checksum?: string;
    requires?: string;
  },
): Promise<void> {
  saveAgentLockToDb({
    agentId,
    scope,
    version: entry.version,
    resolved: entry.resolved,
    checksum: entry.checksum,
    installedAt: new Date().toISOString(),
    requires: entry.requires,
  });
}

/**
 * Remove an agent entry from the lock store.
 */
export async function removeFromLockFile(
  scope: AgentScope,
  _projectRoot: string,
  agentId: string,
): Promise<void> {
  deleteAgentLockFromDb(agentId, scope);
}
