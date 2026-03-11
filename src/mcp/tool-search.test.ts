import { describe, expect, it, vi } from "vitest";
import { ToolIndex } from "./tool-index.js";
import { createMcpSearchTool } from "./tool-search.js";
import type { ToolIndexEntry } from "./types.js";

const mockTools: ToolIndexEntry[] = [
  {
    name: "search_doc",
    originalName: "search_doc",
    serverKey: "zai-zread",
    description: "Search documentation in a GitHub repository",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string" }, query: { type: "string" } },
      required: ["repo", "query"],
    },
    parameterNames: ["repo", "query"],
  },
  {
    name: "read_file",
    originalName: "read_file",
    serverKey: "zai-zread",
    description: "Read a file from a GitHub repository",
    inputSchema: {
      type: "object",
      properties: { repo: { type: "string" }, path: { type: "string" } },
      required: ["repo", "path"],
    },
    parameterNames: ["repo", "path"],
  },
  {
    name: "web_search",
    originalName: "web_search",
    serverKey: "zai-search",
    description: "Search the web for information",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
    },
    parameterNames: ["query", "limit"],
  },
];

/** Helper: create a populated ToolIndex and mcp_search tool with a mock callTool. */
function setup(callToolImpl?: (...args: unknown[]) => Promise<unknown>) {
  const toolIndex = new ToolIndex();
  toolIndex.addTools(mockTools);
  const callTool = vi.fn(
    callToolImpl ?? (async () => ({ content: [{ type: "text", text: "ok" }] })),
  );
  const tool = createMcpSearchTool({ toolIndex, callTool });
  return { toolIndex, callTool, tool };
}

/** Shorthand to execute the mcp_search tool and extract the first text content. */
async function exec(
  tool: ReturnType<typeof setup>["tool"],
  args: Record<string, unknown>,
): Promise<string> {
  // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
  const result = await tool.execute!("test-call", args);
  const first = result.content?.[0];
  return first && "text" in first ? first.text : "";
}

describe("createMcpSearchTool", () => {
  describe("search action", () => {
    it("returns matching tools", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "search", query: "search" });
      expect(text).toContain("search_doc");
      expect(text).toContain("web_search");
    });

    it("returns error when query param is missing", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "search" });
      expect(text).toContain("Error");
      expect(text).toContain("query");
    });

    it("returns no-tools-found message when nothing matches", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "search", query: "nonexistent_xyz" });
      expect(text).toContain("No tools found");
    });
  });

  describe("get_schema action", () => {
    it("returns full JSON Schema for a known tool", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "get_schema", tool: "read_file" });
      const schema = JSON.parse(text);
      expect(schema.type).toBe("object");
      expect(schema.properties).toHaveProperty("repo");
      expect(schema.properties).toHaveProperty("path");
    });

    it("returns error when tool param is missing", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "get_schema" });
      expect(text).toContain("Error");
      expect(text).toContain("tool");
    });

    it("returns not-found message for unknown tool", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "get_schema", tool: "nope" });
      expect(text).toContain("not found");
    });
  });

  describe("invoke action", () => {
    it("calls callTool with correct args", async () => {
      const { tool, callTool } = setup();
      await exec(tool, {
        action: "invoke",
        tool: "search_doc",
        server: "zai-zread",
        arguments: { repo: "foo/bar", query: "hello" },
      });
      expect(callTool).toHaveBeenCalledWith("zai-zread", "search_doc", {
        repo: "foo/bar",
        query: "hello",
      });
    });

    it("returns error when tool param is missing", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "invoke" });
      expect(text).toContain("Error");
      expect(text).toContain("tool");
    });

    it("returns not-found message for unknown tool", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "invoke", tool: "nope" });
      expect(text).toContain("not found");
    });

    it("returns disambiguation error when tool exists on multiple servers", async () => {
      const { toolIndex, tool } = setup();
      // Add a tool with the same name on a different server
      toolIndex.addTools([
        {
          name: "search_doc",
          originalName: "search_doc",
          serverKey: "other-server",
          description: "Duplicate search tool",
          inputSchema: { type: "object", properties: {} },
          parameterNames: [],
        },
      ]);
      const text = await exec(tool, { action: "invoke", tool: "search_doc" });
      expect(text).toContain("Ambiguous");
      expect(text).toContain("zai-zread");
      expect(text).toContain("other-server");
    });

    it("catches callTool errors and returns them as text", async () => {
      const { tool } = setup(async () => {
        throw new Error("connection refused");
      });
      const text = await exec(tool, {
        action: "invoke",
        tool: "web_search",
        server: "zai-search",
        arguments: { query: "test" },
      });
      expect(text).toContain("Error invoking tool");
      expect(text).toContain("connection refused");
    });
  });

  describe("list_servers action", () => {
    it("returns server summaries", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "list_servers" });
      expect(text).toContain("zai-zread");
      expect(text).toContain("zai-search");
      expect(text).toContain("2 tools");
      expect(text).toContain("1 tool");
    });

    it("returns appropriate message when no servers exist", async () => {
      const toolIndex = new ToolIndex();
      const callTool = vi.fn();
      const tool = createMcpSearchTool({ toolIndex, callTool });
      const text = await exec(tool, { action: "list_servers" });
      expect(text).toContain("No MCP servers connected");
    });
  });

  describe("unknown action", () => {
    it("returns error for invalid action", async () => {
      const { tool } = setup();
      const text = await exec(tool, { action: "delete_everything" });
      expect(text).toContain("Unknown action");
      expect(text).toContain("delete_everything");
    });
  });
});
