/**
 * One-shot migration: Phase 6A gateway config JSON file → SQLite.
 *
 * Covers:
 *   ~/.openclaw/openclaw.json → op1_config (raw_json5 TEXT, id=1)
 *
 * Idempotent: skips if op1_config already has data.
 * File is removed after migration so subsequent reads come from SQLite.
 */
import fs from "node:fs";
import os from "node:os";
import { resolveConfigPath, resolveStateDir } from "../../config/paths.js";
import { getConfigRawFromDb, setConfigRawInDb } from "./config-sqlite.js";

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

function migrateGatewayConfig(configPath: string): MigrationResult {
  const result: MigrationResult = { store: "openclaw.json", count: 0, migrated: false };

  try {
    if (!fs.existsSync(configPath)) {
      return result;
    }

    // Skip if SQLite already has config (idempotent).
    if (getConfigRawFromDb() !== null) {
      tryUnlink(configPath);
      return result;
    }

    const raw = fs.readFileSync(configPath, "utf-8");
    setConfigRawInDb(raw);
    result.count = 1;
    result.migrated = true;
    tryUnlink(configPath);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

export function migratePhase6aToSqlite(env: NodeJS.ProcessEnv = process.env): MigrationResult[] {
  // OPENCLAW_CONFIG_PATH explicitly set → keep reading from file (user managed).
  if (env.OPENCLAW_CONFIG_PATH) {
    return [{ store: "openclaw.json", count: 0, migrated: false }];
  }

  const stateDir = resolveStateDir(env, () => os.homedir());
  const configPath = resolveConfigPath(env, stateDir);
  return [migrateGatewayConfig(configPath)];
}
