import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { getConfigRawFromDb, resetConfigDbForTest, setConfigDbForTest } from "./config-sqlite.js";
import { migratePhase6aToSqlite } from "./migrate-phase6a.js";
import { runMigrations } from "./schema.js";

describe("migratePhase6aToSqlite", () => {
  let tmpDir: string;
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openclaw-phase6a-test-"));
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setConfigDbForTest(db);
  });

  afterEach(async () => {
    resetConfigDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  function makeEnv(stateDir: string): NodeJS.ProcessEnv {
    return { OPENCLAW_STATE_DIR: stateDir };
  }

  test("migrates openclaw.json raw content to op1_config and deletes file", async () => {
    const raw = '{ "gateway": { "mode": "local", "port": 18789 } }';
    const configPath = path.join(tmpDir, "openclaw.json");
    fs.writeFileSync(configPath, raw, "utf-8");

    const results = migratePhase6aToSqlite(makeEnv(tmpDir));

    expect(results).toHaveLength(1);
    expect(results[0].migrated).toBe(true);
    expect(results[0].count).toBe(1);
    expect(results[0].error).toBeUndefined();

    // Content is in SQLite
    expect(getConfigRawFromDb()).toBe(raw);
    // File is deleted
    expect(fs.existsSync(configPath)).toBe(false);
  });

  test("is idempotent — skips if op1_config already has data", async () => {
    const raw = '{ "gateway": { "mode": "local" } }';
    const configPath = path.join(tmpDir, "openclaw.json");
    fs.writeFileSync(configPath, raw, "utf-8");

    // First migration
    migratePhase6aToSqlite(makeEnv(tmpDir));
    expect(getConfigRawFromDb()).toBe(raw);

    // Write a different file — second migration should skip
    const newRaw = '{ "gateway": { "mode": "remote" } }';
    fs.writeFileSync(configPath, newRaw, "utf-8");
    const results = migratePhase6aToSqlite(makeEnv(tmpDir));

    expect(results[0].migrated).toBe(false);
    // SQLite still has original content
    expect(getConfigRawFromDb()).toBe(raw);
    // File is still deleted (because we delete it even when skipping)
    expect(fs.existsSync(configPath)).toBe(false);
  });

  test("skips missing openclaw.json without error", async () => {
    const results = migratePhase6aToSqlite(makeEnv(tmpDir));

    expect(results).toHaveLength(1);
    expect(results[0].migrated).toBe(false);
    expect(results[0].count).toBe(0);
    expect(results[0].error).toBeUndefined();
    expect(getConfigRawFromDb()).toBeNull();
  });

  test("skips migration when OPENCLAW_CONFIG_PATH is set", async () => {
    const raw = '{ "gateway": { "mode": "local" } }';
    const configPath = path.join(tmpDir, "openclaw.json");
    fs.writeFileSync(configPath, raw, "utf-8");

    const env: NodeJS.ProcessEnv = {
      OPENCLAW_STATE_DIR: tmpDir,
      OPENCLAW_CONFIG_PATH: configPath,
    };
    const results = migratePhase6aToSqlite(env);

    expect(results[0].migrated).toBe(false);
    // File preserved (user-managed explicit path)
    expect(fs.existsSync(configPath)).toBe(true);
    expect(getConfigRawFromDb()).toBeNull();
  });

  test("preserves JSON5 content with comments and env-var references exactly", async () => {
    const raw = `{
  // Gateway configuration
  "gateway": {
    "mode": "local",
    "auth": { "token": "\${OPENCLAW_GATEWAY_TOKEN}" }
  }
}`;
    const configPath = path.join(tmpDir, "openclaw.json");
    fs.writeFileSync(configPath, raw, "utf-8");

    migratePhase6aToSqlite(makeEnv(tmpDir));
    expect(getConfigRawFromDb()).toBe(raw);
  });
});
