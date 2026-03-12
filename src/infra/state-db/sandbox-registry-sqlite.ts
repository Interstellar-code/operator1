/**
 * SQLite adapter for sandbox container and browser registries.
 *
 * Replaces:
 *   ~/.openclaw/sandbox/containers.json → op1_sandbox_containers rows
 *   ~/.openclaw/sandbox/browsers.json   → op1_sandbox_browsers rows
 */
import type { DatabaseSync } from "node:sqlite";
import type {
  SandboxBrowserRegistryEntry,
  SandboxRegistryEntry,
} from "../../agents/sandbox/registry.js";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setSandboxRegistryDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetSandboxRegistryDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Sandbox containers ───────────────────────────────────────────────────────

export function getSandboxContainersFromDb(): SandboxRegistryEntry[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT data_json FROM op1_sandbox_containers ORDER BY updated_at ASC")
      .all() as Array<{ data_json: string }>;
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as SandboxRegistryEntry;
        } catch {
          return null;
        }
      })
      .filter((r): r is SandboxRegistryEntry => r != null);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function upsertSandboxContainerInDb(entry: SandboxRegistryEntry): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    // Preserve original createdAtMs from existing row if present
    const existing = db
      .prepare("SELECT data_json FROM op1_sandbox_containers WHERE container_name = ?")
      .get(entry.containerName) as { data_json: string } | undefined;
    const merged: SandboxRegistryEntry = existing
      ? {
          ...entry,
          createdAtMs: (JSON.parse(existing.data_json) as SandboxRegistryEntry).createdAtMs,
        }
      : entry;
    db.prepare(
      `INSERT INTO op1_sandbox_containers (container_name, data_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (container_name) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
    ).run(merged.containerName, JSON.stringify(merged), now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

export function deleteSandboxContainerFromDb(containerName: string): boolean {
  const db = resolveDb();
  try {
    const result = db
      .prepare("DELETE FROM op1_sandbox_containers WHERE container_name = ?")
      .run(containerName);
    return Number(result.changes) > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}

// ── Sandbox browsers ─────────────────────────────────────────────────────────

export function getSandboxBrowsersFromDb(): SandboxBrowserRegistryEntry[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT data_json FROM op1_sandbox_browsers ORDER BY updated_at ASC")
      .all() as Array<{ data_json: string }>;
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as SandboxBrowserRegistryEntry;
        } catch {
          return null;
        }
      })
      .filter((r): r is SandboxBrowserRegistryEntry => r != null);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function upsertSandboxBrowserInDb(entry: SandboxBrowserRegistryEntry): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    // Preserve original createdAtMs from existing row if present
    const existing = db
      .prepare("SELECT data_json FROM op1_sandbox_browsers WHERE container_name = ?")
      .get(entry.containerName) as { data_json: string } | undefined;
    const merged: SandboxBrowserRegistryEntry = existing
      ? {
          ...entry,
          createdAtMs: (JSON.parse(existing.data_json) as SandboxBrowserRegistryEntry).createdAtMs,
        }
      : entry;
    db.prepare(
      `INSERT INTO op1_sandbox_browsers (container_name, data_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (container_name) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
    ).run(merged.containerName, JSON.stringify(merged), now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

export function deleteSandboxBrowserFromDb(containerName: string): boolean {
  const db = resolveDb();
  try {
    const result = db
      .prepare("DELETE FROM op1_sandbox_browsers WHERE container_name = ?")
      .run(containerName);
    return Number(result.changes) > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}
