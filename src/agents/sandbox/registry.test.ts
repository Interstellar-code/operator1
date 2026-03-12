import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetSandboxRegistryDbForTest,
  setSandboxRegistryDbForTest,
} from "../../infra/state-db/sandbox-registry-sqlite.js";
import { runMigrations } from "../../infra/state-db/schema.js";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import type { SandboxBrowserRegistryEntry, SandboxRegistryEntry } from "./registry.js";
import {
  readBrowserRegistry,
  readRegistry,
  removeBrowserRegistryEntry,
  removeRegistryEntry,
  updateBrowserRegistry,
  updateRegistry,
} from "./registry.js";

describe("sandbox registry (SQLite)", () => {
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

  function containerEntry(overrides: Partial<SandboxRegistryEntry> = {}): SandboxRegistryEntry {
    return {
      containerName: "container-a",
      sessionKey: "agent:main",
      createdAtMs: 1000,
      lastUsedAtMs: 1000,
      image: "openclaw-sandbox:test",
      ...overrides,
    };
  }

  function browserEntry(
    overrides: Partial<SandboxBrowserRegistryEntry> = {},
  ): SandboxBrowserRegistryEntry {
    return {
      containerName: "browser-a",
      sessionKey: "agent:main",
      createdAtMs: 2000,
      lastUsedAtMs: 2000,
      image: "openclaw-browser:test",
      cdpPort: 9222,
      ...overrides,
    };
  }

  // ── Container registry ───────────────────────────────────────────────────

  it("reads an empty container registry", async () => {
    const registry = await readRegistry();
    expect(registry.entries).toEqual([]);
  });

  it("inserts and reads a container entry", async () => {
    await updateRegistry(containerEntry());
    const registry = await readRegistry();
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].containerName).toBe("container-a");
    expect(registry.entries[0].image).toBe("openclaw-sandbox:test");
  });

  it("updates a container entry (upsert)", async () => {
    await updateRegistry(containerEntry({ configHash: "v1" }));
    await updateRegistry(containerEntry({ configHash: "v2", lastUsedAtMs: 9999 }));
    const registry = await readRegistry();
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].configHash).toBe("v2");
    expect(registry.entries[0].lastUsedAtMs).toBe(9999);
  });

  it("preserves original createdAtMs on container upsert", async () => {
    await updateRegistry(containerEntry({ createdAtMs: 111 }));
    await updateRegistry(containerEntry({ createdAtMs: 99999, lastUsedAtMs: 5000 }));
    const registry = await readRegistry();
    expect(registry.entries[0].createdAtMs).toBe(111);
    expect(registry.entries[0].lastUsedAtMs).toBe(5000);
  });

  it("stores multiple container entries", async () => {
    await updateRegistry(containerEntry({ containerName: "container-a" }));
    await updateRegistry(containerEntry({ containerName: "container-b" }));
    const registry = await readRegistry();
    expect(registry.entries).toHaveLength(2);
    const names = registry.entries.map((e) => e.containerName).toSorted();
    expect(names).toEqual(["container-a", "container-b"]);
  });

  it("removes a container entry", async () => {
    await updateRegistry(containerEntry());
    await removeRegistryEntry("container-a");
    const registry = await readRegistry();
    expect(registry.entries).toHaveLength(0);
  });

  it("removing a non-existent container is a no-op", async () => {
    await updateRegistry(containerEntry({ containerName: "container-a" }));
    await removeRegistryEntry("no-such");
    const registry = await readRegistry();
    expect(registry.entries).toHaveLength(1);
  });

  // ── Browser registry ─────────────────────────────────────────────────────

  it("reads an empty browser registry", async () => {
    const registry = await readBrowserRegistry();
    expect(registry.entries).toEqual([]);
  });

  it("inserts and reads a browser entry", async () => {
    await updateBrowserRegistry(browserEntry());
    const registry = await readBrowserRegistry();
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].containerName).toBe("browser-a");
    expect(registry.entries[0].cdpPort).toBe(9222);
  });

  it("updates a browser entry (upsert)", async () => {
    await updateBrowserRegistry(browserEntry({ configHash: "v1" }));
    await updateBrowserRegistry(browserEntry({ configHash: "v2", lastUsedAtMs: 8888 }));
    const registry = await readBrowserRegistry();
    expect(registry.entries).toHaveLength(1);
    expect(registry.entries[0].configHash).toBe("v2");
    expect(registry.entries[0].lastUsedAtMs).toBe(8888);
  });

  it("preserves original createdAtMs on browser upsert", async () => {
    await updateBrowserRegistry(browserEntry({ createdAtMs: 222 }));
    await updateBrowserRegistry(browserEntry({ createdAtMs: 99999, lastUsedAtMs: 6000 }));
    const registry = await readBrowserRegistry();
    expect(registry.entries[0].createdAtMs).toBe(222);
    expect(registry.entries[0].lastUsedAtMs).toBe(6000);
  });

  it("stores browser optional fields (noVncPort)", async () => {
    await updateBrowserRegistry(browserEntry({ noVncPort: 6080 }));
    const registry = await readBrowserRegistry();
    expect(registry.entries[0].noVncPort).toBe(6080);
  });

  it("stores multiple browser entries", async () => {
    await updateBrowserRegistry(browserEntry({ containerName: "browser-a", cdpPort: 9222 }));
    await updateBrowserRegistry(browserEntry({ containerName: "browser-b", cdpPort: 9223 }));
    const registry = await readBrowserRegistry();
    expect(registry.entries).toHaveLength(2);
    const names = registry.entries.map((e) => e.containerName).toSorted();
    expect(names).toEqual(["browser-a", "browser-b"]);
  });

  it("removes a browser entry", async () => {
    await updateBrowserRegistry(browserEntry());
    await removeBrowserRegistryEntry("browser-a");
    const registry = await readBrowserRegistry();
    expect(registry.entries).toHaveLength(0);
  });

  it("removing a non-existent browser is a no-op", async () => {
    await updateBrowserRegistry(browserEntry({ containerName: "browser-a" }));
    await removeBrowserRegistryEntry("no-such");
    const registry = await readBrowserRegistry();
    expect(registry.entries).toHaveLength(1);
  });

  // ── Isolation between container and browser tables ───────────────────────

  it("container and browser registries are independent", async () => {
    await updateRegistry(containerEntry());
    await updateBrowserRegistry(browserEntry());

    const containers = await readRegistry();
    const browsers = await readBrowserRegistry();

    expect(containers.entries).toHaveLength(1);
    expect(containers.entries[0].containerName).toBe("container-a");
    expect(browsers.entries).toHaveLength(1);
    expect(browsers.entries[0].containerName).toBe("browser-a");
  });
});
