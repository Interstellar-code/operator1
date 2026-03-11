import { describe, expect, it } from "vitest";
import { diffLockFile, generateLockFile } from "./lock-file.js";
import type { McpLockFile } from "./lock-file.js";
import type { McpServerConfig } from "./types.js";

describe("generateLockFile", () => {
  it("creates correct structure with version 1", () => {
    const lockFile = generateLockFile({ servers: {} });

    expect(lockFile.lockfileVersion).toBe(1);
    expect(lockFile.servers).toEqual({});
    expect(lockFile.registry).toEqual({});
  });

  it("includes server entries with correct fields", () => {
    const config: McpServerConfig = {
      type: "sse",
      url: "https://example.com/mcp",
    };

    const lockFile = generateLockFile({
      servers: {
        "my-server": {
          config,
          tools: ["search", "read"],
          scope: "user",
          version: "1.2.3",
        },
      },
    });

    expect(Object.keys(lockFile.servers)).toEqual(["my-server"]);
    const entry = lockFile.servers["my-server"];
    expect(entry?.type).toBe("sse");
    expect(entry?.url).toBe("https://example.com/mcp");
    expect(entry?.version).toBe("1.2.3");
    expect(entry?.scope).toBe("user");
    expect(entry?.toolsDiscovered).toEqual(["search", "read"]);
    expect(entry?.installedAt).toBeDefined();
  });

  it("defaults version to 0.0.0 when not provided", () => {
    const lockFile = generateLockFile({
      servers: {
        "no-version": {
          config: { type: "stdio", command: "npx", args: ["-y", "my-server"] },
          tools: [],
          scope: "local",
        },
      },
    });

    expect(lockFile.servers["no-version"]?.version).toBe("0.0.0");
  });

  it("includes stdio config fields", () => {
    const lockFile = generateLockFile({
      servers: {
        "stdio-server": {
          config: { type: "stdio", command: "npx", args: ["-y", "my-server"] },
          tools: ["do_thing"],
          scope: "project",
        },
      },
    });

    const entry = lockFile.servers["stdio-server"];
    expect(entry?.command).toBe("npx");
    expect(entry?.args).toEqual(["-y", "my-server"]);
    expect(entry?.url).toBeUndefined();
  });

  it("includes registry entries", () => {
    const lockFile = generateLockFile({
      servers: {},
      registries: {
        "official-registry": {
          url: "https://github.com/openclaw/mcp-registry",
          syncedAt: "2026-03-10T12:00:00.000Z",
          commit: "abc1234",
        },
      },
    });

    expect(Object.keys(lockFile.registry)).toEqual(["official-registry"]);
    const reg = lockFile.registry["official-registry"];
    expect(reg?.url).toBe("https://github.com/openclaw/mcp-registry");
    expect(reg?.syncedAt).toBe("2026-03-10T12:00:00.000Z");
    expect(reg?.commit).toBe("abc1234");
  });

  it("includes registry reference on server entries", () => {
    const lockFile = generateLockFile({
      servers: {
        "reg-server": {
          config: { type: "http", url: "https://example.com/mcp" },
          tools: ["search"],
          scope: "user",
          registry: "official-registry",
        },
      },
    });

    expect(lockFile.servers["reg-server"]?.registry).toBe("official-registry");
  });
});

describe("diffLockFile", () => {
  function makeLockFile(servers: McpLockFile["servers"]): McpLockFile {
    return { lockfileVersion: 1, servers, registry: {} };
  }

  it("matches when identical", () => {
    const lock = makeLockFile({
      "server-a": {
        version: "1.0.0",
        type: "sse",
        url: "https://a.example.com",
        installedAt: "2026-03-10T00:00:00.000Z",
        scope: "user",
        toolsDiscovered: ["tool1"],
      },
    });

    const current = {
      "server-a": { type: "sse" as const, url: "https://a.example.com", tools: ["tool1"] },
    };

    const diff = diffLockFile(lock, current);
    expect(diff.matches).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("detects added servers (in lock but not current)", () => {
    const lock = makeLockFile({
      "server-a": {
        version: "1.0.0",
        type: "sse",
        url: "https://a.example.com",
        installedAt: "2026-03-10T00:00:00.000Z",
        scope: "user",
        toolsDiscovered: [],
      },
      "server-b": {
        version: "1.0.0",
        type: "http",
        url: "https://b.example.com",
        installedAt: "2026-03-10T00:00:00.000Z",
        scope: "user",
        toolsDiscovered: [],
      },
    });

    const current = {
      "server-a": { type: "sse" as const, url: "https://a.example.com", tools: [] },
    };

    const diff = diffLockFile(lock, current);
    expect(diff.matches).toBe(false);
    expect(diff.added).toEqual(["server-b"]);
    expect(diff.removed).toEqual([]);
  });

  it("detects removed servers (in current but not lock)", () => {
    const lock = makeLockFile({
      "server-a": {
        version: "1.0.0",
        type: "sse",
        url: "https://a.example.com",
        installedAt: "2026-03-10T00:00:00.000Z",
        scope: "user",
        toolsDiscovered: [],
      },
    });

    const current = {
      "server-a": { type: "sse" as const, url: "https://a.example.com", tools: [] },
      "server-new": { type: "http" as const, url: "https://new.example.com", tools: [] },
    };

    const diff = diffLockFile(lock, current);
    expect(diff.matches).toBe(false);
    expect(diff.removed).toEqual(["server-new"]);
    expect(diff.added).toEqual([]);
  });

  it("detects changed servers with different type", () => {
    const lock = makeLockFile({
      "server-a": {
        version: "1.0.0",
        type: "sse",
        url: "https://a.example.com",
        installedAt: "2026-03-10T00:00:00.000Z",
        scope: "user",
        toolsDiscovered: [],
      },
    });

    const current = {
      "server-a": { type: "http" as const, url: "https://a.example.com", tools: [] },
    };

    const diff = diffLockFile(lock, current);
    expect(diff.matches).toBe(false);
    expect(diff.changed).toEqual(["server-a"]);
  });

  it("detects changed servers with different URL", () => {
    const lock = makeLockFile({
      "server-a": {
        version: "1.0.0",
        type: "sse",
        url: "https://old.example.com",
        installedAt: "2026-03-10T00:00:00.000Z",
        scope: "user",
        toolsDiscovered: [],
      },
    });

    const current = {
      "server-a": { type: "sse" as const, url: "https://new.example.com", tools: [] },
    };

    const diff = diffLockFile(lock, current);
    expect(diff.matches).toBe(false);
    expect(diff.changed).toEqual(["server-a"]);
  });

  it("handles empty lock file", () => {
    const lock = makeLockFile({});

    const current = {
      "server-a": { type: "sse" as const, url: "https://a.example.com", tools: [] },
    };

    const diff = diffLockFile(lock, current);
    expect(diff.matches).toBe(false);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual(["server-a"]);
    expect(diff.changed).toEqual([]);
  });

  it("handles empty current servers against empty lock", () => {
    const lock = makeLockFile({});
    const diff = diffLockFile(lock, {});
    expect(diff.matches).toBe(true);
  });
});
