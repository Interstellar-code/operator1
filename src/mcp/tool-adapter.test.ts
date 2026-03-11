import { describe, expect, it, vi } from "vitest";
import { convertMcpToolsToAgentTools, resolveToolName, sanitizeToolName } from "./tool-adapter.js";
import type { McpServerConfig, ToolIndexEntry } from "./types.js";

describe("sanitizeToolName", () => {
  it("replaces dashes with underscores", () => {
    expect(sanitizeToolName("my-tool")).toBe("my_tool");
  });

  it("replaces dots with underscores", () => {
    expect(sanitizeToolName("my.tool")).toBe("my_tool");
  });

  it("preserves alphanumeric and underscores", () => {
    expect(sanitizeToolName("my_tool_123")).toBe("my_tool_123");
  });
});

describe("resolveToolName", () => {
  const baseParams = {
    originalName: "search_doc",
    serverKey: "zai-zread",
    nativeToolNames: new Set<string>(),
    mcpToolNames: new Set<string>(),
  };

  it("returns prefixed name when toolNames is prefixed", () => {
    const result = resolveToolName({
      ...baseParams,
      config: { type: "sse", toolNames: "prefixed" } as McpServerConfig,
    });
    expect(result.resolvedName).toBe("mcp_zai_zread_search_doc");
    expect(result.wasFallback).toBe(false);
  });

  it("returns bare name when toolNames is bare and no collision", () => {
    const result = resolveToolName({
      ...baseParams,
      config: { type: "sse", toolNames: "bare" } as McpServerConfig,
    });
    expect(result.resolvedName).toBe("search_doc");
    expect(result.wasFallback).toBe(false);
  });

  it("falls back to prefixed when bare name collides with native tool", () => {
    const result = resolveToolName({
      ...baseParams,
      config: { type: "sse", toolNames: "bare" } as McpServerConfig,
      nativeToolNames: new Set(["search_doc"]),
    });
    expect(result.resolvedName).toBe("mcp_zai_zread_search_doc");
    expect(result.wasFallback).toBe(true);
  });

  it("falls back to prefixed when bare name collides with another MCP tool", () => {
    const result = resolveToolName({
      ...baseParams,
      config: { type: "sse", toolNames: "bare" } as McpServerConfig,
      mcpToolNames: new Set(["search_doc"]),
    });
    expect(result.resolvedName).toBe("mcp_zai_zread_search_doc");
    expect(result.wasFallback).toBe(true);
  });

  it("uses custom prefix when specified", () => {
    const result = resolveToolName({
      ...baseParams,
      config: { type: "sse", toolNames: "prefixed", prefix: "zread" } as McpServerConfig,
    });
    expect(result.resolvedName).toBe("mcp_zread_search_doc");
  });

  it("defaults to prefixed when toolNames is not set", () => {
    const result = resolveToolName({
      ...baseParams,
      config: { type: "sse" } as McpServerConfig,
    });
    expect(result.resolvedName).toBe("mcp_zai_zread_search_doc");
  });
});

describe("convertMcpToolsToAgentTools", () => {
  const mockTool: ToolIndexEntry = {
    name: "search_doc",
    originalName: "search_doc",
    serverKey: "zai-zread",
    description: "Search documentation",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
    },
    parameterNames: ["query"],
  };

  it("converts MCP tools to AgentTools", () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "result" }],
    });

    const tools = convertMcpToolsToAgentTools({
      serverKey: "zai-zread",
      tools: [mockTool],
      config: { type: "sse", toolNames: "bare" } as McpServerConfig,
      callTool,
      nativeToolNames: new Set(),
      mcpToolNames: new Set(),
    });

    expect(tools).toHaveLength(1);
    const first = tools[0];
    expect(first?.name).toBe("search_doc");
    expect(first?.description).toBe("Search documentation");
    expect(first?.execute).toBeDefined();
  });

  it("tracks MCP tool names for collision detection", () => {
    const mcpToolNames = new Set<string>();
    const callTool = vi.fn().mockResolvedValue({ content: [] });

    convertMcpToolsToAgentTools({
      serverKey: "zai-zread",
      tools: [mockTool],
      config: { type: "sse", toolNames: "bare" } as McpServerConfig,
      callTool,
      nativeToolNames: new Set(),
      mcpToolNames,
    });

    expect(mcpToolNames.has("search_doc")).toBe(true);
  });

  it("calls callTool with correct args on execute", async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "found it" }],
    });

    const tools = convertMcpToolsToAgentTools({
      serverKey: "zai-zread",
      tools: [mockTool],
      config: { type: "sse", toolNames: "bare" } as McpServerConfig,
      callTool,
      nativeToolNames: new Set(),
      mcpToolNames: new Set(),
    });

    const tool = tools[0];
    expect(tool).toBeDefined();
    expect(tool?.execute).toBeDefined();
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
    const result = await tool!.execute!("call-1", { query: "test" });
    expect(callTool).toHaveBeenCalledWith("zai-zread", "search_doc", { query: "test" });
    expect(result.content).toHaveLength(1);
  });
});
