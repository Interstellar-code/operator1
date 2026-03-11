import { execFile } from "node:child_process";
/**
 * Git-based MCP registry sync.
 *
 * Syncs MCP server registries from git repos, parses mcp-registry.json
 * manifests, and maintains a local cache for offline support.
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";
import type { McpRegistryConfig } from "./types.js";

const execFileAsync = promisify(execFile);

// ── Types ────────────────────────────────────────────────────────────────────

/** Parsed server entry from a registry's server.yaml */
export interface RegistryServerEntry {
  id: string;
  name: string;
  description: string;
  version: string;
  type: "http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  authRequired: boolean;
  authType?: "bearer" | "oauth";
  authEnv?: string;
  category: string;
  keywords: string[];
  toolCount: number;
  toolsPreview: Array<{ name: string; description: string }>;
  defaults?: {
    toolNames?: "prefixed" | "bare";
    timeout?: number;
    maxResultBytes?: number;
  };
}

/** Result from syncing a single registry */
export interface McpSyncResult {
  registry: McpRegistryConfig;
  servers: RegistryServerEntry[];
  errors: string[];
  syncedAt: string;
  commit?: string;
}

/** Shape of the mcp-registry.json manifest */
interface McpRegistryManifest {
  servers: string[];
}

/** Shape of the .sync-meta.json file */
interface SyncMeta {
  registryId: string;
  commit: string;
  syncedAt: string;
  serverCount: number;
}

// ── Cache paths ──────────────────────────────────────────────────────────────

function cacheDir(registryId: string): string {
  return join(homedir(), ".openclaw", "mcp-registry-cache", registryId);
}

function syncMetaPath(registryId: string): string {
  return join(cacheDir(registryId), ".sync-meta.json");
}

// ── Git operations ───────────────────────────────────────────────────────────

async function gitCloneOrPull(
  url: string,
  targetDir: string,
  authToken?: string,
): Promise<{ commit: string }> {
  // Build authenticated URL if token provided
  let authUrl = url;
  if (authToken) {
    const parsed = new URL(url);
    parsed.username = "oauth2";
    parsed.password = authToken;
    authUrl = parsed.toString();
  }

  try {
    // Try pull first (repo already cloned)
    await execFileAsync("git", ["-C", targetDir, "pull", "--rebase", "--quiet"], {
      timeout: 60_000,
    });
  } catch {
    // Clone fresh (shallow for speed)
    await mkdir(targetDir, { recursive: true });
    // Remove existing dir contents to avoid clone conflicts
    const { rm } = await import("node:fs/promises");
    await rm(targetDir, { recursive: true, force: true });
    await execFileAsync("git", ["clone", "--depth", "1", "--quiet", authUrl, targetDir], {
      timeout: 120_000,
    });
  }

  // Get current commit hash
  const { stdout } = await execFileAsync("git", ["-C", targetDir, "rev-parse", "HEAD"]);
  return { commit: stdout.trim() };
}

// ── Registry manifest parsing ────────────────────────────────────────────────

async function loadRegistryManifest(dir: string): Promise<McpRegistryManifest | null> {
  try {
    const content = await readFile(join(dir, "mcp-registry.json"), "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;

    // Basic validation: must have a servers array of strings
    if (
      !parsed ||
      !Array.isArray(parsed.servers) ||
      !parsed.servers.every((s: unknown) => typeof s === "string")
    ) {
      return null;
    }

    return { servers: parsed.servers };
  } catch {
    return null;
  }
}

// ── Server YAML parsing ──────────────────────────────────────────────────────

/** Parse a single server.yaml into a RegistryServerEntry */
async function loadServerYaml(serverDir: string): Promise<RegistryServerEntry | null> {
  try {
    const content = await readFile(join(serverDir, "server.yaml"), "utf-8");
    const raw = parseYaml(content) as Record<string, unknown>;

    if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") {
      return null;
    }

    const auth = raw.auth as Record<string, unknown> | undefined;
    const tools = Array.isArray(raw.tools) ? raw.tools : [];
    const defaults = raw.defaults as Record<string, unknown> | undefined;

    const toolsPreview: Array<{ name: string; description: string }> = [];
    for (const tool of tools) {
      if (tool && typeof tool === "object" && typeof tool.name === "string") {
        toolsPreview.push({
          name: tool.name as string,
          description: typeof tool.description === "string" ? tool.description : "",
        });
      }
    }

    return {
      id: raw.id,
      name: raw.name,
      description: typeof raw.description === "string" ? raw.description : "",
      version: typeof raw.version === "string" ? raw.version : "0.0.0",
      type: parseTransportType(raw.type),
      url: typeof raw.url === "string" ? raw.url : undefined,
      command: typeof raw.command === "string" ? raw.command : undefined,
      args: Array.isArray(raw.args) ? (raw.args as string[]) : undefined,
      authRequired: !!auth,
      authType: auth?.type === "bearer" || auth?.type === "oauth" ? auth.type : undefined,
      authEnv: typeof auth?.env === "string" ? auth.env : undefined,
      category: typeof raw.category === "string" ? raw.category : "general",
      keywords: Array.isArray(raw.keywords) ? (raw.keywords as string[]) : [],
      toolCount: toolsPreview.length,
      toolsPreview,
      defaults: defaults
        ? {
            toolNames:
              defaults.toolNames === "prefixed" || defaults.toolNames === "bare"
                ? defaults.toolNames
                : undefined,
            timeout: typeof defaults.timeout === "number" ? defaults.timeout : undefined,
            maxResultBytes:
              typeof defaults.maxResultBytes === "number" ? defaults.maxResultBytes : undefined,
          }
        : undefined,
    };
  } catch {
    return null;
  }
}

function parseTransportType(value: unknown): "http" | "sse" | "stdio" {
  if (value === "http" || value === "sse" || value === "stdio") {
    return value;
  }
  return "http";
}

// ── Sync a single registry ───────────────────────────────────────────────────

/** Sync one registry: clone/pull, parse manifest, load server entries */
export async function syncMcpRegistry(
  registry: McpRegistryConfig,
  log: (msg: string) => void = () => {},
): Promise<McpSyncResult> {
  const errors: string[] = [];
  const servers: RegistryServerEntry[] = [];
  const localDir = cacheDir(registry.id);

  // Resolve auth token from environment
  const authToken = registry.auth_token_env ? process.env[registry.auth_token_env] : undefined;

  if (registry.visibility === "private" && registry.auth_token_env && !authToken) {
    errors.push(`Auth token env var "${registry.auth_token_env}" is not set`);
    return { registry, servers, errors, syncedAt: new Date().toISOString() };
  }

  // Clone or pull the registry repo
  let commit = "unknown";
  try {
    log(`Syncing MCP registry "${registry.name}" from ${registry.url}...`);
    const result = await gitCloneOrPull(registry.url, localDir, authToken);
    commit = result.commit;
  } catch (err) {
    errors.push(`Git sync failed: ${(err as Error).message}`);
    return { registry, servers, errors, syncedAt: new Date().toISOString() };
  }

  // Parse mcp-registry.json manifest
  const manifest = await loadRegistryManifest(localDir);

  if (manifest) {
    // Load servers listed in the manifest
    for (const serverId of manifest.servers) {
      const serverDir = join(localDir, "servers", serverId);
      try {
        const entry = await loadServerYaml(serverDir);
        if (entry) {
          servers.push(entry);
        } else {
          errors.push(`Failed to parse server.yaml for "${serverId}"`);
        }
      } catch (err) {
        errors.push(`Error loading server "${serverId}": ${(err as Error).message}`);
      }
    }
  } else {
    // No manifest — scan servers/ directory directly
    const serversDir = join(localDir, "servers");
    try {
      const entries = await readdir(serversDir, { withFileTypes: true });
      for (const entry of entries.filter((e) => e.isDirectory())) {
        const serverDir = join(serversDir, entry.name);
        try {
          const server = await loadServerYaml(serverDir);
          if (server) {
            servers.push(server);
          }
        } catch (err) {
          errors.push(`Error loading server "${entry.name}": ${(err as Error).message}`);
        }
      }
    } catch {
      errors.push("No mcp-registry.json found and no servers/ directory");
    }
  }

  // Write sync metadata
  const syncedAt = new Date().toISOString();
  const meta: SyncMeta = {
    registryId: registry.id,
    commit,
    syncedAt,
    serverCount: servers.length,
  };
  await mkdir(localDir, { recursive: true });
  await writeFile(syncMetaPath(registry.id), JSON.stringify(meta, null, 2));

  log(`Synced ${servers.length} MCP servers from "${registry.name}" (${commit.slice(0, 7)})`);
  return { registry, servers, errors, syncedAt, commit };
}

// ── Sync all registries ──────────────────────────────────────────────────────

/** Sync all enabled MCP registries */
export async function syncAllMcpRegistries(
  registries: McpRegistryConfig[] | undefined,
  log: (msg: string) => void = () => {},
): Promise<McpSyncResult[]> {
  const enabled = (registries ?? []).filter((r) => r.enabled !== false);

  if (enabled.length === 0) {
    log("No MCP registries configured.");
    return [];
  }

  const results: McpSyncResult[] = [];
  for (const registry of enabled) {
    const result = await syncMcpRegistry(registry, log);
    results.push(result);
  }

  return results;
}

// ── Offline: load from cache ─────────────────────────────────────────────────

/** Load cached server entries for a registry (offline mode) */
export async function loadCachedMcpServers(registryId: string): Promise<RegistryServerEntry[]> {
  const localDir = cacheDir(registryId);
  const servers: RegistryServerEntry[] = [];

  const manifest = await loadRegistryManifest(localDir);

  if (manifest) {
    for (const serverId of manifest.servers) {
      const serverDir = join(localDir, "servers", serverId);
      const entry = await loadServerYaml(serverDir);
      if (entry) {
        servers.push(entry);
      }
    }
  } else {
    // Scan servers/ directory
    const serversDir = join(localDir, "servers");
    try {
      const entries = await readdir(serversDir, { withFileTypes: true });
      for (const entry of entries.filter((e) => e.isDirectory())) {
        const serverDir = join(serversDir, entry.name);
        const server = await loadServerYaml(serverDir);
        if (server) {
          servers.push(server);
        }
      }
    } catch {
      // No cache available
    }
  }

  return servers;
}
