/**
 * SQLite adapter for op1_commands and op1_command_invocations tables.
 *
 * op1_commands: registry of slash commands (user-created + builtin seeds).
 * op1_command_invocations: audit log of every command execution.
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setCommandsDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetCommandsDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Types ────────────────────────────────────────────────────────────────────

export type CommandArg = {
  name: string;
  type: string;
  required?: boolean;
  default?: string;
};

export type CommandRow = {
  command_id: string;
  name: string;
  description: string;
  emoji: string | null;
  file_path: string | null;
  type: string;
  source: string;
  user_command: number;
  model_invocation: number;
  enabled: number;
  long_running: number;
  args_json: string | null;
  tags_json: string | null;
  category: string;
  version: number;
  created_at: number | null;
  updated_at: number | null;
};

export type CommandEntry = {
  commandId: string;
  name: string;
  description: string;
  emoji: string | null;
  filePath: string | null;
  type: string;
  source: string;
  userCommand: boolean;
  modelInvocation: boolean;
  enabled: boolean;
  longRunning: boolean;
  args: CommandArg[];
  tags: string[];
  category: string;
  version: number;
};

function rowToEntry(r: CommandRow): CommandEntry {
  return {
    commandId: r.command_id,
    name: r.name,
    description: r.description,
    emoji: r.emoji ?? null,
    filePath: r.file_path ?? null,
    type: r.type,
    source: r.source,
    userCommand: r.user_command === 1,
    modelInvocation: r.model_invocation === 1,
    enabled: r.enabled === 1,
    longRunning: r.long_running === 1,
    args: r.args_json ? (JSON.parse(r.args_json) as CommandArg[]) : [],
    tags: r.tags_json ? (JSON.parse(r.tags_json) as string[]) : [],
    category: r.category,
    version: r.version,
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

export function listCommandsFromDb(scope: "user" | "agent" | "all" = "all"): CommandEntry[] {
  const db = resolveDb();
  let sql = "SELECT * FROM op1_commands WHERE enabled = 1";
  if (scope === "user") {
    sql += " AND user_command = 1";
  } else if (scope === "agent") {
    sql += " AND model_invocation = 1";
  }
  sql += " ORDER BY category ASC, name ASC";
  const rows = db.prepare(sql).all() as CommandRow[];
  return rows.map(rowToEntry);
}

export function getCommandByName(name: string): CommandEntry | null {
  const db = resolveDb();
  const row = db.prepare("SELECT * FROM op1_commands WHERE name = ? AND enabled = 1").get(name) as
    | CommandRow
    | undefined;
  return row ? rowToEntry(row) : null;
}

export function getCommandById(commandId: string): CommandEntry | null {
  const db = resolveDb();
  const row = db.prepare("SELECT * FROM op1_commands WHERE command_id = ?").get(commandId) as
    | CommandRow
    | undefined;
  return row ? rowToEntry(row) : null;
}

// ── Write ────────────────────────────────────────────────────────────────────

export type CommandCreateInput = {
  commandId: string;
  name: string;
  description: string;
  emoji?: string | null;
  filePath?: string | null;
  type?: string;
  source?: string;
  userCommand?: boolean;
  modelInvocation?: boolean;
  longRunning?: boolean;
  args?: CommandArg[];
  tags?: string[];
  category?: string;
};

export function insertCommand(input: CommandCreateInput): void {
  const db = resolveDb();
  db.prepare(`
    INSERT INTO op1_commands
      (command_id, name, description, emoji, file_path, type, source,
       user_command, model_invocation, long_running, args_json, tags_json, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.commandId,
    input.name,
    input.description,
    input.emoji ?? null,
    input.filePath ?? null,
    input.type ?? "command",
    input.source ?? "user",
    input.userCommand !== false ? 1 : 0,
    input.modelInvocation ? 1 : 0,
    input.longRunning ? 1 : 0,
    input.args?.length ? JSON.stringify(input.args) : null,
    input.tags?.length ? JSON.stringify(input.tags) : null,
    input.category ?? "general",
  );
}

export function upsertCommand(input: CommandCreateInput): void {
  const db = resolveDb();
  db.prepare(`
    INSERT INTO op1_commands
      (command_id, name, description, emoji, file_path, type, source,
       user_command, model_invocation, long_running, args_json, tags_json, category, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(name) DO UPDATE SET
      description = excluded.description,
      emoji = excluded.emoji,
      file_path = excluded.file_path,
      type = excluded.type,
      user_command = excluded.user_command,
      model_invocation = excluded.model_invocation,
      long_running = excluded.long_running,
      args_json = excluded.args_json,
      tags_json = excluded.tags_json,
      category = excluded.category,
      updated_at = unixepoch()
    WHERE op1_commands.source != 'builtin'
  `).run(
    input.commandId,
    input.name,
    input.description,
    input.emoji ?? null,
    input.filePath ?? null,
    input.type ?? "command",
    input.source ?? "user",
    input.userCommand !== false ? 1 : 0,
    input.modelInvocation ? 1 : 0,
    input.longRunning ? 1 : 0,
    input.args?.length ? JSON.stringify(input.args) : null,
    input.tags?.length ? JSON.stringify(input.tags) : null,
    input.category ?? "general",
  );
}

export type CommandUpdateInput = Partial<Omit<CommandCreateInput, "commandId" | "source">>;

export function updateCommandByName(name: string, input: CommandUpdateInput): boolean {
  const db = resolveDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.description !== undefined) {
    sets.push("description = ?");
    values.push(input.description);
  }
  if (input.emoji !== undefined) {
    sets.push("emoji = ?");
    values.push(input.emoji ?? null);
  }
  if (input.longRunning !== undefined) {
    sets.push("long_running = ?");
    values.push(input.longRunning ? 1 : 0);
  }
  if (input.args !== undefined) {
    sets.push("args_json = ?");
    values.push(input.args.length ? JSON.stringify(input.args) : null);
  }
  if (input.tags !== undefined) {
    sets.push("tags_json = ?");
    values.push(input.tags.length ? JSON.stringify(input.tags) : null);
  }
  if (input.category !== undefined) {
    sets.push("category = ?");
    values.push(input.category);
  }
  if (input.userCommand !== undefined) {
    sets.push("user_command = ?");
    values.push(input.userCommand ? 1 : 0);
  }
  if (input.modelInvocation !== undefined) {
    sets.push("model_invocation = ?");
    values.push(input.modelInvocation ? 1 : 0);
  }

  if (sets.length === 0) {
    return false;
  }

  sets.push("updated_at = unixepoch()", "version = version + 1");
  values.push(name);

  const result = db
    .prepare(`UPDATE op1_commands SET ${sets.join(", ")} WHERE name = ? AND source != 'builtin'`)
    .run(...values);
  return (result as { changes: number }).changes > 0;
}

export function deleteCommandByName(name: string): boolean {
  const db = resolveDb();
  const result = db
    .prepare("DELETE FROM op1_commands WHERE name = ? AND source != 'builtin'")
    .run(name);
  return (result as { changes: number }).changes > 0;
}

// ── Invocations ──────────────────────────────────────────────────────────────

export type CommandInvocationInput = {
  invocationId: string;
  commandId: string;
  commandName: string;
  invokedBy?: string;
  argsJson?: string;
  originalMessage?: string;
  expandedInstruction?: string;
  sessionKey?: string;
  success?: boolean;
  errorMessage?: string;
};

export function insertCommandInvocation(input: CommandInvocationInput): void {
  const db = resolveDb();
  db.prepare(`
    INSERT INTO op1_command_invocations
      (invocation_id, command_id, command_name, invoked_by, args_json,
       original_message, expanded_instruction, session_key, success, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.invocationId,
    input.commandId,
    input.commandName,
    input.invokedBy ?? null,
    input.argsJson ?? null,
    input.originalMessage ?? null,
    input.expandedInstruction ?? null,
    input.sessionKey ?? null,
    input.success === undefined ? null : input.success ? 1 : 0,
    input.errorMessage ?? null,
  );
}
