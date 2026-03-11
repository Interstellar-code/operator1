/**
 * Converts MCP tools to operator1 AgentTool format.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "../agents/tools/common.js";
import { logWarn } from "../logger.js";
import type { McpServerConfig, ToolIndexEntry } from "./types.js";

/** Replace non-alphanumeric/underscore characters with underscores. */
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** Resolve the final tool name based on config naming strategy and collision checks. */
export function resolveToolName(params: {
  originalName: string;
  serverKey: string;
  config: McpServerConfig;
  nativeToolNames: Set<string>;
  mcpToolNames: Set<string>;
}): { resolvedName: string; wasFallback: boolean } {
  const { originalName, serverKey, config, nativeToolNames, mcpToolNames } = params;
  const prefix = sanitizeToolName(config.prefix ?? serverKey);
  const sanitized = sanitizeToolName(originalName);
  const prefixedName = `mcp_${prefix}_${sanitized}`;

  const naming = config.toolNames ?? "prefixed";
  if (naming === "prefixed") {
    return { resolvedName: prefixedName, wasFallback: false };
  }

  // Bare naming — check for collisions with native tools and other MCP tools.
  if (nativeToolNames.has(sanitized) || mcpToolNames.has(sanitized)) {
    logWarn(
      `MCP tool "${originalName}" from server "${serverKey}" collides with existing tool "${sanitized}", falling back to prefixed name "${prefixedName}"`,
    );
    return { resolvedName: prefixedName, wasFallback: true };
  }

  return { resolvedName: sanitized, wasFallback: false };
}

/** Content item from an MCP tool call result. */
interface McpContentItem {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Convert MCP result content to AgentToolResult format. */
function convertMcpResult(result: unknown): AgentToolResult<unknown> {
  const items = Array.isArray(result)
    ? (result as McpContentItem[])
    : typeof result === "object" && result !== null && "content" in result
      ? ((result as Record<string, unknown>).content as McpContentItem[])
      : [];

  const content: AgentToolResult<unknown>["content"] = [];

  for (const item of items) {
    if (item.type === "text" && item.text !== undefined) {
      content.push({ type: "text", text: item.text });
    } else if (item.type === "image" && item.data !== undefined) {
      content.push({
        type: "image",
        data: item.data,
        mimeType: item.mimeType ?? "image/png",
      });
    } else if (item.type === "resource" && item.text !== undefined) {
      // Resource content falls back to text representation.
      content.push({ type: "text", text: item.text });
    }
  }

  if (content.length === 0) {
    // Fallback: serialize the raw result as text.
    content.push({
      type: "text",
      text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
    });
  }

  return { content, details: result };
}

/** Convert an array of MCP ToolIndexEntry items to operator1 AgentTool format. */
export function convertMcpToolsToAgentTools(params: {
  serverKey: string;
  tools: ToolIndexEntry[];
  config: McpServerConfig;
  callTool: (
    serverKey: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  nativeToolNames: Set<string>;
  mcpToolNames: Set<string>;
}): AnyAgentTool[] {
  const { serverKey, tools, config, callTool, nativeToolNames, mcpToolNames } = params;
  const agentTools: AnyAgentTool[] = [];

  for (const tool of tools) {
    const { resolvedName } = resolveToolName({
      originalName: tool.originalName,
      serverKey,
      config,
      nativeToolNames,
      mcpToolNames,
    });

    // Track this name so later tools can detect collisions.
    mcpToolNames.add(resolvedName);

    const originalName = tool.originalName;

    const agentTool: AnyAgentTool = {
      name: resolvedName,
      label: resolvedName,
      description: tool.description || `MCP tool from ${serverKey}`,
      parameters: Type.Unsafe(tool.inputSchema),
      execute: async (
        _toolCallId: string,
        args: Record<string, unknown>,
      ): Promise<AgentToolResult<unknown>> => {
        const result = await callTool(serverKey, originalName, args);
        return convertMcpResult(result);
      },
    };

    agentTools.push(agentTool);
  }

  return agentTools;
}
