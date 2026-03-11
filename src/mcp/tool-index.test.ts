import { describe, expect, it } from "vitest";
import { ToolIndex } from "./tool-index.js";
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

describe("ToolIndex", () => {
  describe("addTools", () => {
    it("adds tools to the index", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);
      expect(index.size).toBe(3);
    });

    it("skips duplicate entries with same name and serverKey", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);
      index.addTools([mockTools[0]]);
      expect(index.size).toBe(3);
    });
  });

  describe("search", () => {
    it("AND-matches across keywords and sorts by relevance", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      // "search" matches search_doc and web_search
      const results = index.search("search");
      expect(results.length).toBe(2);
      expect(results.map((r) => r.tool)).toContain("search_doc");
      expect(results.map((r) => r.tool)).toContain("web_search");
    });

    it("returns empty for empty query", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);
      expect(index.search("")).toEqual([]);
      expect(index.search("   ")).toEqual([]);
    });

    it("returns empty when no tools match", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);
      expect(index.search("nonexistent_xyz")).toEqual([]);
    });

    it("AND-matches multiple tokens", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      // "search doc" should match search_doc but not web_search (no "doc" keyword)
      const results = index.search("search doc");
      expect(results.length).toBe(1);
      expect(results[0]?.tool).toBe("search_doc");
    });
  });

  describe("getSchema", () => {
    it("returns full entry by name", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      const entry = index.getSchema("read_file");
      expect(entry).toBeDefined();
      expect(entry?.name).toBe("read_file");
      expect(entry?.serverKey).toBe("zai-zread");
      expect(entry?.inputSchema).toEqual(mockTools[1]?.inputSchema);
    });

    it("returns undefined for unknown tool", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);
      expect(index.getSchema("does_not_exist")).toBeUndefined();
    });

    it("disambiguates by server key", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      const entry = index.getSchema("web_search", "zai-search");
      expect(entry).toBeDefined();
      expect(entry?.serverKey).toBe("zai-search");

      // Wrong server key returns undefined
      expect(index.getSchema("web_search", "zai-zread")).toBeUndefined();
    });
  });

  describe("findTool", () => {
    it("returns full entry by name (same as getSchema)", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      const entry = index.findTool("search_doc");
      expect(entry).toBeDefined();
      expect(entry?.name).toBe("search_doc");
      expect(entry?.serverKey).toBe("zai-zread");
    });
  });

  describe("listServers", () => {
    it("returns server summaries grouped by server key", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      const servers = index.listServers();
      expect(servers).toHaveLength(2);

      const zread = servers.find((s) => s.server === "zai-zread");
      expect(zread).toBeDefined();
      expect(zread?.toolCount).toBe(2);
      expect(zread?.tools).toContain("search_doc");
      expect(zread?.tools).toContain("read_file");

      const zsearch = servers.find((s) => s.server === "zai-search");
      expect(zsearch).toBeDefined();
      expect(zsearch?.toolCount).toBe(1);
      expect(zsearch?.tools).toContain("web_search");
    });
  });

  describe("size", () => {
    it("reflects added tool count", () => {
      const index = new ToolIndex();
      expect(index.size).toBe(0);
      index.addTools([mockTools[0]]);
      expect(index.size).toBe(1);
      index.addTools([mockTools[1], mockTools[2]]);
      expect(index.size).toBe(3);
    });
  });

  describe("clear", () => {
    it("resets the index", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);
      expect(index.size).toBe(3);
      index.clear();
      expect(index.size).toBe(0);
      expect(index.search("search")).toEqual([]);
    });
  });

  describe("buildParametersSummary (via search result)", () => {
    it("shows required markers for required parameters", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      // web_search has query (required) and limit (optional)
      const results = index.search("web search");
      const webSearch = results.find((r) => r.tool === "web_search");
      expect(webSearch).toBeDefined();
      expect(webSearch?.parametersSummary).toBe("query (required), limit");
    });

    it("marks all parameters as required when all are required", () => {
      const index = new ToolIndex();
      index.addTools(mockTools);

      // search_doc has repo (required) and query (required)
      const results = index.search("search doc");
      const searchDoc = results.find((r) => r.tool === "search_doc");
      expect(searchDoc).toBeDefined();
      expect(searchDoc?.parametersSummary).toBe("repo (required), query (required)");
    });
  });
});
