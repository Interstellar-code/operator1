import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import {
  deleteCommandByName,
  getCommandByName,
  insertCommand,
  insertCommandInvocation,
  listCommandsFromDb,
  resetCommandsDbForTest,
  setCommandsDbForTest,
  updateCommandByName,
  upsertCommand,
} from "./commands-sqlite.js";
import { runMigrations } from "./schema.js";

describe("commands-sqlite", () => {
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setCommandsDbForTest(db);
  });

  afterEach(() => {
    resetCommandsDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  // ── Migration idempotency ──────────────────────────────────────────────────
  it("v11 migration runs idempotently (tables exist)", () => {
    // Run migrations again — should not throw
    expect(() => runMigrations(db)).not.toThrow();
    // Tables should exist
    const tables = (
      db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(tables).toContain("op1_commands");
    expect(tables).toContain("op1_command_invocations");
  });

  it("v11 migration seeds 5 builtin commands", () => {
    const builtins = listCommandsFromDb("all").filter((c) => c.source === "builtin");
    expect(builtins.length).toBe(5);
    const names = builtins.map((c) => c.name).toSorted();
    expect(names).toEqual(["agents", "build", "help", "logs", "status"]);
  });

  // ── Insert + read ──────────────────────────────────────────────────────────
  it("inserts and reads a command by name", () => {
    insertCommand({
      commandId: "cmd-001",
      name: "deploy",
      description: "Deploy the app",
      category: "ops",
    });
    const cmd = getCommandByName("deploy");
    expect(cmd).not.toBeNull();
    expect(cmd!.name).toBe("deploy");
    expect(cmd!.description).toBe("Deploy the app");
    expect(cmd!.category).toBe("ops");
    expect(cmd!.source).toBe("user");
  });

  // ── List with scope filter ─────────────────────────────────────────────────
  it("commands.list scope=user returns only user_command=1 rows", () => {
    insertCommand({
      commandId: "u1",
      name: "user-cmd",
      description: "user",
      userCommand: true,
      modelInvocation: false,
    });
    insertCommand({
      commandId: "a1",
      name: "agent-cmd",
      description: "agent",
      userCommand: false,
      modelInvocation: true,
    });

    const userList = listCommandsFromDb("user");
    const agentList = listCommandsFromDb("agent");

    const userNames = userList.map((c) => c.name);
    const agentNames = agentList.map((c) => c.name);

    expect(userNames).toContain("user-cmd");
    expect(userNames).not.toContain("agent-cmd");
    expect(agentNames).toContain("agent-cmd");
    expect(agentNames).not.toContain("user-cmd");
  });

  // ── Source guard (builtin rows cannot be updated/deleted) ─────────────────
  it("updateCommandByName rejects builtin rows", () => {
    // The builtin "status" was seeded in v11
    const updated = updateCommandByName("status", { description: "hacked" });
    expect(updated).toBe(false);
    const cmd = getCommandByName("status");
    expect(cmd!.description).toBe("Check gateway and channel connection status");
  });

  it("deleteCommandByName rejects builtin rows", () => {
    const deleted = deleteCommandByName("status");
    expect(deleted).toBe(false);
    expect(getCommandByName("status")).not.toBeNull();
  });

  // ── Update ────────────────────────────────────────────────────────────────
  it("updates a user command", () => {
    insertCommand({ commandId: "cmd-u1", name: "greet", description: "Say hi" });
    const ok = updateCommandByName("greet", { description: "Say hello", category: "social" });
    expect(ok).toBe(true);
    const cmd = getCommandByName("greet");
    expect(cmd!.description).toBe("Say hello");
    expect(cmd!.category).toBe("social");
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  it("deletes a user command", () => {
    insertCommand({ commandId: "cmd-d1", name: "cleanup", description: "Clean up" });
    expect(getCommandByName("cleanup")).not.toBeNull();
    const ok = deleteCommandByName("cleanup");
    expect(ok).toBe(true);
    expect(getCommandByName("cleanup")).toBeNull();
  });

  // ── Upsert behavior ───────────────────────────────────────────────────────
  it("upsert updates existing user rows", () => {
    upsertCommand({ commandId: "cmd-x1", name: "myCmd", description: "v1", category: "a" });
    upsertCommand({ commandId: "cmd-x2", name: "myCmd", description: "v2", category: "b" });
    const cmd = getCommandByName("myCmd");
    expect(cmd!.description).toBe("v2");
    expect(cmd!.category).toBe("b");
  });

  it("upsert does NOT overwrite builtin rows", () => {
    upsertCommand({
      commandId: "new-id",
      name: "status",
      description: "overwritten",
      source: "user",
    });
    const cmd = getCommandByName("status");
    // Source guard in upsert prevents overwrite
    expect(cmd!.description).toBe("Check gateway and channel connection status");
  });

  // ── Args and {{var}} storage ──────────────────────────────────────────────
  it("stores and retrieves args", () => {
    insertCommand({
      commandId: "cmd-a1",
      name: "build-test",
      description: "build",
      args: [{ name: "project", type: "string", required: false, default: "." }],
    });
    const cmd = getCommandByName("build-test");
    expect(cmd!.args).toHaveLength(1);
    expect(cmd!.args[0].name).toBe("project");
    expect(cmd!.args[0].default).toBe(".");
  });

  // ── Invocation logging ────────────────────────────────────────────────────
  it("inserts invocation log row", () => {
    insertCommand({ commandId: "cmd-i1", name: "log-test", description: "test" });
    insertCommandInvocation({
      invocationId: "inv-001",
      commandId: "cmd-i1",
      commandName: "log-test",
      originalMessage: "/log-test",
      expandedInstruction: "Expanded body",
      sessionKey: "sess-abc",
      success: true,
    });
    const row = db
      .prepare("SELECT * FROM op1_command_invocations WHERE invocation_id = ?")
      .get("inv-001") as
      | { original_message: string; expanded_instruction: string; success: number }
      | undefined;
    expect(row).not.toBeUndefined();
    expect(row!.original_message).toBe("/log-test");
    expect(row!.expanded_instruction).toBe("Expanded body");
    expect(row!.success).toBe(1);
  });
});
