import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { readConfigFileSnapshot, writeConfigFile } from "../config/config.js";
import { McpClientManager } from "../mcp/client-manager.js";
import { getMcpClientManager } from "../mcp/index.js";
import { readLockFile, writeLockFile, generateLockFile, diffLockFile } from "../mcp/lock-file.js";
import {
  syncMcpRegistry,
  syncAllMcpRegistries,
  loadCachedMcpServers,
} from "../mcp/registry-sync.js";
import type { RegistryServerEntry } from "../mcp/registry-sync.js";
import type { McpRegistryConfig, McpServerConfig, McpTransportType } from "../mcp/types.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Read the inline MCP servers from config (tools.mcp.servers). */
async function loadMcpServers(): Promise<Record<string, McpServerConfig>> {
  const snapshot = await readConfigFileSnapshot();
  return snapshot.config.tools?.mcp?.servers ?? {};
}

// ── list ─────────────────────────────────────────────────────────────────────

/** `openclaw mcp list` — show configured MCP servers with status. */
export async function mcpListCommand(_runtime: RuntimeEnv = defaultRuntime): Promise<void> {
  const servers = await loadMcpServers();
  const entries = Object.entries(servers);

  if (entries.length === 0) {
    console.log("No MCP servers configured.");
    console.log('Use "openclaw mcp add <name>" to add one.');
    return;
  }

  console.log(`\nConfigured MCP servers (${entries.length}):\n`);
  for (const [name, cfg] of entries) {
    const enabled = cfg.enabled !== false;
    const endpoint =
      cfg.type === "stdio" ? (cfg.command ?? "(no command)") : (cfg.url ?? "(no url)");
    console.log(`  ${name}`);
    console.log(`    type:    ${cfg.type}`);
    console.log(`    url:     ${endpoint}`);
    console.log(`    enabled: ${enabled}`);
    if (cfg.toolNames) {
      console.log(`    naming:  ${cfg.toolNames}`);
    }
    console.log();
  }
}

// ── add ──────────────────────────────────────────────────────────────────────

interface McpAddOptions {
  type: McpTransportType;
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  toolNames?: "prefixed" | "bare";
}

/** `openclaw mcp add <name>` — add a new MCP server to config. */
export async function mcpAddCommand(
  name: string,
  options: McpAddOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.config;
  const existing = cfg.tools?.mcp?.servers ?? {};

  if (existing[name]) {
    runtime.error(
      `MCP server "${name}" already exists. Use "openclaw mcp configure ${name}" to update it.`,
    );
    runtime.exit(1);
    return;
  }

  const serverConfig: McpServerConfig = { type: options.type };
  if (options.url) {
    serverConfig.url = options.url;
  }
  if (options.command) {
    serverConfig.command = options.command;
  }
  if (options.args) {
    serverConfig.args = options.args;
  }
  if (options.headers) {
    serverConfig.headers = options.headers;
  }
  if (options.toolNames) {
    serverConfig.toolNames = options.toolNames;
  }

  const nextCfg = {
    ...cfg,
    tools: {
      ...cfg.tools,
      mcp: {
        ...cfg.tools?.mcp,
        servers: { ...existing, [name]: serverConfig },
      },
    },
  };

  await writeConfigFile(nextCfg);
  console.log(`Added MCP server "${name}" (${options.type}).`);
}

// ── remove ───────────────────────────────────────────────────────────────────

/** `openclaw mcp remove <name>` — remove a configured MCP server. */
export async function mcpRemoveCommand(
  name: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.config;
  const existing = cfg.tools?.mcp?.servers ?? {};

  if (!existing[name]) {
    runtime.error(`MCP server "${name}" not found.`);
    runtime.exit(1);
    return;
  }

  const { [name]: _removed, ...rest } = existing;

  const nextCfg = {
    ...cfg,
    tools: {
      ...cfg.tools,
      mcp: {
        ...cfg.tools?.mcp,
        servers: rest,
      },
    },
  };

  await writeConfigFile(nextCfg);
  console.log(`Removed MCP server "${name}".`);
}

// ── test ─────────────────────────────────────────────────────────────────────

/** `openclaw mcp test [name]` — test connection to one or all servers. */
export async function mcpTestCommand(
  name: string | undefined,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const servers = await loadMcpServers();
  const targets = name ? { [name]: servers[name] } : servers;

  if (name && !servers[name]) {
    runtime.error(`MCP server "${name}" not found.`);
    runtime.exit(1);
    return;
  }

  const entries = Object.entries(targets);
  if (entries.length === 0) {
    console.log("No MCP servers configured.");
    return;
  }

  const manager = new McpClientManager();
  let failures = 0;

  for (const [key, cfg] of entries) {
    if (cfg.enabled === false) {
      console.log(`  ${key}: skipped (disabled)`);
      continue;
    }

    console.log(`  ${key}: connecting...`);
    try {
      await manager.connect(key, cfg);
      const state = manager.getServerState(key);
      if (state?.status === "connected") {
        console.log(`  ${key}: ok (${state.toolCount} tools: ${state.toolNames.join(", ")})`);
      } else {
        console.log(
          `  ${key}: ${state?.status ?? "unknown"} — ${state?.lastError ?? "no details"}`,
        );
        failures++;
      }
    } catch {
      console.log(`  ${key}: connection failed`);
      failures++;
    }
  }

  await manager.closeAll();

  if (failures > 0) {
    runtime.error(`${failures} server(s) failed connection test.`);
    runtime.exit(1);
  }
}

// ── configure ────────────────────────────────────────────────────────────────

interface McpConfigureOptions {
  url?: string;
  command?: string;
  type?: McpTransportType;
  enabled?: boolean;
  toolNames?: "prefixed" | "bare";
  timeout?: number;
}

/** `openclaw mcp configure <name>` — update fields on an existing server. */
export async function mcpConfigureCommand(
  name: string,
  options: McpConfigureOptions,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.config;
  const existing = cfg.tools?.mcp?.servers ?? {};

  if (!existing[name]) {
    runtime.error(`MCP server "${name}" not found.`);
    runtime.exit(1);
    return;
  }

  const updated: McpServerConfig = { ...existing[name] };
  if (options.url !== undefined) {
    updated.url = options.url;
  }
  if (options.command !== undefined) {
    updated.command = options.command;
  }
  if (options.type !== undefined) {
    updated.type = options.type;
  }
  if (options.enabled !== undefined) {
    updated.enabled = options.enabled;
  }
  if (options.toolNames !== undefined) {
    updated.toolNames = options.toolNames;
  }
  if (options.timeout !== undefined) {
    updated.timeout = options.timeout;
  }

  const nextCfg = {
    ...cfg,
    tools: {
      ...cfg.tools,
      mcp: {
        ...cfg.tools?.mcp,
        servers: { ...existing, [name]: updated },
      },
    },
  };

  await writeConfigFile(nextCfg);
  console.log(`Updated MCP server "${name}".`);
}

// ── Browse & Discovery ──────────────────────────────────────────────────────

/** Load registries from config. */
async function loadRegistries(): Promise<McpRegistryConfig[]> {
  const snapshot = await readConfigFileSnapshot();
  return snapshot.config.tools?.mcp?.registries ?? [];
}

/** Collect registry servers, optionally filtered by registry ID. */
async function collectRegistryServers(
  registryFilter?: string,
): Promise<Array<RegistryServerEntry & { registryId: string }>> {
  const registries = await loadRegistries();
  const targets = registryFilter ? registries.filter((r) => r.id === registryFilter) : registries;

  const results: Array<RegistryServerEntry & { registryId: string }> = [];
  for (const reg of targets) {
    if (reg.enabled === false) {
      continue;
    }
    const servers = await loadCachedMcpServers(reg.id);
    for (const srv of servers) {
      results.push({ ...srv, registryId: reg.id });
    }
  }
  return results;
}

/** `openclaw mcp browse` — browse available servers from registries. */
export async function mcpBrowseCommand(
  opts: { category?: string; registry?: string } = {},
): Promise<void> {
  const servers = await collectRegistryServers(opts.registry);

  const filtered = opts.category
    ? servers.filter((s) => s.category.toLowerCase() === opts.category!.toLowerCase())
    : servers;

  if (filtered.length === 0) {
    console.log("No MCP servers found in registry cache.");
    console.log('Run "openclaw mcp sync" to fetch the latest registries.');
    return;
  }

  // Table header
  console.log(
    `\n${"ID".padEnd(24)} ${"Name".padEnd(28)} ${"Type".padEnd(8)} ${"Category".padEnd(14)} ${"Registry".padEnd(16)} Tools`,
  );
  console.log("-".repeat(100));

  for (const srv of filtered) {
    console.log(
      `${srv.id.padEnd(24)} ${srv.name.padEnd(28)} ${srv.type.padEnd(8)} ${srv.category.padEnd(14)} ${srv.registryId.padEnd(16)} ${String(srv.toolCount)}`,
    );
  }

  console.log(`\n${filtered.length} server(s) available.`);
}

/** `openclaw mcp search <query>` — search registry servers by keyword. */
export async function mcpSearchCommand(
  query: string,
  opts: { registry?: string } = {},
): Promise<void> {
  const servers = await collectRegistryServers(opts.registry);
  const lowerQuery = query.toLowerCase();

  const matches = servers.filter((srv) => {
    const haystack = [srv.id, srv.name, srv.description, ...srv.keywords].join(" ").toLowerCase();
    return haystack.includes(lowerQuery);
  });

  if (matches.length === 0) {
    console.log(`No servers matching "${query}".`);
    return;
  }

  console.log(`\nSearch results for "${query}" (${matches.length}):\n`);
  for (const srv of matches) {
    console.log(`  ${srv.id} — ${srv.name}`);
    console.log(`    ${srv.description}`);
    console.log(
      `    type: ${srv.type}  category: ${srv.category}  tools: ${srv.toolCount}  registry: ${srv.registryId}`,
    );
    console.log();
  }
}

/** `openclaw mcp info <serverId>` — show detailed info about a registry server. */
export async function mcpInfoCommand(serverId: string): Promise<void> {
  const servers = await collectRegistryServers();
  const srv = servers.find((s) => s.id === serverId);

  if (!srv) {
    console.log(`Server "${serverId}" not found in registry cache.`);
    console.log('Run "openclaw mcp sync" to fetch the latest registries.');
    return;
  }

  console.log(`\nServer: ${srv.name} (${srv.id})`);
  console.log(`  Description: ${srv.description}`);
  console.log(`  Version:     ${srv.version}`);
  console.log(`  Type:        ${srv.type}`);
  if (srv.url) {
    console.log(`  URL:         ${srv.url}`);
  }
  if (srv.command) {
    console.log(`  Command:     ${srv.command} ${(srv.args ?? []).join(" ")}`);
  }
  console.log(`  Category:    ${srv.category}`);
  console.log(`  Keywords:    ${srv.keywords.length > 0 ? srv.keywords.join(", ") : "(none)"}`);
  console.log(`  Registry:    ${srv.registryId}`);
  console.log(
    `  Auth:        ${srv.authRequired ? `required (${srv.authType ?? "unknown"})` : "none"}`,
  );
  if (srv.authEnv) {
    console.log(`  Auth env:    ${srv.authEnv}`);
  }

  if (srv.toolsPreview.length > 0) {
    console.log(`\n  Tools (${srv.toolCount}):`);
    for (const tool of srv.toolsPreview) {
      console.log(`    - ${tool.name}: ${tool.description}`);
    }
  }

  if (srv.defaults) {
    console.log("\n  Defaults:");
    if (srv.defaults.toolNames) {
      console.log(`    toolNames:      ${srv.defaults.toolNames}`);
    }
    if (srv.defaults.timeout) {
      console.log(`    timeout:        ${srv.defaults.timeout}ms`);
    }
    if (srv.defaults.maxResultBytes) {
      console.log(`    maxResultBytes: ${srv.defaults.maxResultBytes}`);
    }
  }
  console.log();
}

// ── Registry Management ─────────────────────────────────────────────────────

/** `openclaw mcp registry list` — list configured registries. */
export async function mcpRegistryListCommand(): Promise<void> {
  const registries = await loadRegistries();

  if (registries.length === 0) {
    console.log("No MCP registries configured.");
    console.log('Use "openclaw mcp registry add <id> <url>" to add one.');
    return;
  }

  console.log(`\nConfigured MCP registries (${registries.length}):\n`);
  for (const reg of registries) {
    const status = reg.enabled === false ? "disabled" : "enabled";
    console.log(`  ${reg.id} — ${reg.name}`);
    console.log(`    url:        ${reg.url}`);
    console.log(`    status:     ${status}`);
    if (reg.description) {
      console.log(`    description: ${reg.description}`);
    }
    if (reg.visibility) {
      console.log(`    visibility: ${reg.visibility}`);
    }
    console.log();
  }
}

/** `openclaw mcp registry add <id> <url>` — add a registry to config. */
export async function mcpRegistryAddCommand(
  id: string,
  url: string,
  opts: { name?: string; authTokenEnv?: string } = {},
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.config;
  const registries = cfg.tools?.mcp?.registries ?? [];

  if (registries.some((r) => r.id === id)) {
    runtime.error(`Registry "${id}" already exists.`);
    runtime.exit(1);
    return;
  }

  const newRegistry: McpRegistryConfig = {
    id,
    name: opts.name ?? id,
    url,
    enabled: true,
  };
  if (opts.authTokenEnv) {
    newRegistry.auth_token_env = opts.authTokenEnv;
    newRegistry.visibility = "private";
  }

  const nextCfg = {
    ...cfg,
    tools: {
      ...cfg.tools,
      mcp: {
        ...cfg.tools?.mcp,
        registries: [...registries, newRegistry],
      },
    },
  };

  await writeConfigFile(nextCfg);
  console.log(`Added MCP registry "${id}" (${url}).`);
}

/** `openclaw mcp registry remove <id>` — remove a registry from config. */
export async function mcpRegistryRemoveCommand(
  id: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.config;
  const registries = cfg.tools?.mcp?.registries ?? [];

  if (!registries.some((r) => r.id === id)) {
    runtime.error(`Registry "${id}" not found.`);
    runtime.exit(1);
    return;
  }

  const nextCfg = {
    ...cfg,
    tools: {
      ...cfg.tools,
      mcp: {
        ...cfg.tools?.mcp,
        registries: registries.filter((r) => r.id !== id),
      },
    },
  };

  await writeConfigFile(nextCfg);
  console.log(`Removed MCP registry "${id}".`);
}

// ── Sync ────────────────────────────────────────────────────────────────────

/** `openclaw mcp sync` — sync registries and display results. */
export async function mcpSyncCommand(opts: { registry?: string } = {}): Promise<void> {
  const registries = await loadRegistries();

  if (registries.length === 0) {
    console.log("No MCP registries configured.");
    return;
  }

  const log = (msg: string) => console.log(msg);

  if (opts.registry) {
    const target = registries.find((r) => r.id === opts.registry);
    if (!target) {
      console.log(`Registry "${opts.registry}" not found.`);
      return;
    }
    const result = await syncMcpRegistry(target, log);
    console.log(`\nSynced "${result.registry.name}": ${result.servers.length} server(s).`);
    if (result.errors.length > 0) {
      console.log(`Errors (${result.errors.length}):`);
      for (const err of result.errors) {
        console.log(`  - ${err}`);
      }
    }
  } else {
    const results = await syncAllMcpRegistries(registries, log);
    console.log(`\nSync complete: ${results.length} registry(ies).`);
    for (const result of results) {
      const errSuffix = result.errors.length > 0 ? ` (${result.errors.length} error(s))` : "";
      console.log(`  ${result.registry.id}: ${result.servers.length} server(s)${errSuffix}`);
    }
  }
}

// ── Health ───────────────────────────────────────────────────────────────────

/** `openclaw mcp health [server]` — run health checks on MCP servers. */
export async function mcpHealthCommand(
  server?: string,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const servers = await loadMcpServers();
  const entries = Object.entries(servers);

  if (entries.length === 0) {
    console.log("No MCP servers configured.");
    return;
  }

  // Use existing manager if available, otherwise create a temporary one
  const existingManager = getMcpClientManager();
  const manager = existingManager ?? new McpClientManager();
  const shouldClose = !existingManager;
  let failures = 0;

  const targets = server ? entries.filter(([key]) => key === server) : entries;

  if (server && targets.length === 0) {
    runtime.error(`MCP server "${server}" not found.`);
    runtime.exit(1);
    return;
  }

  console.log(`\nMCP Server Health (${targets.length}):\n`);

  for (const [key, cfg] of targets) {
    if (cfg.enabled === false) {
      console.log(`  ${key}: disabled (skipped)`);
      console.log();
      continue;
    }

    // Connect if not already connected
    if (!existingManager) {
      try {
        await manager.connect(key, cfg);
      } catch {
        // Connection error handled below via state check
      }
    }

    const state = manager.getServerState(key);

    if (!state) {
      console.log(`  ${key}: not connected`);
      failures++;
      console.log();
      continue;
    }

    console.log(`  ${key}:`);
    console.log(`    status:    ${state.status}`);
    console.log(`    type:      ${state.type}`);
    console.log(`    tools:     ${state.toolCount}`);
    if (state.avgLatencyMs !== undefined) {
      console.log(`    latency:   ${Math.round(state.avgLatencyMs)}ms`);
    }
    if (state.lastCallAt) {
      console.log(`    last call: ${new Date(state.lastCallAt).toISOString()}`);
    }
    if (state.lastError) {
      console.log(`    error:     ${state.lastError}`);
    }

    if (state.status !== "connected") {
      failures++;
    }
    console.log();
  }

  if (shouldClose) {
    await manager.closeAll();
  }

  if (failures > 0) {
    runtime.error(`${failures} server(s) unhealthy.`);
    runtime.exit(1);
  }
}

// ── Lock File ───────────────────────────────────────────────────────────────

/** `openclaw mcp lock` — manage the MCP lock file. */
export async function mcpLockCommand(
  opts: { regenerate?: boolean; check?: boolean; strict?: boolean } = {},
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const projectRoot = process.cwd();

  if (opts.regenerate) {
    // Generate lock file from currently configured servers
    const servers = await loadMcpServers();
    const serverEntries: Record<
      string,
      { config: McpServerConfig; tools: string[]; scope: "project" }
    > = {};

    for (const [key, cfg] of Object.entries(servers)) {
      serverEntries[key] = {
        config: cfg,
        tools: [], // tools are not discoverable without connecting
        scope: "project",
      };
    }

    const lockFile = generateLockFile({ servers: serverEntries });
    await writeLockFile("project", projectRoot, lockFile);
    console.log(`Lock file regenerated with ${Object.keys(servers).length} server(s).`);
    return;
  }

  if (opts.check) {
    const lockFile = await readLockFile("project", projectRoot);
    if (!lockFile) {
      console.log("No lock file found. Run with --regenerate to create one.");
      if (opts.strict) {
        runtime.exit(1);
      }
      return;
    }

    const servers = await loadMcpServers();
    const currentServers: Record<
      string,
      { type: McpTransportType; url?: string; tools: string[] }
    > = {};
    for (const [key, cfg] of Object.entries(servers)) {
      currentServers[key] = {
        type: cfg.type,
        url: cfg.url,
        tools: [],
      };
    }

    const diff = diffLockFile(lockFile, currentServers);

    if (diff.matches) {
      console.log("Lock file matches current state.");
      return;
    }

    console.log("Lock file differs from current state:\n");
    if (diff.added.length > 0) {
      console.log("  In lock file but not configured:");
      for (const name of diff.added) {
        console.log(`    + ${name}`);
      }
    }
    if (diff.removed.length > 0) {
      console.log("  Configured but not in lock file:");
      for (const name of diff.removed) {
        console.log(`    - ${name}`);
      }
    }
    if (diff.changed.length > 0) {
      console.log("  Changed (type or URL differs):");
      for (const name of diff.changed) {
        console.log(`    ~ ${name}`);
      }
    }

    if (opts.strict) {
      runtime.error("Lock file mismatch (strict mode).");
      runtime.exit(1);
    }
    return;
  }

  // Default: show lock file status
  const lockFile = await readLockFile("project", projectRoot);
  if (!lockFile) {
    console.log("No lock file found.");
    console.log('Use "openclaw mcp lock --regenerate" to create one.');
    return;
  }

  const serverCount = Object.keys(lockFile.servers).length;
  const registryCount = Object.keys(lockFile.registry).length;
  console.log(`Lock file: ${serverCount} server(s), ${registryCount} registry(ies).`);
  console.log("Use --check to compare with current state, --regenerate to recreate.");
}

// ── Import ──────────────────────────────────────────────────────────────────

/** Source config format from Claude Code (~/.claude.json). */
interface ClaudeCodeMcpConfig {
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
    }
  >;
}

/** Source config format from Cursor (~/.cursor/mcp.json) and .mcp.json. */
interface CursorMcpConfig {
  mcpServers?: Record<
    string,
    {
      command?: string;
      args?: string[];
      url?: string;
      env?: Record<string, string>;
    }
  >;
}

/** `openclaw mcp import <source>` — import MCP servers from external tools. */
export async function mcpImportCommand(
  source: string,
  opts: { scope?: string } = {},
  runtime: RuntimeEnv = defaultRuntime,
): Promise<void> {
  const validSources = ["claude-code", "cursor", "project"];
  if (!validSources.includes(source)) {
    runtime.error(`Invalid import source "${source}". Valid sources: ${validSources.join(", ")}`);
    runtime.exit(1);
    return;
  }

  let imported: Record<string, McpServerConfig> = {};

  if (source === "claude-code") {
    const configPath = join(homedir(), ".claude.json");
    imported = await importFromJsonFile<ClaudeCodeMcpConfig>(configPath, "mcpServers");
  } else if (source === "cursor") {
    const configPath = join(homedir(), ".cursor", "mcp.json");
    imported = await importFromJsonFile<CursorMcpConfig>(configPath, "mcpServers");
  } else if (source === "project") {
    const configPath = join(process.cwd(), ".mcp.json");
    imported = await importFromJsonFile<CursorMcpConfig>(configPath, "mcpServers");
  }

  const entries = Object.entries(imported);
  if (entries.length === 0) {
    console.log(`No MCP servers found in ${source} config.`);
    return;
  }

  // Add imported servers to openclaw config
  const snapshot = await readConfigFileSnapshot();
  const cfg = snapshot.config;
  const existing = cfg.tools?.mcp?.servers ?? {};
  let addedCount = 0;
  let skippedCount = 0;

  const merged = { ...existing };
  for (const [name, serverCfg] of entries) {
    if (merged[name]) {
      console.log(`  Skipped "${name}" (already exists).`);
      skippedCount++;
    } else {
      merged[name] = serverCfg;
      console.log(`  Imported "${name}" (${serverCfg.type}).`);
      addedCount++;
    }
  }

  if (addedCount > 0) {
    const nextCfg = {
      ...cfg,
      tools: {
        ...cfg.tools,
        mcp: {
          ...cfg.tools?.mcp,
          servers: merged,
        },
      },
    };
    await writeConfigFile(nextCfg);
  }

  console.log(
    `\nImported ${addedCount} server(s) from ${source}${skippedCount > 0 ? `, ${skippedCount} skipped` : ""}.`,
  );
}

/**
 * Read a JSON config file and convert its mcpServers entries to McpServerConfig.
 * The shape is shared across Claude Code, Cursor, and .mcp.json.
 */
async function importFromJsonFile<T extends { mcpServers?: Record<string, unknown> }>(
  filePath: string,
  key: "mcpServers",
): Promise<Record<string, McpServerConfig>> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    console.log(`Config file not found: ${filePath}`);
    return {};
  }

  let parsed: T;
  try {
    parsed = JSON.parse(content) as T;
  } catch {
    console.log(`Failed to parse: ${filePath}`);
    return {};
  }

  const sourceServers = parsed[key];
  if (!sourceServers || typeof sourceServers !== "object") {
    return {};
  }

  const result: Record<string, McpServerConfig> = {};
  for (const [name, raw] of Object.entries(sourceServers)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const entry = raw as Record<string, unknown>;

    // Determine transport type from the source entry
    const hasCommand = typeof entry.command === "string";
    const hasUrl = typeof entry.url === "string";
    const type: McpTransportType = hasCommand ? "stdio" : hasUrl ? "http" : "stdio";

    const serverCfg: McpServerConfig = { type };
    if (hasCommand) {
      serverCfg.command = entry.command as string;
    }
    if (hasUrl) {
      serverCfg.url = entry.url as string;
    }
    if (Array.isArray(entry.args)) {
      serverCfg.args = entry.args as string[];
    }
    if (entry.env && typeof entry.env === "object") {
      serverCfg.env = entry.env as Record<string, string>;
    }

    result[name] = serverCfg;
  }

  return result;
}
