import {
  parseRawArgsString,
  resolveAndExpandCommand,
} from "../../gateway/server-methods/commands-core.js";
/**
 * User command invocation handler for the auto-reply pipeline.
 *
 * Intercepts /name [args] messages, expands them via resolveAndExpandCommand(),
 * and replaces the message body before Pi dispatch.
 *
 * Placed in the HANDLERS list after built-in command handlers so that built-in
 * commands (/new, /reset, /help, etc.) take precedence.
 */
import { logVerbose } from "../../globals.js";
import { getCommandByName } from "../../infra/state-db/commands-sqlite.js";
import type { CommandHandler, CommandHandlerResult } from "./commands-types.js";

/**
 * Handle user-defined slash commands by expanding their body before Pi dispatch.
 * Returns null (passes through) if the command is not found in op1_commands.
 */
export const handleUserCommandInvocation: CommandHandler = async (
  params,
  allowTextCommands,
): Promise<CommandHandlerResult | null> => {
  if (!allowTextCommands) {
    return null;
  }

  const normalized = params.command.commandBodyNormalized;
  if (!normalized.startsWith("/")) {
    return null;
  }

  // Extract command name from /name [args...]
  const bodyMatch = normalized.match(/^\/(\S+)(?:\s+([\s\S]*))?$/);
  if (!bodyMatch) {
    return null;
  }

  const commandName = bodyMatch[1].toLowerCase();
  const argsStr = (bodyMatch[2] ?? "").trim();

  // Check if a user command with this name exists in SQLite
  // (only user_command=1 rows are eligible for user invocation)
  const command = getCommandByName(commandName);
  if (!command || !command.userCommand) {
    return null; // Not a registered user command — pass to next handler
  }

  logVerbose(`[commands] Expanding user command: /${commandName}${argsStr ? ` ${argsStr}` : ""}`);

  try {
    const rawArgs = parseRawArgsString(argsStr, command.args);
    const result = await resolveAndExpandCommand({
      name: commandName,
      rawArgs,
      originalMessage: normalized,
      sessionKey: params.sessionKey,
      invokedBy: params.command.senderId,
    });

    // Replace the message body in ctx so Pi receives the expanded instruction
    // Uses the same mutation pattern as applyAcpResetTailContext in commands-core.ts
    const mutableCtx = params.ctx as Record<string, unknown>;
    const expanded = result.expandedInstruction;
    mutableCtx.Body = expanded;
    mutableCtx.RawBody = expanded;
    mutableCtx.CommandBody = expanded;
    mutableCtx.BodyForCommands = expanded;
    mutableCtx.BodyForAgent = expanded;
    mutableCtx.BodyStripped = expanded;

    logVerbose(
      `[commands] /${commandName} expanded to ${expanded.length} chars (invocationId: ${result.invocationId})`,
    );

    // Continue to Pi dispatch with the expanded instruction
    return { shouldContinue: true };
  } catch (err) {
    logVerbose(`[commands] Error expanding /${commandName}: ${String(err)}`);
    // Don't block the message — fall through to Pi as-is
    return null;
  }
};
