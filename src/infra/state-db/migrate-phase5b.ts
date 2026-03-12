/**
 * One-shot migration: Phase 5B sandbox registry JSON files → SQLite.
 *
 * Covers:
 *   ~/.openclaw/sandbox/containers.json → op1_sandbox_containers rows
 *   ~/.openclaw/sandbox/browsers.json   → op1_sandbox_browsers rows
 *
 * Each migrator is idempotent: skips if DB already has data.
 * Files are removed after migration.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  SandboxBrowserRegistryEntry,
  SandboxRegistryEntry,
} from "../../agents/sandbox/registry.js";
import { resolveStateDir } from "../../config/paths.js";
import { loadJsonFile } from "../json-file.js";
import {
  getSandboxBrowsersFromDb,
  getSandboxContainersFromDb,
  upsertSandboxBrowserInDb,
  upsertSandboxContainerInDb,
} from "./sandbox-registry-sqlite.js";

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
    // ignore
  }
}

// ── Container registry ──────────────────────────────────────────────────────

function migrateSandboxContainers(stateDir: string): MigrationResult {
  const result: MigrationResult = { store: "sandbox-containers", count: 0, migrated: false };
  const filePath = path.join(stateDir, "sandbox", "containers.json");

  try {
    if (!fs.existsSync(filePath)) {
      return result;
    }

    // Skip if DB already has data
    if (getSandboxContainersFromDb().length > 0) {
      tryUnlink(filePath);
      return result;
    }

    const raw = loadJsonFile(filePath) as { entries?: unknown[] } | null;
    if (raw && typeof raw === "object" && Array.isArray(raw.entries)) {
      for (const entry of raw.entries) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        upsertSandboxContainerInDb(entry as SandboxRegistryEntry);
        result.count++;
      }
    }
    tryUnlink(filePath);

    if (result.count > 0) {
      result.migrated = true;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Browser registry ────────────────────────────────────────────────────────

function migrateSandboxBrowsers(stateDir: string): MigrationResult {
  const result: MigrationResult = { store: "sandbox-browsers", count: 0, migrated: false };
  const filePath = path.join(stateDir, "sandbox", "browsers.json");

  try {
    if (!fs.existsSync(filePath)) {
      return result;
    }

    // Skip if DB already has data
    if (getSandboxBrowsersFromDb().length > 0) {
      tryUnlink(filePath);
      return result;
    }

    const raw = loadJsonFile(filePath) as { entries?: unknown[] } | null;
    if (raw && typeof raw === "object" && Array.isArray(raw.entries)) {
      for (const entry of raw.entries) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        upsertSandboxBrowserInDb(entry as SandboxBrowserRegistryEntry);
        result.count++;
      }
    }
    tryUnlink(filePath);

    if (result.count > 0) {
      result.migrated = true;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function migratePhase5bToSqlite(env: NodeJS.ProcessEnv = process.env): MigrationResult[] {
  const stateDir = resolveStateDir(env, () => os.homedir());
  return [migrateSandboxContainers(stateDir), migrateSandboxBrowsers(stateDir)];
}
