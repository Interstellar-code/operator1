/**
 * The mcp_search meta-tool — wraps the ToolIndex for LLM-driven tool
 * discovery and invocation. A single ~250-token schema replaces exposing
 * every individual MCP tool schema to the model.
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { stringEnum } from "../agents/schema/typebox.js";
import type { AnyAgentTool } from "../agents/tools/common.js";
import type { ToolIndex } from "./tool-index.js";

/** Content item from an MCP tool call result (mirrors tool-adapter.ts). */
interface McpContentItem {
  type: "text" | "image" | "resource";
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Convert raw MCP result content to AgentToolResult format. */
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
      content.push({ type: "text", text: item.text });
    }
  }

  if (content.length === 0) {
    content.push({
      type: "text",
      text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
    });
  }

  return { content, details: result };
}

/** Return a text-only tool result. */
function textResult(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }], details: undefined };
}

export function createMcpSearchTool(params: {
  toolIndex: ToolIndex;
  callTool: (
    serverKey: string,
    toolName: string,
    args: Record<string, unknown>,
  ) => Promise<unknown>;
}): AnyAgentTool {
  const { toolIndex, callTool } = params;

  return {
    name: "mcp_search",
    label: "mcp_search",
    description:
      "Search, discover, and invoke MCP tools from connected servers. " +
      "Actions: 'search' finds tools by keyword, 'get_schema' returns full parameters for a tool, " +
      "'invoke' calls a tool, 'list_servers' shows connected servers.",
    parameters: Type.Object({
      action: stringEnum(["search", "get_schema", "invoke", "list_servers"]),
      query: Type.Optional(Type.String({ description: "Search query (for action='search')" })),
      tool: Type.Optional(
        Type.String({ description: "Tool name (for action='get_schema' or 'invoke')" }),
      ),
      server: Type.Optional(
        Type.String({
          description: "Server key to disambiguate tools with same name (for action='invoke')",
        }),
      ),
      arguments: Type.Optional(
        Type.Unsafe<Record<string, unknown>>({
          type: "object",
          description: "Tool arguments (for action='invoke')",
        }),
      ),
    }),
    execute: async (
      _toolCallId: string,
      args: Record<string, unknown>,
    ): Promise<AgentToolResult<unknown>> => {
      const action = args.action as string;
      const query = args.query as string | undefined;
      const toolName = args.tool as string | undefined;
      const serverKey = args.server as string | undefined;
      const toolArgs = (args.arguments as Record<string, unknown>) ?? {};

      switch (action) {
        case "search": {
          if (!query) {
            return textResult("Error: 'query' parameter is required for action='search'.");
          }
          const results = toolIndex.search(query);
          if (results.length === 0) {
            return textResult(`No tools found matching "${query}".`);
          }
          // Return compact tool cards (name, server, description, params) — no full schema.
          const cards = results.map(
            (r) =>
              `- ${r.tool} (server: ${r.server}): ${r.description}` +
              (r.parametersSummary ? `\n  params: ${r.parametersSummary}` : ""),
          );
          return textResult(cards.join("\n"));
        }

        case "get_schema": {
          if (!toolName) {
            return textResult("Error: 'tool' parameter is required for action='get_schema'.");
          }
          const entry = toolIndex.getSchema(toolName, serverKey);
          if (!entry) {
            return textResult(
              `Tool "${toolName}" not found. Use action='search' to find available tools.`,
            );
          }
          return textResult(JSON.stringify(entry.inputSchema, null, 2));
        }

        case "invoke": {
          if (!toolName) {
            return textResult("Error: 'tool' parameter is required for action='invoke'.");
          }

          // Check for ambiguity: multiple servers may expose the same tool name.
          if (!serverKey) {
            const servers = toolIndex.listServers();
            const matching: string[] = [];
            for (const srv of servers) {
              if (srv.tools.includes(toolName)) {
                matching.push(srv.server);
              }
            }
            if (matching.length > 1) {
              return textResult(
                `Ambiguous tool "${toolName}" found on multiple servers: ${matching.join(", ")}. ` +
                  "Provide the 'server' parameter to disambiguate.",
              );
            }
          }

          const entry = toolIndex.findTool(toolName, serverKey);
          if (!entry) {
            return textResult(
              `Tool "${toolName}" not found. Use action='search' to find available tools.`,
            );
          }

          try {
            const result = await callTool(entry.serverKey, entry.originalName, toolArgs);
            return convertMcpResult(result);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return textResult(`Error invoking tool "${toolName}": ${message}`);
          }
        }

        case "list_servers": {
          const servers = toolIndex.listServers();
          if (servers.length === 0) {
            return textResult("No MCP servers connected.");
          }
          const lines = servers.map(
            (s) =>
              `- ${s.server}: ${s.toolCount} tool${s.toolCount === 1 ? "" : "s"} (${s.tools.join(", ")})`,
          );
          return textResult(lines.join("\n"));
        }

        default:
          return textResult(
            `Unknown action "${action}". Valid actions: search, get_schema, invoke, list_servers.`,
          );
      }
    },
  };
}
