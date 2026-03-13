import { randomUUID } from "node:crypto";
/**
 * Shared invocation core for slash commands.
 *
 * resolveAndExpandCommand() is called by both:
 *  - commands.invoke RPC (gateway)
 *  - handleCommandsInvocation() (auto-reply chain)
 *
 * NOTE: do NOT confuse with src/auto-reply/reply/commands-core.ts —
 * that file is the auto-reply handler pipeline core (completely different).
 */
import fs from "node:fs";
import type { CommandArg, CommandEntry } from "../../infra/state-db/commands-sqlite.js";
import { getCommandByName, insertCommandInvocation } from "../../infra/state-db/commands-sqlite.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type ResolveCommandOptions = {
  /** Raw slash command name (without leading /) */
  name: string;
  /** Key-value args from the user input (e.g. { project: "src/" }) */
  rawArgs?: Record<string, string>;
  /** Original user message, stored in invocation log */
  originalMessage?: string;
  /** Session key, stored in invocation log */
  sessionKey?: string;
  /** Identity of the invoker, stored in invocation log */
  invokedBy?: string;
};

export type ResolveCommandResult = {
  expandedInstruction: string;
  invocationId: string;
  command: CommandEntry;
};

// ── Arg substitution ─────────────────────────────────────────────────────────

/**
 * Parse positional args string into a key-value map using command arg definitions.
 * Positional: each word maps to the nth arg in order.
 * Named: "--key value" or "--key=value" also supported.
 *
 * Examples:
 *   args = "src/" + argDefs = [{name:"project"}] → { project: "src/" }
 *   args = "--project src/" + argDefs = [{name:"project"}] → { project: "src/" }
 */
export function parseRawArgsString(
  rawArgsStr: string,
  argDefs: CommandArg[],
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!rawArgsStr.trim()) {
    return result;
  }

  const tokens = rawArgsStr.trim().split(/\s+/);
  let positionalIdx = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith("--")) {
      // Named: --key=value or --key value
      const eqIdx = token.indexOf("=");
      if (eqIdx !== -1) {
        const key = token.slice(2, eqIdx);
        result[key] = token.slice(eqIdx + 1);
      } else {
        const key = token.slice(2);
        const val = tokens[i + 1];
        if (val && !val.startsWith("--")) {
          result[key] = val;
          i++;
        }
      }
    } else {
      // Positional: map to argDefs[positionalIdx]
      const def = argDefs[positionalIdx];
      if (def) {
        result[def.name] = token;
      }
      positionalIdx++;
    }
  }

  return result;
}

/**
 * Substitute {{var}} placeholders in body text.
 * Falls back to arg default if no value provided.
 * Leaves {{var}} untouched if no value and no default (so the LLM sees it).
 */
export function substituteArgs(
  body: string,
  args: Record<string, string>,
  argDefs: CommandArg[],
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (key in args) {
      return args[key];
    }
    const def = argDefs.find((a) => a.name === key);
    if (def?.default !== undefined) {
      return def.default;
    }
    return match; // leave as-is
  });
}

// ── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a command by name, expand its body with args, and log the invocation.
 * Throws if the command is not found or its file cannot be read.
 */
export async function resolveAndExpandCommand(
  opts: ResolveCommandOptions,
): Promise<ResolveCommandResult> {
  const { name, rawArgs = {}, originalMessage, sessionKey, invokedBy } = opts;

  // 1. SQLite lookup
  const command = getCommandByName(name);
  if (!command) {
    throw new Error(`Command not found: /${name}`);
  }

  // 2. Read body from file
  let body: string;
  if (command.filePath) {
    try {
      body = fs.readFileSync(command.filePath, "utf8");
      // Strip frontmatter (--- ... ---) if present
      body = body.replace(/^---[\s\S]*?---\s*/m, "").trim();
    } catch (err) {
      throw new Error(
        `Cannot read command file for /${name}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  } else {
    // Built-in with no file — use description as body
    body = command.description;
  }

  // 3. Parse args and substitute {{vars}}
  const parsedArgs = { ...rawArgs };
  const expandedInstruction = substituteArgs(body, parsedArgs, command.args);

  // 4. Write invocation log
  const invocationId = randomUUID();
  insertCommandInvocation({
    invocationId,
    commandId: command.commandId,
    commandName: name,
    invokedBy,
    argsJson: Object.keys(parsedArgs).length ? JSON.stringify(parsedArgs) : undefined,
    originalMessage,
    expandedInstruction,
    sessionKey,
    success: true,
  });

  return { expandedInstruction, invocationId, command };
}
