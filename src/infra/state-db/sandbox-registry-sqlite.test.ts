import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  SandboxBrowserRegistryEntry,
  SandboxRegistryEntry,
} from "../../agents/sandbox/registry.js";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import {
  deleteSandboxBrowserFromDb,
  deleteSandboxContainerFromDb,
  getSandboxBrowsersFromDb,
  getSandboxContainersFromDb,
  resetSandboxRegistryDbForTest,
  setSandboxRegistryDbForTest,
  upsertSandboxBrowserInDb,
  upsertSandboxContainerInDb,
} from "./sandbox-registry-sqlite.js";
import { runMigrations } from "./schema.js";

describe("sandbox-registry-sqlite", () => {
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

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
  });

  const container1: SandboxRegistryEntry = {
    containerName: "openclaw-sandbox-abc123",
    sessionKey: "sess-1",
    createdAtMs: 1700000000000,
    lastUsedAtMs: 1700000001000,
    image: "openclaw/sandbox:latest",
    configHash: "hash-1",
  };

  const browser1: SandboxBrowserRegistryEntry = {
    containerName: "openclaw-browser-def456",
    sessionKey: "sess-2",
    createdAtMs: 1700000002000,
    lastUsedAtMs: 1700000003000,
    image: "openclaw/browser:latest",
    cdpPort: 9222,
    noVncPort: 6080,
  };

  // ── Containers ─────────────────────────────────────────────────────────────

  it("inserts and retrieves a container entry", () => {
    upsertSandboxContainerInDb(container1);
    const entries = getSandboxContainersFromDb();
    expect(entries).toHaveLength(1);
    expect(entries[0].containerName).toBe("openclaw-sandbox-abc123");
    expect(entries[0].sessionKey).toBe("sess-1");
    expect(entries[0].image).toBe("openclaw/sandbox:latest");
    expect(entries[0].configHash).toBe("hash-1");
  });

  it("lists multiple container entries", () => {
    const container2: SandboxRegistryEntry = {
      ...container1,
      containerName: "openclaw-sandbox-xyz789",
      sessionKey: "sess-3",
    };
    upsertSandboxContainerInDb(container1);
    upsertSandboxContainerInDb(container2);
    const entries = getSandboxContainersFromDb();
    expect(entries).toHaveLength(2);
  });

  it("preserves original createdAtMs on upsert", () => {
    upsertSandboxContainerInDb(container1);
    const updated: SandboxRegistryEntry = {
      ...container1,
      lastUsedAtMs: 1700000099000,
      createdAtMs: 9999999999999, // should be ignored
    };
    upsertSandboxContainerInDb(updated);
    const entries = getSandboxContainersFromDb();
    expect(entries).toHaveLength(1);
    expect(entries[0].createdAtMs).toBe(1700000000000);
    expect(entries[0].lastUsedAtMs).toBe(1700000099000);
  });

  it("deletes a container entry", () => {
    upsertSandboxContainerInDb(container1);
    const deleted = deleteSandboxContainerFromDb("openclaw-sandbox-abc123");
    expect(deleted).toBe(true);
    expect(getSandboxContainersFromDb()).toHaveLength(0);
  });

  it("returns false when deleting non-existent container", () => {
    expect(deleteSandboxContainerFromDb("no-such")).toBe(false);
  });

  it("returns empty array when no containers", () => {
    expect(getSandboxContainersFromDb()).toEqual([]);
  });

  // ── Browsers ───────────────────────────────────────────────────────────────

  it("inserts and retrieves a browser entry", () => {
    upsertSandboxBrowserInDb(browser1);
    const entries = getSandboxBrowsersFromDb();
    expect(entries).toHaveLength(1);
    expect(entries[0].containerName).toBe("openclaw-browser-def456");
    expect(entries[0].cdpPort).toBe(9222);
    expect(entries[0].noVncPort).toBe(6080);
  });

  it("preserves original createdAtMs on browser upsert", () => {
    upsertSandboxBrowserInDb(browser1);
    const updated: SandboxBrowserRegistryEntry = {
      ...browser1,
      lastUsedAtMs: 1700000099000,
      createdAtMs: 9999999999999,
    };
    upsertSandboxBrowserInDb(updated);
    const entries = getSandboxBrowsersFromDb();
    expect(entries).toHaveLength(1);
    expect(entries[0].createdAtMs).toBe(1700000002000);
    expect(entries[0].lastUsedAtMs).toBe(1700000099000);
  });

  it("deletes a browser entry", () => {
    upsertSandboxBrowserInDb(browser1);
    const deleted = deleteSandboxBrowserFromDb("openclaw-browser-def456");
    expect(deleted).toBe(true);
    expect(getSandboxBrowsersFromDb()).toHaveLength(0);
  });

  it("returns false when deleting non-existent browser", () => {
    expect(deleteSandboxBrowserFromDb("no-such")).toBe(false);
  });

  it("returns empty array when no browsers", () => {
    expect(getSandboxBrowsersFromDb()).toEqual([]);
  });
});
