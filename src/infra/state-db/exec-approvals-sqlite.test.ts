import { describe, expect, it } from "vitest";
import {
  addAllowlistEntryInDb,
  computeExecApprovalsDbHash,
  ensureAgentConfigInDb,
  getAgentAllowlistFromDb,
  hasAllowlistEntryInDb,
  loadExecApprovalsFromDb,
  recordAllowlistUseInDb,
  saveExecApprovalsToDb,
} from "./exec-approvals-sqlite.js";
import { useExecApprovalsTestDb } from "./test-helpers.exec-approvals.js";

describe("exec-approvals-sqlite adapter", () => {
  useExecApprovalsTestDb();

  it("returns null when no config exists", () => {
    const result = loadExecApprovalsFromDb();
    expect(result).toBeNull();
  });

  it("round-trips a full ExecApprovalsFile", () => {
    const file = {
      version: 1 as const,
      socket: { path: "/tmp/test.sock", token: "secret-token" },
      defaults: { security: "allowlist" as const, ask: "on-miss" as const },
      agents: {
        "my-agent": {
          security: "full" as const,
          allowlist: [
            {
              id: "entry-1",
              pattern: "/usr/bin/ls",
              lastUsedAt: 1700000000000,
              lastUsedCommand: "ls -la",
              lastResolvedPath: "/usr/bin/ls",
            },
            { id: "entry-2", pattern: "/usr/bin/cat" },
          ],
        },
      },
    };

    saveExecApprovalsToDb(file);
    const loaded = loadExecApprovalsFromDb();

    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(1);
    expect(loaded?.socket?.path).toBe("/tmp/test.sock");
    expect(loaded?.socket?.token).toBe("secret-token");
    expect(loaded?.defaults?.security).toBe("allowlist");
    expect(loaded?.defaults?.ask).toBe("on-miss");

    const agent = loaded?.agents?.["my-agent"];
    expect(agent?.security).toBe("full");
    expect(agent?.allowlist).toHaveLength(2);
    expect(agent?.allowlist?.[0]?.pattern).toBe("/usr/bin/ls");
    expect(agent?.allowlist?.[0]?.lastUsedCommand).toBe("ls -la");
    expect(agent?.allowlist?.[1]?.pattern).toBe("/usr/bin/cat");
  });

  it("saves and loads agents without allowlist entries", () => {
    const file = {
      version: 1 as const,
      agents: {
        "agent-a": { security: "deny" as const, ask: "always" as const },
      },
    };

    saveExecApprovalsToDb(file);
    const loaded = loadExecApprovalsFromDb();
    expect(loaded?.agents?.["agent-a"]?.security).toBe("deny");
    expect(loaded?.agents?.["agent-a"]?.allowlist).toBeUndefined();
  });

  it("adds a single allowlist entry", () => {
    saveExecApprovalsToDb({ version: 1, agents: { "test-agent": {} } });

    addAllowlistEntryInDb("test-agent", {
      id: "new-entry",
      pattern: "/opt/tool",
      lastUsedAt: Date.now(),
    });

    const entries = getAgentAllowlistFromDb("test-agent");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.pattern).toBe("/opt/tool");
    expect(entries[0]?.id).toBe("new-entry");
  });

  it("records allowlist usage on existing entry", () => {
    saveExecApprovalsToDb({
      version: 1,
      agents: {
        "test-agent": {
          allowlist: [{ id: "e1", pattern: "/usr/bin/rg" }],
        },
      },
    });

    recordAllowlistUseInDb("test-agent", "/usr/bin/rg", "rg -n foo", "/usr/bin/rg");

    const entries = getAgentAllowlistFromDb("test-agent");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.lastUsedCommand).toBe("rg -n foo");
    expect(entries[0]?.lastResolvedPath).toBe("/usr/bin/rg");
    expect(entries[0]?.lastUsedAt).toBeGreaterThan(0);
  });

  it("creates entry on recordAllowlistUse if missing", () => {
    saveExecApprovalsToDb({ version: 1, agents: {} });

    recordAllowlistUseInDb("new-agent", "/usr/bin/git", "git status");

    const entries = getAgentAllowlistFromDb("new-agent");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.pattern).toBe("/usr/bin/git");
    expect(entries[0]?.lastUsedCommand).toBe("git status");
  });

  it("hasAllowlistEntryInDb checks existence", () => {
    saveExecApprovalsToDb({
      version: 1,
      agents: {
        agent1: { allowlist: [{ id: "x", pattern: "/bin/echo" }] },
      },
    });

    expect(hasAllowlistEntryInDb("agent1", "/bin/echo")).toBe(true);
    expect(hasAllowlistEntryInDb("agent1", "/bin/missing")).toBe(false);
    expect(hasAllowlistEntryInDb("other-agent", "/bin/echo")).toBe(false);
  });

  it("replaces allowlist entries on re-save", () => {
    saveExecApprovalsToDb({
      version: 1,
      agents: {
        a: { allowlist: [{ id: "1", pattern: "/bin/old" }] },
      },
    });

    saveExecApprovalsToDb({
      version: 1,
      agents: {
        a: {
          allowlist: [
            { id: "2", pattern: "/bin/new1" },
            { id: "3", pattern: "/bin/new2" },
          ],
        },
      },
    });

    const entries = getAgentAllowlistFromDb("a");
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.pattern)).toEqual(["/bin/new1", "/bin/new2"]);
    expect(hasAllowlistEntryInDb("a", "/bin/old")).toBe(false);
  });

  it("computes a stable hash that changes on mutation", () => {
    saveExecApprovalsToDb({ version: 1, agents: {} });
    const hash1 = computeExecApprovalsDbHash();

    addAllowlistEntryInDb("agent", { id: "x", pattern: "/bin/ls" });
    const hash2 = computeExecApprovalsDbHash();

    expect(hash1).not.toBe(hash2);
    expect(hash1).toHaveLength(64);
    expect(hash2).toHaveLength(64);
  });

  it("ensureAgentConfigInDb creates missing agent config", () => {
    saveExecApprovalsToDb({ version: 1, agents: {} });
    ensureAgentConfigInDb("new-agent");

    const loaded = loadExecApprovalsFromDb();
    expect(loaded?.agents?.["new-agent"]).toBeDefined();
  });

  it("handles wildcard agent (*) entries", () => {
    saveExecApprovalsToDb({
      version: 1,
      agents: {
        "*": {
          allowlist: [{ id: "w1", pattern: "/usr/bin/jq" }],
        },
        "specific-agent": {
          allowlist: [{ id: "s1", pattern: "/usr/bin/rg" }],
        },
      },
    });

    const loaded = loadExecApprovalsFromDb();
    expect(loaded?.agents?.["*"]?.allowlist).toHaveLength(1);
    expect(loaded?.agents?.["*"]?.allowlist?.[0]?.pattern).toBe("/usr/bin/jq");
    expect(loaded?.agents?.["specific-agent"]?.allowlist).toHaveLength(1);
  });

  it("preserves lastUsedAt in milliseconds through round-trip", () => {
    const nowMs = 1700000500000;
    saveExecApprovalsToDb({
      version: 1,
      agents: {
        a: {
          allowlist: [{ id: "t", pattern: "/bin/test", lastUsedAt: nowMs }],
        },
      },
    });

    const entries = getAgentAllowlistFromDb("a");
    // Stored as epoch seconds, converted back to ms — may lose sub-second precision
    expect(entries[0]?.lastUsedAt).toBe(Math.floor(nowMs / 1000) * 1000);
  });
});
