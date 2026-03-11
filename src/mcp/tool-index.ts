import type { ToolIndexEntry } from "./types.js";

/** Compact search result card suitable for LLM consumption. */
export interface SearchResult {
  tool: string;
  server: string;
  description: string;
  parametersSummary: string;
}

/** Summary of a connected MCP server and its tools. */
export interface ServerSummary {
  server: string;
  toolCount: number;
  tools: string[];
}

/**
 * Build a human-readable parameter summary from a JSON Schema input definition.
 * Format: "repo (required), query (required), path"
 */
function buildParametersSummary(inputSchema: Record<string, unknown>): string {
  const properties = inputSchema.properties as Record<string, unknown> | undefined;
  if (!properties) {
    return "";
  }

  const requiredSet = new Set<string>(
    Array.isArray(inputSchema.required) ? (inputSchema.required as string[]) : [],
  );

  return Object.keys(properties)
    .map((name) => (requiredSet.has(name) ? `${name} (required)` : name))
    .join(", ");
}

/**
 * Extract searchable keywords from a tool entry.
 * Splits the name on underscores/hyphens and the description into words,
 * lowercases everything, and deduplicates.
 */
function extractKeywords(entry: ToolIndexEntry): string[] {
  const nameTokens = entry.name.toLowerCase().split(/[_-]+/);
  const descTokens = entry.description.toLowerCase().split(/\s+/);
  const all = [...nameTokens, ...descTokens].filter(Boolean);
  return [...new Set(all)];
}

/** Indexed tool with precomputed keywords for search. */
interface IndexedTool {
  entry: ToolIndexEntry;
  keywords: string[];
  parametersSummary: string;
}

/**
 * In-memory search index over MCP tool metadata.
 *
 * Uses simple keyword/substring matching — no vector search needed at this scale.
 * Query tokens are AND-matched against precomputed keywords derived from
 * tool name + description.
 */
export class ToolIndex {
  private indexed: IndexedTool[] = [];

  /** Number of indexed tools. */
  get size(): number {
    return this.indexed.length;
  }

  /** Add tools to the index. Duplicate entries (same name + serverKey) are skipped. */
  addTools(tools: ToolIndexEntry[]): void {
    for (const entry of tools) {
      const exists = this.indexed.some(
        (t) => t.entry.name === entry.name && t.entry.serverKey === entry.serverKey,
      );
      if (exists) {
        continue;
      }

      this.indexed.push({
        entry,
        keywords: extractKeywords(entry),
        parametersSummary: buildParametersSummary(entry.inputSchema),
      });
    }
  }

  /**
   * Search the index using keyword matching.
   *
   * All query tokens must match at least one keyword (substring match).
   * Results are sorted by relevance — tools with more keyword hits rank higher.
   */
  search(query: string): SearchResult[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    if (tokens.length === 0) {
      return [];
    }

    const scored: { tool: IndexedTool; score: number }[] = [];

    for (const tool of this.indexed) {
      let allTokensMatch = true;
      let totalHits = 0;

      for (const token of tokens) {
        const hits = tool.keywords.filter((kw) => kw.includes(token)).length;
        if (hits === 0) {
          allTokensMatch = false;
          break;
        }
        totalHits += hits;
      }

      if (allTokensMatch) {
        scored.push({ tool, score: totalHits });
      }
    }

    // Sort by descending relevance score
    scored.sort((a, b) => b.score - a.score);

    return scored.map(({ tool }) => ({
      tool: tool.entry.name,
      server: tool.entry.serverKey,
      description: tool.entry.description,
      parametersSummary: tool.parametersSummary,
    }));
  }

  /** Get full schema for a tool by name, optionally disambiguated by server key. */
  getSchema(toolName: string, serverKey?: string): ToolIndexEntry | undefined {
    return this.findTool(toolName, serverKey);
  }

  /** Find a specific tool by name, optionally disambiguated by server key. */
  findTool(toolName: string, serverKey?: string): ToolIndexEntry | undefined {
    for (const { entry } of this.indexed) {
      if (entry.name === toolName && (serverKey === undefined || entry.serverKey === serverKey)) {
        return entry;
      }
    }
    return undefined;
  }

  /** List connected servers with tool counts. */
  listServers(): ServerSummary[] {
    const serverMap = new Map<string, string[]>();

    for (const { entry } of this.indexed) {
      let tools = serverMap.get(entry.serverKey);
      if (!tools) {
        tools = [];
        serverMap.set(entry.serverKey, tools);
      }
      tools.push(entry.name);
    }

    return Array.from(serverMap.entries()).map(([server, tools]) => ({
      server,
      toolCount: tools.length,
      tools,
    }));
  }

  /** Reset the index, removing all entries. */
  clear(): void {
    this.indexed = [];
  }
}
