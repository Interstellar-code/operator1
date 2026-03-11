import { describe, expect, it } from "vitest";
import { convertImportEntry, mergeImportedServers } from "./config-import.js";
import type { McpServerConfig } from "./types.js";

describe("convertImportEntry", () => {
  it("converts a stdio entry", () => {
    const result = convertImportEntry({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "abc" },
    });
    expect(result).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: { GITHUB_TOKEN: "abc" },
    });
  });

  it("converts an SSE entry with explicit type", () => {
    const result = convertImportEntry({
      type: "sse",
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer test" },
    });
    expect(result).toEqual({
      type: "sse",
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer test" },
    });
  });

  it("auto-detects SSE from URL suffix", () => {
    const result = convertImportEntry({
      url: "https://example.com/sse",
    });
    expect(result.type).toBe("sse");
  });

  it("defaults to http when no type hint", () => {
    const result = convertImportEntry({
      url: "https://example.com/mcp",
    });
    expect(result.type).toBe("http");
  });

  it("preserves cwd for stdio entries", () => {
    const result = convertImportEntry({
      command: "node",
      args: ["server.js"],
      cwd: "/home/user/project",
    });
    expect(result.cwd).toBe("/home/user/project");
  });

  it("ignores non-string args", () => {
    const result = convertImportEntry({
      command: "node",
      args: ["valid", 123, null, "also-valid"],
    });
    expect(result.args).toEqual(["valid", "also-valid"]);
  });
});

describe("mergeImportedServers", () => {
  it("imports new servers", () => {
    const existing: Record<string, McpServerConfig> = {};
    const imported: Record<string, McpServerConfig> = {
      docs: { type: "sse", url: "https://docs.example.com/sse" },
      search: { type: "http", url: "https://search.example.com/mcp" },
    };

    const result = mergeImportedServers(existing, imported);
    expect(result.imported).toEqual(["docs", "search"]);
    expect(result.skipped).toEqual([]);
    expect(Object.keys(existing)).toEqual(["docs", "search"]);
  });

  it("skips servers with duplicate URLs", () => {
    const existing: Record<string, McpServerConfig> = {
      "my-docs": { type: "sse", url: "https://docs.example.com/sse" },
    };
    const imported: Record<string, McpServerConfig> = {
      docs: { type: "sse", url: "https://docs.example.com/sse" },
    };

    const result = mergeImportedServers(existing, imported);
    expect(result.skipped).toEqual(["docs"]);
    expect(result.imported).toEqual([]);
  });

  it("skips servers with duplicate names", () => {
    const existing: Record<string, McpServerConfig> = {
      docs: { type: "http", url: "https://other.example.com/mcp" },
    };
    const imported: Record<string, McpServerConfig> = {
      docs: { type: "sse", url: "https://docs.example.com/sse" },
    };

    const result = mergeImportedServers(existing, imported);
    expect(result.skipped).toEqual(["docs"]);
  });

  it("skips stdio servers with duplicate command+args", () => {
    const existing: Record<string, McpServerConfig> = {
      github: { type: "stdio", command: "npx", args: ["-y", "mcp-github"] },
    };
    const imported: Record<string, McpServerConfig> = {
      "github-2": { type: "stdio", command: "npx", args: ["-y", "mcp-github"] },
    };

    const result = mergeImportedServers(existing, imported);
    expect(result.skipped).toEqual(["github-2"]);
  });

  it("imports stdio servers with different commands", () => {
    const existing: Record<string, McpServerConfig> = {
      github: { type: "stdio", command: "npx", args: ["-y", "mcp-github"] },
    };
    const imported: Record<string, McpServerConfig> = {
      slack: { type: "stdio", command: "npx", args: ["-y", "mcp-slack"] },
    };

    const result = mergeImportedServers(existing, imported);
    expect(result.imported).toEqual(["slack"]);
  });
});
