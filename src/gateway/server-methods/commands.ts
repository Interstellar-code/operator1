import { randomUUID } from "node:crypto";
/**
 * Gateway RPC handlers for the slash commands system.
 *
 * Namespace: commands.*
 * All handlers are registered in server-methods.ts as commandsHandlers.
 */
import fs from "node:fs";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../../agents/agent-scope.js";
import { buildWorkspaceSkillCommandSpecs } from "../../agents/skills/workspace.js";
import { loadConfig } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";
import {
  listCommandsFromDb,
  getCommandByName,
  insertCommand,
  updateCommandByName,
  deleteCommandByName,
} from "../../infra/state-db/commands-sqlite.js";
import type { CommandArg, CommandEntry } from "../../infra/state-db/commands-sqlite.js";
import { normalizeAgentId } from "../../routing/session-key.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import { resolveAndExpandCommand, parseRawArgsString } from "./commands-core.js";
import type { GatewayRequestHandlers } from "./types.js";

// ── Constants ────────────────────────────────────────────────────────────────

/** Names that collide with core gateway verbs — always rejected on create/update. */
const RESERVED_NAMES = new Set(["restart", "delete", "config", "bash", "session"]);

function commandsDir(): string {
  return path.join(resolveStateDir(), "commands");
}

function commandFilePath(name: string): string {
  return path.join(commandsDir(), `${name}.md`);
}

function ensureCommandsDir(): void {
  fs.mkdirSync(commandsDir(), { recursive: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isValidName(name: unknown): name is string {
  return isString(name) && /^[a-z][a-z0-9-]*$/.test(name) && name.length <= 64;
}

function buildMarkdownBody(
  name: string,
  description: string,
  emoji: string | undefined,
  category: string,
  args: CommandArg[],
  longRunning: boolean,
  body: string,
): string {
  const frontmatter: string[] = [`name: ${name}`, `description: ${description}`];
  if (emoji) {
    frontmatter.push(`emoji: ${emoji}`);
  }
  frontmatter.push(`category: ${category}`);
  frontmatter.push("user-command: true");
  frontmatter.push("model-invocation: false");
  if (longRunning) {
    frontmatter.push("long-running: true");
  }
  if (args.length) {
    frontmatter.push("args:");
    for (const arg of args) {
      frontmatter.push(`  - name: ${arg.name}`);
      frontmatter.push(`    type: ${arg.type ?? "string"}`);
      if (arg.required !== undefined) {
        frontmatter.push(`    required: ${String(arg.required)}`);
      }
      if (arg.default !== undefined) {
        frontmatter.push(`    default: "${arg.default}"`);
      }
    }
  }
  return `---\n${frontmatter.join("\n")}\n---\n\n${body}`;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export const commandsHandlers: GatewayRequestHandlers = {
  // ── commands.list ──────────────────────────────────────────────────────────
  "commands.list": ({ params, respond }) => {
    const scope = isString(params.scope) ? (params.scope as "user" | "agent" | "all") : "all";
    try {
      // Start with SQLite-registered commands
      const dbCommands = listCommandsFromDb(scope);
      const nameSet = new Set(dbCommands.map((c) => c.name.toLowerCase()));

      // Merge skill files into the response
      // scope=user → skills where userInvocable=true
      // scope=agent → skills where disableModelInvocation=false (model-invocation allowed)
      // scope=all → all userInvocable skills
      let skillEntries: CommandEntry[] = [];
      try {
        const cfg = loadConfig();
        const agentIdRaw = isString(params.agentId) ? params.agentId.trim() : "";
        const agentId = agentIdRaw ? normalizeAgentId(agentIdRaw) : resolveDefaultAgentId(cfg);
        if (agentIdRaw) {
          const knownAgents = listAgentIds(cfg);
          if (!knownAgents.includes(agentId)) {
            // Unknown agent — skip skill merge
          } else {
            const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
            const skillSpecs = buildWorkspaceSkillCommandSpecs(workspaceDir, { config: cfg });
            // buildWorkspaceSkillCommandSpecs already filters to userInvocable skills
            skillEntries = skillSpecs
              .filter((s) => !nameSet.has(s.name.toLowerCase())) // db rows take precedence
              .map(
                (s): CommandEntry => ({
                  commandId: `skill:${s.skillName}`,
                  name: s.name,
                  description: s.description,
                  emoji: null,
                  filePath: null,
                  type: "skill",
                  source: "skill",
                  userCommand: true,
                  modelInvocation: scope !== "user",
                  enabled: true,
                  longRunning: false,
                  args: [],
                  tags: [],
                  category: "skills",
                  version: 1,
                }),
              );
          }
        } else {
          // No agentId — use default agent workspace
          const workspaceDir = resolveAgentWorkspaceDir(cfg, resolveDefaultAgentId(cfg));
          const skillSpecs = buildWorkspaceSkillCommandSpecs(workspaceDir, { config: cfg });
          skillEntries = skillSpecs
            .filter((s) => !nameSet.has(s.name.toLowerCase()))
            .map(
              (s): CommandEntry => ({
                commandId: `skill:${s.skillName}`,
                name: s.name,
                description: s.description,
                emoji: null,
                filePath: null,
                type: "skill",
                source: "skill",
                userCommand: true,
                modelInvocation: scope !== "user",
                enabled: true,
                longRunning: false,
                args: [],
                tags: [],
                category: "skills",
                version: 1,
              }),
            );
        }
      } catch {
        // Skill merge is best-effort — don't block commands.list if skills fail
      }

      const commands = [...dbCommands, ...skillEntries];
      respond(true, { commands });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Failed to list commands: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ── commands.get ──────────────────────────────────────────────────────────
  "commands.get": ({ params, respond }) => {
    const { name } = params;
    if (!isString(name)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
      return;
    }
    const command = getCommandByName(name);
    if (!command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Command not found: ${name}`),
      );
      return;
    }
    respond(true, { command });
  },

  // ── commands.getBody ──────────────────────────────────────────────────────
  "commands.getBody": ({ params, respond }) => {
    const { name } = params;
    if (!isString(name)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
      return;
    }
    const command = getCommandByName(name);
    if (!command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Command not found: ${name}`),
      );
      return;
    }
    if (!command.filePath) {
      respond(true, { body: command.description, hasFile: false });
      return;
    }
    try {
      const raw = fs.readFileSync(command.filePath, "utf8");
      // Return body only (strip frontmatter)
      const body = raw.replace(/^---[\s\S]*?---\s*/m, "").trim();
      respond(true, { body, hasFile: true, raw });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Cannot read command file: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ── commands.create ───────────────────────────────────────────────────────
  "commands.create": ({ params, respond }) => {
    const { name, description, body } = params;

    if (!isValidName(name)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "name is required and must match /^[a-z][a-z0-9-]*$/ (max 64 chars)",
        ),
      );
      return;
    }
    if (!isString(description) || !description.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "description is required"));
      return;
    }
    if (!isString(body) || !body.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "body is required"));
      return;
    }
    if (RESERVED_NAMES.has(name)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${name}" is a reserved command name`),
      );
      return;
    }

    // Check for name collision
    const existing = getCommandByName(name);
    if (existing) {
      if (existing.source === "builtin") {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            `"${name}" is a built-in command and cannot be overwritten`,
          ),
        );
        return;
      }
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Command "${name}" already exists`),
      );
      return;
    }

    const emoji = isString(params.emoji) ? params.emoji : undefined;
    const category = isString(params.category) ? params.category : "general";
    const longRunning = params.long_running === true;
    const args: CommandArg[] = Array.isArray(params.args) ? (params.args as CommandArg[]) : [];

    try {
      ensureCommandsDir();
      const filePath = commandFilePath(name);
      const fileContent = buildMarkdownBody(
        name,
        description,
        emoji,
        category,
        args,
        longRunning,
        body,
      );
      fs.writeFileSync(filePath, fileContent, "utf8");

      const commandId = randomUUID();
      insertCommand({
        commandId,
        name,
        description,
        emoji,
        filePath,
        type: "command",
        source: "user",
        userCommand: true,
        modelInvocation: false,
        longRunning,
        args,
        category,
      });

      respond(true, { commandId, name });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Failed to create command: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ── commands.update ───────────────────────────────────────────────────────
  "commands.update": ({ params, respond }) => {
    const { name } = params;
    if (!isString(name)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
      return;
    }

    const command = getCommandByName(name);
    if (!command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Command not found: ${name}`),
      );
      return;
    }
    if (command.source === "builtin") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Built-in command "${name}" cannot be modified`),
      );
      return;
    }

    const description = isString(params.description) ? params.description : command.description;
    const emoji = isString(params.emoji) ? params.emoji : (command.emoji ?? undefined);
    const category = isString(params.category) ? params.category : command.category;
    const longRunning =
      typeof params.long_running === "boolean" ? params.long_running : command.longRunning;
    const args: CommandArg[] = Array.isArray(params.args)
      ? (params.args as CommandArg[])
      : command.args;
    const newBody = isString(params.body) ? params.body : null;

    try {
      // Update file if body or metadata changed
      if (command.filePath && newBody !== null) {
        const fileContent = buildMarkdownBody(
          name,
          description,
          emoji,
          category,
          args,
          longRunning,
          newBody,
        );
        fs.writeFileSync(command.filePath, fileContent, "utf8");
      }

      const updated = updateCommandByName(name, {
        description,
        emoji,
        category,
        longRunning,
        args,
      });

      if (!updated) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `Command "${name}" not found or is read-only`),
        );
        return;
      }

      respond(true, { name });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Failed to update command: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ── commands.delete ───────────────────────────────────────────────────────
  "commands.delete": ({ params, respond }) => {
    const { name } = params;
    if (!isString(name)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
      return;
    }

    const command = getCommandByName(name);
    if (!command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Command not found: ${name}`),
      );
      return;
    }
    if (command.source === "builtin") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Built-in command "${name}" cannot be deleted`),
      );
      return;
    }

    try {
      // Delete file if it exists
      if (command.filePath) {
        try {
          fs.unlinkSync(command.filePath);
        } catch {
          // File already gone — continue to remove DB row
        }
      }
      deleteCommandByName(name);
      respond(true, { name });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `Failed to delete command: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ── commands.invoke ───────────────────────────────────────────────────────
  "commands.invoke": async ({ params, respond }) => {
    const { name, args_str, session_key, invoked_by } = params;
    if (!isString(name)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name is required"));
      return;
    }

    const command = getCommandByName(name);
    if (!command) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `Command not found: /${name}`),
      );
      return;
    }

    // Parse positional/named args string into key-value map
    const rawArgsStr = isString(args_str) ? args_str : "";
    const rawArgs = parseRawArgsString(rawArgsStr, command.args);
    const originalMessage = isString(params.original_message)
      ? params.original_message
      : `/${name}${rawArgsStr ? ` ${rawArgsStr}` : ""}`;

    try {
      const result = await resolveAndExpandCommand({
        name,
        rawArgs,
        originalMessage,
        sessionKey: isString(session_key) ? session_key : undefined,
        invokedBy: isString(invoked_by) ? invoked_by : undefined,
      });

      respond(true, {
        expandedInstruction: result.expandedInstruction,
        invocationId: result.invocationId,
        commandName: name,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },
};
