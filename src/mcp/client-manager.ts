import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveAuth } from "./auth.js";
import type { McpServerConfig, McpServerState, McpServerStatus, ToolIndexEntry } from "./types.js";
import { MCP_DEFAULTS } from "./types.js";

/** Interpolate `${VAR}` and `${VAR:-default}` in header values. */
function interpolateEnv(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const defaultSep = expr.indexOf(":-");
    if (defaultSep !== -1) {
      const varName = expr.slice(0, defaultSep);
      const fallback = expr.slice(defaultSep + 2);
      return process.env[varName] ?? fallback;
    }
    const resolved = process.env[expr];
    if (resolved === undefined) {
      throw new Error(`[mcp] env var ${expr} is not set`);
    }
    return resolved;
  });
}

/** Interpolate all header values, returning a new record. */
function interpolateHeaders(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    result[k] = interpolateEnv(v);
  }
  return result;
}

/** Merge two header objects, with overlay taking precedence. */
function mergeHeaders(
  base: Record<string, string> | undefined,
  overlay: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!base && !overlay) {
    return undefined;
  }
  return { ...base, ...overlay };
}

/** Create a transport for the given config (stdio, http, or sse). */
function createTransport(config: McpServerConfig): Transport {
  if (config.type === "stdio") {
    if (!config.command) {
      throw new Error("[mcp] command is required for stdio transport");
    }
    // Ensure PATH is always present so child processes can resolve binaries.
    const stdioEnv = { ...process.env, ...config.env } as Record<string, string>;
    // If the command is absolute, add its directory to PATH so npx/node peers resolve.
    if (config.command.startsWith("/")) {
      const cmdDir = config.command.substring(0, config.command.lastIndexOf("/"));
      if (cmdDir && !stdioEnv.PATH?.includes(cmdDir)) {
        stdioEnv.PATH = `${cmdDir}:${stdioEnv.PATH ?? ""}`;
      }
    }
    return new StdioClientTransport({
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: stdioEnv,
      stderr: "pipe",
    });
  }

  if (!config.url) {
    throw new Error("[mcp] url is required for http/sse transport");
  }
  const url = new URL(config.url);
  const configHeaders = config.headers ? interpolateHeaders(config.headers) : undefined;
  const authResolved = resolveAuth(config.auth);
  const headers = mergeHeaders(configHeaders, authResolved?.headers);

  if (config.type === "sse") {
    return new SSEClientTransport(url, {
      requestInit: headers ? { headers } : undefined,
      eventSourceInit: headers
        ? {
            fetch: (input: string | URL, init?: RequestInit) => {
              const merged = new Headers(init?.headers);
              for (const [k, v] of Object.entries(headers)) {
                merged.set(k, v);
              }
              return fetch(input, { ...init, headers: merged });
            },
          }
        : undefined,
    });
  }

  // Default: streamable HTTP (type === "http")
  return new StreamableHTTPClientTransport(url, {
    requestInit: headers ? { headers } : undefined,
  });
}

/** Per-server runtime bookkeeping. */
interface ServerEntry {
  config: McpServerConfig;
  state: McpServerState;
  tools: ToolIndexEntry[];
  client?: Client;
  transport?: Transport;
  /** Cumulative latency tracking for avgLatencyMs. */
  latencySum: number;
  latencyCount: number;
  reconnectAttempts: number;
  /** Promise chain for request serialization. */
  pending: Promise<void>;
  /** Callback for tool list changes. */
  onToolsChanged?: (key: string, tools: ToolIndexEntry[]) => void;
}

/** Max backoff delay in ms for reconnection attempts. */
const MAX_BACKOFF_MS = 30_000;
/** Max reconnect retries per callTool invocation. */
const MAX_RETRIES = 3;

/**
 * Returns true if the error looks like a connection/transport failure
 * (as opposed to a tool-level error the server intentionally returned).
 */
function isConnectionError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return (
      err.name === "AbortError" ||
      msg.includes("econnrefused") ||
      msg.includes("econnreset") ||
      msg.includes("epipe") ||
      msg.includes("socket hang up") ||
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("transport") ||
      msg.includes("closed")
    );
  }
  return false;
}

/**
 * Manages MCP SDK Client instances for configured servers.
 *
 * Phase 2 lifecycle: persistent sessions with FIFO serialization,
 * reconnection with exponential backoff, and listChanged handling.
 */
export class McpClientManager {
  private servers = new Map<string, ServerEntry>();

  /**
   * Connect to a server, discover its tools, and keep the session alive.
   * The discovered tool list is cached and updated via listChanged notifications.
   */
  async connect(
    key: string,
    config: McpServerConfig,
    onToolsChanged?: (key: string, tools: ToolIndexEntry[]) => void,
  ): Promise<void> {
    const entry: ServerEntry = {
      config,
      state: {
        key,
        status: "connected",
        type: config.type,
        toolCount: 0,
        toolNames: [],
      },
      tools: [],
      latencySum: 0,
      latencyCount: 0,
      reconnectAttempts: 0,
      pending: Promise.resolve(),
      onToolsChanged,
    };
    this.servers.set(key, entry);

    try {
      const transport = createTransport(config);

      const client = new Client({ name: "openclaw-mcp", version: "1.0.0" });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), MCP_DEFAULTS.initTimeout);

      try {
        await client.connect(transport, { signal: controller.signal });
        const result = await client.listTools(undefined, {
          signal: controller.signal,
        });

        this.updateToolList(key, entry, result.tools);

        entry.state.status = "connected";
        console.log(`[mcp] ${key}: discovered ${entry.tools.length} tools`);

        // Keep client alive for persistent sessions
        entry.client = client;
        entry.transport = transport;

        // Register listChanged notification handler
        this.setupListChangedHandler(key, entry);
      } finally {
        clearTimeout(timeout);
        // Do NOT close the client — keep it alive for reuse
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.state.status = classifyError(err);
      entry.state.lastError = msg;
      console.log(`[mcp] ${key}: connect failed — ${msg}`);
    }
  }

  /**
   * Call a tool on a server. Reuses the persistent client and serializes
   * concurrent calls through a FIFO promise chain. On connection errors,
   * retries with exponential backoff.
   */
  async callTool(
    key: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const entry = this.servers.get(key);
    if (!entry) {
      throw new Error(`[mcp] server "${key}" not found`);
    }

    // Chain on the pending promise for FIFO serialization
    const result = entry.pending.then(async () => {
      return this.executeCall(entry, key, toolName, args);
    });

    // Update pending chain — swallow errors so subsequent calls aren't blocked
    entry.pending = result.then(
      () => {},
      () => {},
    );

    return result;
  }

  /** Close and remove a specific server connection. */
  async close(key: string): Promise<void> {
    const entry = this.servers.get(key);
    if (entry?.client) {
      await entry.client.close().catch(() => {});
      entry.client = undefined;
      entry.transport = undefined;
    }
    this.servers.delete(key);
    console.log(`[mcp] ${key}: closed`);
  }

  /** Close all server connections. */
  async closeAll(): Promise<void> {
    const keys = [...this.servers.keys()];
    const closeOps = [...this.servers.values()].map(async (entry) => {
      if (entry.client) {
        await entry.client.close().catch(() => {});
        entry.client = undefined;
        entry.transport = undefined;
      }
    });
    await Promise.all(closeOps);
    this.servers.clear();
    if (keys.length > 0) {
      console.log(`[mcp] closed all servers: ${keys.join(", ")}`);
    }
  }

  /** Return runtime state for a specific server. */
  getServerState(key: string): McpServerState | undefined {
    return this.servers.get(key)?.state;
  }

  /** Return runtime state for all servers. */
  getAllServerStates(): McpServerState[] {
    return [...this.servers.values()].map((e) => e.state);
  }

  /** Return tools discovered during connect() for a specific server. */
  getDiscoveredTools(key: string): ToolIndexEntry[] {
    return this.servers.get(key)?.tools ?? [];
  }

  /** Ping a server by calling listTools and measuring round-trip time. */
  async testConnection(key: string): Promise<{ latencyMs: number; toolCount: number }> {
    const entry = this.servers.get(key);
    if (!entry?.client) {
      throw new Error(`server "${key}" is not connected`);
    }
    const start = Date.now();
    const result = await entry.client.listTools();
    const latencyMs = Date.now() - start;

    // Update cumulative latency tracking.
    entry.latencySum += latencyMs;
    entry.latencyCount += 1;
    entry.state.avgLatencyMs = Math.round(entry.latencySum / entry.latencyCount);
    entry.state.lastCallAt = Date.now();

    return { latencyMs, toolCount: result.tools.length };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Execute a single callTool with retry-on-connection-error + exponential backoff.
   * Called inside the FIFO promise chain.
   */
  private async executeCall(
    entry: ServerEntry,
    key: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Ensure we have a live client; reconnect if needed
        if (!entry.client) {
          await this.reconnect(key, entry);
        }

        const start = Date.now();
        const timeoutMs = entry.config.timeout ?? MCP_DEFAULTS.timeout;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const result = await entry.client!.callTool(
            { name: toolName, arguments: args },
            undefined,
            { signal: controller.signal },
          );

          const elapsed = Date.now() - start;
          entry.latencySum += elapsed;
          entry.latencyCount += 1;
          entry.state.avgLatencyMs = Math.round(entry.latencySum / entry.latencyCount);
          entry.state.lastCallAt = Date.now();
          entry.state.status = "connected";
          entry.state.lastError = undefined;
          // Reset reconnect counter on success
          entry.reconnectAttempts = 0;

          return result as CallToolResult;
        } finally {
          clearTimeout(timeout);
        }
      } catch (err) {
        lastErr = err;

        // Only retry on connection errors; tool-level errors propagate immediately
        if (!isConnectionError(err) || attempt >= MAX_RETRIES) {
          break;
        }

        // Tear down the broken client so reconnect() creates a fresh one
        if (entry.client) {
          await entry.client.close().catch(() => {});
          entry.client = undefined;
          entry.transport = undefined;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s … capped at MAX_BACKOFF_MS
        const backoff = Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS);
        console.log(
          `[mcp] ${key}: callTool "${toolName}" connection error, retry ${attempt + 1}/${MAX_RETRIES} in ${backoff}ms`,
        );
        await new Promise<void>((r) => setTimeout(r, backoff));
      }
    }

    // All retries exhausted — propagate the last error
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    entry.state.status = classifyError(lastErr);
    entry.state.lastError = msg;
    console.log(`[mcp] ${key}: callTool "${toolName}" failed — ${msg}`);
    throw lastErr;
  }

  /** Tear down existing client (if any) and establish a fresh connection. */
  private async reconnect(key: string, entry: ServerEntry): Promise<void> {
    // Close old client if exists
    if (entry.client) {
      await entry.client.close().catch(() => {});
      entry.client = undefined;
      entry.transport = undefined;
    }

    const transport = createTransport(entry.config);
    const client = new Client({ name: "openclaw-mcp", version: "1.0.0" });

    await client.connect(transport);
    entry.client = client;
    entry.transport = transport;
    entry.reconnectAttempts++;
    entry.state.status = "connected";
    entry.state.lastError = undefined;

    // Set up listChanged handler on the new client
    this.setupListChangedHandler(key, entry);
  }

  /** Register a notification handler for tools/list_changed on the entry's client. */
  private setupListChangedHandler(key: string, entry: ServerEntry): void {
    if (!entry.client) {
      return;
    }

    entry.client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      try {
        if (!entry.client) {
          return;
        }
        console.log(`[mcp] ${key}: received tools/list_changed, re-discovering tools`);
        const result = await entry.client.listTools();
        this.updateToolList(key, entry, result.tools);
        console.log(`[mcp] ${key}: tool list updated — ${entry.tools.length} tools`);

        // Notify external listener (e.g. tool index)
        if (entry.onToolsChanged) {
          entry.onToolsChanged(key, entry.tools);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[mcp] ${key}: tools/list_changed re-discovery failed — ${msg}`);
      }
    });
  }

  /** Map raw MCP tool definitions into ToolIndexEntry[] and update entry state. */
  private updateToolList(
    key: string,
    entry: ServerEntry,
    tools: Array<{ name: string; description?: string; inputSchema: unknown }>,
  ): void {
    const prefix = entry.config.prefix ?? key;
    const usePrefixed = (entry.config.toolNames ?? "prefixed") === "prefixed";

    entry.tools = tools.map((t) => {
      const resolvedName = usePrefixed ? `${prefix}_${t.name}` : t.name;
      return {
        name: resolvedName,
        originalName: t.name,
        serverKey: key,
        description: t.description ?? "",
        inputSchema: t.inputSchema as Record<string, unknown>,
        parameterNames: Object.keys((t.inputSchema as Record<string, unknown>).properties ?? {}),
      };
    });

    entry.state.toolCount = entry.tools.length;
    entry.state.toolNames = entry.tools.map((t) => t.name);
  }
}

/** Classify an error into an appropriate server status. */
function classifyError(err: unknown): McpServerStatus {
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return "unavailable";
    }
    const msg = err.message;
    if (msg.includes("401") || msg.includes("403")) {
      return "unavailable";
    }
  }
  return "unavailable";
}
