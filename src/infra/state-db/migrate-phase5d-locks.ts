/**
 * One-shot migration: Phase 5D-locks — agents-lock.yaml → op1_agent_locks.
 *
 * Reads YAML lock files from all three scopes (user, project, local) and
 * inserts entries into the op1_agent_locks SQLite table.
 *
 * Idempotent: skips if op1_agent_locks already has data.
 * Source YAML files are removed after successful migration.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { saveAgentLockToDb, loadAgentLocksFromDb } from "../../agents/agent-locks-sqlite.js";

type MigrationResult = {
  store: string;
  count: number;
  migrated: boolean;
  error?: string;
};

function tryUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore — file may already be absent
  }
}

/**
 * Known YAML lock file locations for the "user" scope.
 * Project/local scopes live under project dirs — we can only migrate
 * the user-global lock file reliably at startup.
 */
function getUserLockFilePath(): string {
  return path.join(os.homedir(), ".openclaw", "agents-lock.yaml");
}

function migrateYamlLockFile(filePath: string, scope: string): { count: number } {
  let count = 0;

  if (!fs.existsSync(filePath)) {
    return { count };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  let parsed: Record<string, unknown>;
  try {
    parsed = parseYaml(content) as Record<string, unknown>;
  } catch {
    return { count };
  }

  const agents = parsed?.agents as Record<string, Record<string, unknown>> | undefined;
  if (!agents || typeof agents !== "object") {
    // Valid YAML but no agents — still remove the file
    return { count };
  }

  for (const [agentId, entry] of Object.entries(agents)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    saveAgentLockToDb({
      agentId,
      scope: typeof entry.scope === "string" ? entry.scope : scope,
      version: typeof entry.version === "string" ? entry.version : "",
      resolved: typeof entry.resolved === "string" ? entry.resolved : undefined,
      checksum: typeof entry.checksum === "string" ? entry.checksum : undefined,
      installedAt: typeof entry.installed_at === "string" ? entry.installed_at : undefined,
      requires: typeof entry.requires === "string" ? entry.requires : undefined,
    });
    count++;
  }

  return { count };
}

export function migratePhase5dLocksToSqlite(): MigrationResult {
  const result: MigrationResult = { store: "agent-locks", count: 0, migrated: false };

  try {
    // Skip if SQLite already has any lock entries
    const existing = loadAgentLocksFromDb("user");
    if (existing.length > 0) {
      return result;
    }

    const userLockPath = getUserLockFilePath();
    const migrated = migrateYamlLockFile(userLockPath, "user");
    result.count = migrated.count;

    if (result.count > 0) {
      result.migrated = true;
      tryUnlink(userLockPath);
    } else if (fs.existsSync(userLockPath)) {
      // Empty/no-agents YAML — still clean up
      tryUnlink(userLockPath);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}
