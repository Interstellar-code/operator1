/**
 * MCP server installation scope management.
 *
 * Handles local → project → user scope resolution and config merging.
 * Mirrors the agent scope pattern in `src/config/agent-scope.ts`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { McpConfig, McpScope, McpServerConfig } from "./types.js";

// ── Scope paths ──────────────────────────────────────────────────────────────

/**
 * Resolve the MCP config directory for a given scope.
 *
 * - local:   `<projectRoot>/.openclaw/mcp.local/`
 * - project: `<projectRoot>/.openclaw/mcp/`
 * - user:    `~/.openclaw/mcp/`
 */
export function mcpDirForScope(scope: McpScope, projectRoot: string): string {
  switch (scope) {
    case "local":
      return join(projectRoot, ".openclaw", "mcp.local");
    case "project":
      return join(projectRoot, ".openclaw", "mcp");
    case "user":
      return join(homedir(), ".openclaw", "mcp");
  }
}

/**
 * Resolve the MCP lock file path for a given scope.
 */
export function mcpLockFileForScope(scope: McpScope, projectRoot: string): string {
  switch (scope) {
    case "local":
      return join(projectRoot, ".openclaw", "mcp.local-lock.yaml");
    case "project":
      return join(projectRoot, ".openclaw", "mcp-lock.yaml");
    case "user":
      return join(homedir(), ".openclaw", "mcp-lock.yaml");
  }
}

// ── Config loading ───────────────────────────────────────────────────────────

/**
 * Try to load MCP servers config from a scope directory's `servers.yaml`.
 * Returns an empty record if the file doesn't exist or is invalid.
 */
export async function loadServersFromScope(
  scope: McpScope,
  projectRoot: string,
): Promise<Record<string, McpServerConfig>> {
  const filePath = join(mcpDirForScope(scope, projectRoot), "servers.yaml");
  try {
    const content = await readFile(filePath, "utf-8");
    const parsed = parseYaml(content) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    // Basic validation: each value should be an object with a `type` field
    const servers: Record<string, McpServerConfig> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object" && "type" in value) {
        servers[key] = value as McpServerConfig;
      }
    }
    return servers;
  } catch {
    return {};
  }
}

// ── Scope resolution ─────────────────────────────────────────────────────────

/** Resolution order: user (broadest) → project → local (narrowest wins). */
const SCOPE_LOAD_ORDER: McpScope[] = ["user", "project", "local"];

/**
 * Merge MCP server configs from all scopes with the inline config.
 *
 * Priority (narrowest wins on key collision):
 * 1. Inline config from `tools.mcp.servers` (highest — explicit config)
 * 2. Local scope (`.openclaw/mcp.local/servers.yaml`)
 * 3. Project scope (`.openclaw/mcp/servers.yaml`)
 * 4. User scope (`~/.openclaw/mcp/servers.yaml`)
 */
export async function resolveMcpServers(
  inlineConfig: McpConfig | undefined,
  projectRoot: string,
): Promise<Record<string, McpServerConfig>> {
  const merged: Record<string, McpServerConfig> = {};

  // Load broadest first so narrower scopes overwrite.
  for (const scope of SCOPE_LOAD_ORDER) {
    const servers = await loadServersFromScope(scope, projectRoot);
    Object.assign(merged, servers);
  }

  // Inline config (from tools.mcp.servers) takes highest priority.
  if (inlineConfig?.servers) {
    Object.assign(merged, inlineConfig.servers);
  }

  return merged;
}

/**
 * Resolve the effective MCP config by merging scope-based servers
 * with the inline config's global settings.
 */
export async function resolveEffectiveMcpConfig(
  inlineConfig: McpConfig | undefined,
  projectRoot: string,
): Promise<{ config: McpConfig; servers: Record<string, McpServerConfig> }> {
  const servers = await resolveMcpServers(inlineConfig, projectRoot);

  const config: McpConfig = {
    maxResultBytes: inlineConfig?.maxResultBytes,
    toolSearchThreshold: inlineConfig?.toolSearchThreshold,
    toolSearch: inlineConfig?.toolSearch,
    registries: inlineConfig?.registries,
    servers,
  };

  return { config, servers };
}

// ── Scope writing ─────────────────────────────────────────────────────────

/**
 * Write the full servers record to a scope's `servers.yaml`.
 * Creates the directory if it doesn't exist.
 */
export async function writeServersToScope(
  scope: McpScope,
  projectRoot: string,
  servers: Record<string, McpServerConfig>,
): Promise<void> {
  const dir = mcpDirForScope(scope, projectRoot);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, "servers.yaml");

  // Strip comment-only or empty files; write the YAML content.
  const yaml = stringifyYaml(servers, { lineWidth: 120 });
  await writeFile(filePath, yaml, "utf-8");
}

/**
 * Find which scope a server key lives in. Checks narrowest → broadest.
 * Returns undefined if the server isn't found in any scope file.
 */
export async function findServerScope(
  serverKey: string,
  projectRoot: string,
): Promise<McpScope | undefined> {
  // Check narrowest first so the UI targets the most-specific scope.
  const searchOrder: McpScope[] = ["local", "project", "user"];
  for (const scope of searchOrder) {
    const servers = await loadServersFromScope(scope, projectRoot);
    if (serverKey in servers) {
      return scope;
    }
  }
  return undefined;
}

/**
 * Add or update a server in a specific scope's `servers.yaml`.
 */
export async function upsertServerInScope(
  scope: McpScope,
  projectRoot: string,
  serverKey: string,
  config: McpServerConfig,
): Promise<void> {
  const servers = await loadServersFromScope(scope, projectRoot);
  servers[serverKey] = config;
  await writeServersToScope(scope, projectRoot, servers);
}

/**
 * Remove a server from a specific scope's `servers.yaml`.
 * Returns true if the server was found and removed.
 */
export async function removeServerFromScope(
  scope: McpScope,
  projectRoot: string,
  serverKey: string,
): Promise<boolean> {
  const servers = await loadServersFromScope(scope, projectRoot);
  if (!(serverKey in servers)) {
    return false;
  }
  delete servers[serverKey];
  await writeServersToScope(scope, projectRoot, servers);
  return true;
}
