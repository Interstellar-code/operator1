import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import { migratePhase5bToSqlite } from "./migrate-phase5b.js";
import {
  getSandboxBrowsersFromDb,
  getSandboxContainersFromDb,
  resetSandboxRegistryDbForTest,
  setSandboxRegistryDbForTest,
} from "./sandbox-registry-sqlite.js";
import { runMigrations } from "./schema.js";

describe("migratePhase5bToSqlite", () => {
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];
  let tmpDir: string;

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setSandboxRegistryDbForTest(db);
  });

  afterEach(() => {
    resetSandboxRegistryDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  function makeStateDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-migrate-5b-"));
    return tmpDir;
  }

  function writeJsonFile(dir: string, relPath: string, data: unknown) {
    const filePath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data));
  }

  function makeEnv(stateDir: string): NodeJS.ProcessEnv {
    return { OPENCLAW_STATE_DIR: stateDir } as unknown as NodeJS.ProcessEnv;
  }

  // ── Container registry ───────────────────────────────────────────────────

  it("migrates sandbox/containers.json", () => {
    const stateDir = makeStateDir();
    writeJsonFile(stateDir, "sandbox/containers.json", {
      entries: [
        {
          containerName: "openclaw-sbx-abc",
          sessionKey: "sess-1",
          createdAtMs: 1700000000000,
          lastUsedAtMs: 1700000001000,
          image: "openclaw-sandbox:test",
          configHash: "hash-1",
        },
        {
          containerName: "openclaw-sbx-xyz",
          sessionKey: "sess-2",
          createdAtMs: 1700000002000,
          lastUsedAtMs: 1700000003000,
          image: "openclaw-sandbox:test",
        },
      ],
    });

    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    const r = results.find((r) => r.store === "sandbox-containers");

    expect(r?.migrated).toBe(true);
    expect(r?.count).toBe(2);

    const entries = getSandboxContainersFromDb();
    expect(entries).toHaveLength(2);
    const names = entries.map((e) => e.containerName).toSorted();
    expect(names).toEqual(["openclaw-sbx-abc", "openclaw-sbx-xyz"]);

    expect(fs.existsSync(path.join(stateDir, "sandbox", "containers.json"))).toBe(false);
  });

  it("skips container migration if DB already has data", () => {
    const stateDir = makeStateDir();
    writeJsonFile(stateDir, "sandbox/containers.json", {
      entries: [
        {
          containerName: "container-1",
          sessionKey: "sess-1",
          createdAtMs: 1700000000000,
          lastUsedAtMs: 1700000001000,
          image: "openclaw-sandbox:test",
        },
      ],
    });

    // First run populates DB
    migratePhase5bToSqlite(makeEnv(stateDir));

    // Write file back with different data
    writeJsonFile(stateDir, "sandbox/containers.json", {
      entries: [
        {
          containerName: "container-new",
          sessionKey: "sess-new",
          createdAtMs: 1700000000000,
          lastUsedAtMs: 1700000001000,
          image: "openclaw-sandbox:test",
        },
      ],
    });

    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    const r = results.find((r) => r.store === "sandbox-containers");
    expect(r?.migrated).toBe(false);
    // Original data preserved
    expect(getSandboxContainersFromDb()[0].containerName).toBe("container-1");
    // File cleaned up
    expect(fs.existsSync(path.join(stateDir, "sandbox", "containers.json"))).toBe(false);
  });

  it("skips missing containers.json without error", () => {
    const stateDir = makeStateDir();
    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    const r = results.find((r) => r.store === "sandbox-containers");
    expect(r?.migrated).toBe(false);
    expect(r?.error).toBeUndefined();
  });

  it("migrates containers.json with empty entries array", () => {
    const stateDir = makeStateDir();
    writeJsonFile(stateDir, "sandbox/containers.json", { entries: [] });

    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    const r = results.find((r) => r.store === "sandbox-containers");
    expect(r?.migrated).toBe(false);
    expect(r?.count).toBe(0);
    expect(fs.existsSync(path.join(stateDir, "sandbox", "containers.json"))).toBe(false);
  });

  // ── Browser registry ─────────────────────────────────────────────────────

  it("migrates sandbox/browsers.json", () => {
    const stateDir = makeStateDir();
    writeJsonFile(stateDir, "sandbox/browsers.json", {
      entries: [
        {
          containerName: "openclaw-sbx-browser-abc",
          sessionKey: "sess-1",
          createdAtMs: 1700000000000,
          lastUsedAtMs: 1700000001000,
          image: "openclaw-sandbox-browser:test",
          cdpPort: 9222,
          noVncPort: 6080,
        },
      ],
    });

    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    const r = results.find((r) => r.store === "sandbox-browsers");

    expect(r?.migrated).toBe(true);
    expect(r?.count).toBe(1);

    const entries = getSandboxBrowsersFromDb();
    expect(entries).toHaveLength(1);
    expect(entries[0].containerName).toBe("openclaw-sbx-browser-abc");
    expect(entries[0].cdpPort).toBe(9222);
    expect(entries[0].noVncPort).toBe(6080);

    expect(fs.existsSync(path.join(stateDir, "sandbox", "browsers.json"))).toBe(false);
  });

  it("skips browser migration if DB already has data", () => {
    const stateDir = makeStateDir();
    writeJsonFile(stateDir, "sandbox/browsers.json", {
      entries: [
        {
          containerName: "browser-1",
          sessionKey: "sess-1",
          createdAtMs: 1700000000000,
          lastUsedAtMs: 1700000001000,
          image: "openclaw-sandbox-browser:test",
          cdpPort: 9222,
        },
      ],
    });

    migratePhase5bToSqlite(makeEnv(stateDir));

    writeJsonFile(stateDir, "sandbox/browsers.json", {
      entries: [
        {
          containerName: "browser-new",
          sessionKey: "sess-new",
          createdAtMs: 1700000000000,
          lastUsedAtMs: 1700000001000,
          image: "openclaw-sandbox-browser:test",
          cdpPort: 9223,
        },
      ],
    });

    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    const r = results.find((r) => r.store === "sandbox-browsers");
    expect(r?.migrated).toBe(false);
    expect(getSandboxBrowsersFromDb()[0].containerName).toBe("browser-1");
    expect(fs.existsSync(path.join(stateDir, "sandbox", "browsers.json"))).toBe(false);
  });

  it("skips missing browsers.json without error", () => {
    const stateDir = makeStateDir();
    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    const r = results.find((r) => r.store === "sandbox-browsers");
    expect(r?.migrated).toBe(false);
    expect(r?.error).toBeUndefined();
  });

  it("returns all non-migrated results when no files exist", () => {
    const stateDir = makeStateDir();
    const results = migratePhase5bToSqlite(makeEnv(stateDir));
    expect(results.every((r) => !r.migrated && !r.error)).toBe(true);
  });
});
