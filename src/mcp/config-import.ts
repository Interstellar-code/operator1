/**
 * Auto-import MCP servers from Claude Code, Cursor, and project .mcp.json files.
 *
 * Provides lower-level parsing functions usable from both CLI and gateway RPCs.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { McpServerConfig, McpTransportType } from "./types.js";

export interface ImportResult {
  imported: string[];
  skipped: string[];
  errors: string[];
}

/** Detect transport type from config shape. */
function detectType(entry: Record<string, unknown>): McpTransportType {
  if (entry.command) {
    return "stdio";
  }
  if (entry.type === "sse") {
    return "sse";
  }
  if (entry.type === "http") {
    return "http";
  }
  // Default: if URL ends with /sse, use sse; otherwise http
  const url = entry.url as string | undefined;
  if (url?.endsWith("/sse")) {
    return "sse";
  }
  return "http";
}

/** Convert a Claude Code / Cursor MCP server entry to McpServerConfig. */
export function convertImportEntry(entry: Record<string, unknown>): McpServerConfig {
  const type = detectType(entry);

  const config: McpServerConfig = { type };

  if (typeof entry.url === "string") {
    config.url = entry.url;
  }
  if (typeof entry.command === "string") {
    config.command = entry.command;
  }
  if (Array.isArray(entry.args)) {
    config.args = entry.args.filter((a): a is string => typeof a === "string");
  }
  if (entry.env && typeof entry.env === "object" && !Array.isArray(entry.env)) {
    config.env = entry.env as Record<string, string>;
  }
  if (entry.headers && typeof entry.headers === "object" && !Array.isArray(entry.headers)) {
    config.headers = entry.headers as Record<string, string>;
  }
  if (typeof entry.cwd === "string") {
    config.cwd = entry.cwd;
  }

  return config;
}

/**
 * Safely read and parse a JSON file. Returns undefined if the file is missing
 * or unparseable.
 */
async function readJsonFile(filePath: string): Promise<Record<string, unknown> | undefined> {
  try {
    const content = await readFile(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Extract MCP servers from a parsed config object that contains an
 * `mcpServers` key (Claude Code / Cursor / Claude Desktop format).
 */
function extractServers(data: Record<string, unknown>): Record<string, McpServerConfig> {
  const servers = data.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    return {};
  }

  const result: Record<string, McpServerConfig> = {};
  for (const [name, entry] of Object.entries(servers as Record<string, unknown>)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      result[name] = convertImportEntry(entry as Record<string, unknown>);
    }
  }
  return result;
}

/** Parse Claude Code config file (~/.claude.json) and extract MCP servers. */
export async function parseClaudeCodeConfig(
  configPath?: string,
): Promise<Record<string, McpServerConfig>> {
  const path = configPath ?? join(homedir(), ".claude.json");
  const data = await readJsonFile(path);
  if (!data) {
    return {};
  }
  return extractServers(data);
}

/** Parse Cursor MCP config (~/.cursor/mcp.json). */
export async function parseCursorConfig(
  configPath?: string,
): Promise<Record<string, McpServerConfig>> {
  const path = configPath ?? join(homedir(), ".cursor", "mcp.json");
  const data = await readJsonFile(path);
  if (!data) {
    return {};
  }
  return extractServers(data);
}

/** Parse project .mcp.json (Claude Code project scope). */
export async function parseProjectMcpJson(
  projectRoot?: string,
): Promise<Record<string, McpServerConfig>> {
  const root = projectRoot ?? process.cwd();
  const path = resolve(root, ".mcp.json");
  const data = await readJsonFile(path);
  if (!data) {
    return {};
  }
  return extractServers(data);
}

/** Parse Claude Desktop config (platform-specific). */
export async function parseClaudeDesktopConfig(): Promise<Record<string, McpServerConfig>> {
  let configPath: string;
  if (process.platform === "darwin") {
    configPath = join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
  } else if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
    configPath = join(appData, "Claude", "claude_desktop_config.json");
  } else {
    // Linux: XDG config
    const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
    configPath = join(xdgConfig, "Claude", "claude_desktop_config.json");
  }

  const data = await readJsonFile(configPath);
  if (!data) {
    return {};
  }
  return extractServers(data);
}

/**
 * Get the effective URL for duplicate detection.
 * For stdio servers, builds a canonical key from command + args.
 */
function getServerIdentity(config: McpServerConfig): string {
  if (config.type === "stdio" && config.command) {
    const parts = [config.command, ...(config.args ?? [])];
    return `stdio:${parts.join(" ")}`;
  }
  return config.url ?? "";
}

/**
 * Import servers from a source, merging into existing config.
 * Skips duplicates by URL (or command+args for stdio).
 */
export function mergeImportedServers(
  existing: Record<string, McpServerConfig>,
  imported: Record<string, McpServerConfig>,
): ImportResult {
  const result: ImportResult = {
    imported: [],
    skipped: [],
    errors: [],
  };

  // Build a set of existing identities for duplicate detection
  const existingIdentities = new Set<string>();
  for (const config of Object.values(existing)) {
    const identity = getServerIdentity(config);
    if (identity) {
      existingIdentities.add(identity);
    }
  }

  // Also track existing names
  const existingNames = new Set(Object.keys(existing));

  for (const [name, config] of Object.entries(imported)) {
    const identity = getServerIdentity(config);

    // Skip if a server with the same URL/command already exists
    if (identity && existingIdentities.has(identity)) {
      result.skipped.push(name);
      continue;
    }

    // Skip if name already taken (avoid overwriting)
    if (existingNames.has(name)) {
      result.skipped.push(name);
      continue;
    }

    existing[name] = config;
    existingNames.add(name);
    if (identity) {
      existingIdentities.add(identity);
    }
    result.imported.push(name);
  }

  return result;
}
