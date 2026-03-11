# Native MCP Client Integration for Operator1

> MCP client for Operator1 — connect to any MCP server, discover tools dynamically, and manage servers through a registry/marketplace system mirroring the agent marketplace pattern.

**Created:** 2026-03-11
**Priority:** Core Feature

---

## Overview

Add first-class MCP (Model Context Protocol) client capabilities to operator1, allowing the gateway to connect to any MCP server and dynamically expose its tools to the agent. This eliminates the need for MCPorter as middleware and makes the entire MCP ecosystem available to operator1 agents.

The design uses a **two-tier architecture**: direct tool registration for small tool counts (Phase 1), and a progressive-disclosure Tool Search pattern for scaling to many MCP servers (Phase 2). The management layer mirrors the agent marketplace — Browse, Installed, Registries, Health — providing a consistent UX for discovering and managing MCP servers.

## Motivation

- Z.AI provides 3 MCP servers (web search, web reader, GitHub reader) that add real value to operator1 agents
- MCPorter v0.7.3 doesn't support streamable HTTP transport, blocking the web reader MCP
- Writing per-tool wrapper code doesn't scale — every new MCP server would need custom integration
- Claude Code, Cline, and other coding agents already have native MCP client support; operator1 should too

---

## The Context Window Problem

Every tool registered with the agent sends its full JSON Schema to the LLM on **every API call**. This is not a one-time cost — it's per-request overhead.

### Current operator1 baseline

| Tool Category                  | Approx. Schema Size                        | Token Cost                     |
| ------------------------------ | ------------------------------------------ | ------------------------------ |
| Browser tool                   | ~3-4 KB (40+ params)                       | ~900 tokens                    |
| Message tool                   | ~8-12 KB (nested Discord/Telegram schemas) | ~2,800 tokens                  |
| Sessions tools (4)             | ~2-3 KB each                               | ~2,500 tokens                  |
| Web fetch/search               | ~1-2 KB each                               | ~500 tokens                    |
| Other core tools (~10)         | ~1-2 KB each                               | ~3,500 tokens                  |
| **Total native tools (17-19)** | **~40-70 KB**                              | **~12,000-18,000 tokens/call** |

_Token estimates are approximate, based on JSON.stringify(tool.parameters).length from `system-prompt-report.ts` with ~3.5 chars/token ratio (typical for JSON Schema content across Claude/GPT-4 tokenizers). Actual counts vary by provider tokenizer. Run `openclaw agents health --all` with debug logging to see exact schema sizes._

### MCP tool cost projection

| Scenario                            | Extra Tools | Extra Tokens/Call | Impact                       |
| ----------------------------------- | ----------- | ----------------- | ---------------------------- |
| Z.AI only (3 servers, 5 tools)      | +5          | ~800              | Negligible                   |
| Moderate (5-8 servers, 15-20 tools) | +15-20      | ~4,000-5,000      | Noticeable                   |
| Heavy (10+ servers, 40+ tools)      | +40         | ~10,000+          | Significant context pressure |

At 40+ MCP tools, you'd be spending ~25,000+ tokens per API call just on tool definitions — before any system prompt, conversation history, or actual content. This is why a naive "register everything upfront" approach doesn't scale.

### How other platforms solve this

| Platform                | Strategy                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude Code**         | "Tool Search" — auto-defers MCP tools when they'd consume >10% of context. Provides a single `MCPSearch` meta-tool. LLM searches for tools on-demand, only relevant schemas get loaded. |
| **mcp-gateway (PMCP)**  | 16 meta-tools replace 50+ tool schemas. `gateway.catalog_search` returns compact "capability cards". `gateway.describe` loads full schema on-demand. `gateway.invoke` executes.         |
| **ToolHive (Stacklok)** | Gateway-level filtering + MCP Optimizer for token reduction. Customizes/filters tool descriptions before they reach the LLM.                                                            |
| **mcp-orchestrator**    | BM25/regex search index over tool metadata. Deferred loading — tools materialize only when matched.                                                                                     |

**The common pattern:** don't send all tool schemas upfront. Instead, give the LLM a lightweight discovery mechanism and load full schemas only when needed.

---

## Two-Tier Architecture

### Tier 1: Direct Registration (Phase 1)

For small MCP deployments (< `toolSearchThreshold` tools, default 15):

```
MCP Server A (3 tools) ──┐
MCP Server B (2 tools) ──┤──> All 5 tools registered as AgentTool[] ──> LLM sees 5 full schemas
MCP Server C (1 tool)  ──┘
```

- Each MCP tool becomes a full `AgentTool` with complete JSON Schema
- Sent to the LLM in the `tools[]` parameter on every API call
- Simple, no indirection, ~800 extra tokens for the z.ai use case
- Identical to how native operator1 tools work today

### Tier 2: Tool Search / Progressive Disclosure (Phase 2)

For larger MCP deployments (>= `toolSearchThreshold` tools):

```
MCP Server A (10 tools) ──┐
MCP Server B (8 tools)  ──┤──> Tool Registry (in-memory index)
MCP Server C (5 tools)  ──┤         |
MCP Server D (12 tools) ──┘         |
                                    v
                           LLM sees ONE tool: mcp_search
                                    |
                           LLM calls: mcp_search({ query: "read github files" })
                                    |
                                    v
                           Returns: compact tool cards (name + description, no schema)
                                    |
                           LLM calls: mcp_search({ action: "get_schema", tool: "read_file" })
                                    |
                                    v
                           Returns: full JSON Schema for read_file
                                    |
                           LLM calls: mcp_search({ action: "invoke", tool: "read_file", server: "zai-zread", arguments: { repo: "...", path: "..." } })
                                    |
                                    v
                           Routed to MCP Server C via client-manager, result returned to LLM
```

The key insight: **the LLM only pays the token cost for tools it actually uses**, not every tool across every configured MCP server.

#### The `mcp_search` Meta-Tool

A single lightweight tool registered with the agent:

```typescript
{
  name: "mcp_search",
  description: "Search, discover, and invoke MCP tools from connected servers. Actions: 'search' finds tools by keyword, 'get_schema' returns full parameters for a tool, 'invoke' calls a tool, 'list_servers' shows connected servers.",
  parameters: Type.Object({
    action: stringEnum(["search", "get_schema", "invoke", "list_servers"]),
    query: Type.Optional(Type.String({ description: "Search query (for action='search')" })),
    tool: Type.Optional(Type.String({ description: "Tool name (for action='get_schema' or 'invoke')" })),
    server: Type.Optional(Type.String({ description: "Server key to disambiguate tools with same name (for action='invoke')" })),
    arguments: Type.Optional(Type.Unsafe<Record<string, unknown>>({ description: "Tool arguments (for action='invoke')" })),
  }),
}
```

Schema cost: ~250 tokens (vs. 10,000+ for 40 individual tool schemas). The `server` parameter resolves ambiguity when multiple servers expose a tool with the same name (see "Invoke routing collision" below).

#### Tool Card Format (search results)

When the LLM calls `mcp_search({ action: "search", query: "github" })`, it gets compact cards:

```json
{
  "results": [
    {
      "tool": "search_doc",
      "server": "zai-zread",
      "description": "Search documentation in a GitHub repository",
      "parameters_summary": "repo (required), query (required)"
    },
    {
      "tool": "read_file",
      "server": "zai-zread",
      "description": "Read a file from a GitHub repository",
      "parameters_summary": "repo (required), path (required)"
    }
  ]
}
```

No full JSON Schema in the response — just enough for the LLM to decide which tool to use.

#### Dynamic Tool Injection

After the LLM discovers a tool via search, it needs to actually call it. Two approaches:

**Option A: Invoke-through-gateway** (simpler, like PMCP)

- LLM calls `mcp_invoke({ tool: "read_file", arguments: { repo: "...", path: "..." } })`
- The gateway routes to the correct MCP server
- Pro: no dynamic tool list mutation, single consistent interface
- Con: LLM doesn't get schema validation hints from the provider

**Option B: Dynamic tool registration** (like Claude Code)

- After `get_schema`, the tool is injected into the active tool list for the session
- LLM calls `read_file(...)` directly on subsequent turns
- Pro: full schema validation, natural tool calling
- Con: requires runtime tool list mutation support in pi-agent-core

**Recommendation:** Start with Option A (invoke-through-gateway) for simplicity. The `mcp_search` tool handles both discovery and invocation.

**Migration trigger to Option B:** Switch to dynamic tool registration if any of these surface:

1. LLM providers reject `mcp_search` invoke calls because `arguments` is `Type.Unsafe` (no schema validation)
2. Users report the LLM frequently passes wrong argument shapes because it doesn't see the target tool's schema
3. pi-agent-core adds runtime tool list mutation support, making Option B trivial to implement

Until then, Option A is simpler and avoids the complexity of mutating the active tool list mid-session.

#### Search Index

In-memory index built at gateway startup from all connected MCP servers:

```typescript
interface ToolIndex {
  entries: ToolIndexEntry[];
  search(query: string): ToolIndexEntry[];
}

interface ToolIndexEntry {
  name: string; // tool name as registered on the MCP server
  server: string; // server config key
  description: string; // from MCP tools/list
  parametersSummary: string; // "repo (required), query (required)"
  inputSchema: object; // full JSON Schema (returned only on get_schema)
  keywords: string[]; // extracted from name + description for search
}
```

Search uses simple keyword matching (split query into tokens, match against name + description + keywords). No need for BM25 or vector search at this scale — even 100 tools is trivially searchable with substring matching.

#### Invoke Routing Collision

When two servers expose a tool with the same bare name (e.g., both have `search`), the `invoke` action needs disambiguation. Resolution:

1. Search results always include the `server` field, so the LLM sees which server each tool belongs to
2. When invoking, if `server` is provided in the `mcp_search` call, route to that specific server
3. If `server` is omitted and the tool name is unique across all servers, route to the only match
4. If `server` is omitted and the tool name exists on multiple servers, return an error: `"Ambiguous tool name 'search' — found on servers: zai-search, company-search. Specify the 'server' parameter to disambiguate."`

The search results include `server` specifically to enable this flow — the LLM learns the server context during discovery and passes it through on invocation.

#### Server Instructions

MCP servers can provide `instructions` in their initialize response (per the MCP spec). These are short descriptions of the server's capabilities. When Tool Search is active, server instructions are included in the `mcp_search` tool description or in a compact "available servers" section of the system prompt, so the LLM knows what to search for.

Example system prompt injection (only when Tool Search is active):

```
## Available MCP Servers
The following MCP servers are connected. Use the mcp_search tool to discover and invoke their tools.
- zai-zread: GitHub repository exploration (search docs, read files, browse structure)
- zai-reader: Read and extract content from web pages
- zai-search: Web search across the internet
- local-db: Query PostgreSQL databases
```

This costs ~100 tokens regardless of how many tools each server has.

**Injection placement:** This block is appended to the end of the system prompt, after all tool policy rules and agent instructions but before the conversation history. This is the same location where the existing tool list text is injected (see `extractToolListText()` in `system-prompt-report.ts`). Placing it after agent instructions ensures the LLM knows to search for MCP tools without interfering with core routing behavior.

---

## Configuration

### Server Configuration (`openclaw.json`)

Add a new `tools.mcp` section:

```json
{
  "tools": {
    "mcp": {
      "maxResultBytes": 100000,
      "toolSearchThreshold": 15,
      "registries": [
        {
          "id": "openclaw",
          "name": "OpenClaw Official",
          "url": "https://github.com/openclaw/mcp-servers",
          "description": "Official OpenClaw MCP server catalog",
          "visibility": "public",
          "enabled": true
        },
        {
          "id": "company",
          "name": "Company Internal",
          "url": "https://github.com/company/mcp-servers",
          "auth_token_env": "COMPANY_MCP_TOKEN",
          "description": "Internal MCP servers",
          "visibility": "private",
          "enabled": true
        }
      ],
      "servers": {
        "zai-search": {
          "type": "http",
          "url": "https://api.z.ai/api/mcp/web_search_prime/mcp",
          "headers": {
            "Authorization": "Bearer <api_key>"
          }
        },
        "zai-reader": {
          "type": "http",
          "url": "https://api.z.ai/api/mcp/mcp_reader/mcp",
          "headers": {
            "Authorization": "Bearer <api_key>"
          }
        },
        "zai-zread": {
          "type": "sse",
          "url": "https://api.z.ai/api/mcp/zread/mcp",
          "headers": {
            "Authorization": "Bearer <api_key>"
          },
          "toolNames": "bare"
        }
      }
    }
  }
}
```

### Per-Server Config Schema

| Field            | Type                         | Required       | Description                                                         |
| ---------------- | ---------------------------- | -------------- | ------------------------------------------------------------------- |
| `type`           | `"http" \| "sse" \| "stdio"` | yes            | Transport type                                                      |
| `url`            | `string`                     | yes (http/sse) | MCP server endpoint URL (supports `${ENV_VAR}` interpolation)       |
| `command`        | `string`                     | yes (stdio)    | Command to spawn for stdio servers                                  |
| `args`           | `string[]`                   | no (stdio)     | Arguments for stdio command                                         |
| `cwd`            | `string`                     | no (stdio)     | Working directory for stdio servers (default: project root)         |
| `headers`        | `Record<string, string>`     | no             | HTTP headers (supports `${ENV_VAR}` interpolation)                  |
| `env`            | `Record<string, string>`     | no             | Environment variables for stdio servers                             |
| `auth`           | `McpAuthConfig`              | no             | OAuth config (Phase 4; use `headers` with bearer tokens until then) |
| `enabled`        | `boolean`                    | no             | Toggle server on/off (default: true)                                |
| `timeout`        | `number`                     | no             | Tool call timeout in ms (default: 30000)                            |
| `toolNames`      | `"prefixed" \| "bare"`       | no             | Naming strategy (default: `"prefixed"`)                             |
| `prefix`         | `string`                     | no             | Custom prefix when `toolNames: "prefixed"` (default: server key)    |
| `maxResultBytes` | `number`                     | no             | Per-server override for result truncation                           |

### Environment Variable Interpolation

`url`, `headers`, and `auth` fields support `${ENV_VAR}` syntax with optional defaults:

- `${VAR}` — resolves to the value of environment variable `VAR`; error if unset
- `${VAR:-default}` — resolves to `VAR` if set, otherwise uses `default`

Interpolation happens at **connect time** in `client-manager.ts`, not at config parse time. This ensures:

1. Secrets never appear in parsed/serialized config objects
2. Env vars can be set after config is loaded (e.g., via 1Password CLI injection)
3. Config files remain safe to commit to version control

Example:

```json
{
  "headers": {
    "Authorization": "Bearer ${ZAI_API_KEY}"
  }
}
```

If `ZAI_API_KEY` is unset at connect time, the server is skipped with a warning: `[mcp] zai-zread: skipped — ZAI_API_KEY not set`.

### Global MCP Options

| Field                           | Type                            | Default  | Description                                          |
| ------------------------------- | ------------------------------- | -------- | ---------------------------------------------------- |
| `tools.mcp.maxResultBytes`      | `number`                        | `100000` | Max bytes per tool result before truncation (~100KB) |
| `tools.mcp.toolSearchThreshold` | `number`                        | `15`     | Total MCP tool count that triggers Tool Search mode  |
| `tools.mcp.toolSearch`          | `"auto" \| "always" \| "never"` | `"auto"` | Override Tool Search behavior                        |

### Tool Search config behavior

| `toolSearch` value | Behavior                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `"auto"` (default) | Use direct registration when total MCP tools < `toolSearchThreshold`; switch to Tool Search when >= threshold |
| `"always"`         | Always use Tool Search, even for 1 MCP tool                                                                   |
| `"never"`          | Always use direct registration, even for 100 MCP tools                                                        |

---

## MCP Server Registry & Marketplace

Mirrors the agent marketplace pattern (Browse / Installed / Registries / Health) for MCP server discovery and management.

### Registry Manifest (`mcp-registry.json`)

Each registry repo contains a manifest listing available MCP servers:

```json
{
  "id": "openclaw",
  "name": "OpenClaw Official",
  "description": "Curated MCP servers for Operator1",
  "version": "1.0.0",
  "servers": [
    {
      "id": "openclaw/zai-search",
      "name": "Z.AI Web Search",
      "description": "Search the web using Z.AI's search engine",
      "version": "1.0.0",
      "type": "http",
      "url": "https://api.z.ai/api/mcp/web_search_prime/mcp",
      "auth_required": true,
      "auth_type": "bearer",
      "auth_env": "ZAI_API_KEY",
      "category": "search",
      "keywords": ["web", "search", "internet"],
      "tools_count": 1,
      "tools_preview": ["web_search_prime"]
    },
    {
      "id": "openclaw/zai-zread",
      "name": "Z.AI GitHub Reader",
      "description": "Explore GitHub repos — search docs, read files, browse structure",
      "version": "1.0.0",
      "type": "sse",
      "url": "https://api.z.ai/api/mcp/zread/mcp",
      "auth_required": true,
      "auth_type": "bearer",
      "auth_env": "ZAI_API_KEY",
      "category": "code",
      "keywords": ["github", "code", "repository", "documentation"],
      "tools_count": 3,
      "tools_preview": ["search_doc", "read_file", "get_repo_structure"]
    },
    {
      "id": "openclaw/notion",
      "name": "Notion",
      "description": "Read and write Notion pages, databases, and blocks",
      "version": "1.0.0",
      "type": "http",
      "url": "https://mcp.notion.com/mcp",
      "auth_required": true,
      "auth_type": "oauth",
      "category": "productivity",
      "keywords": ["notion", "notes", "wiki", "documents"],
      "tools_count": 12,
      "tools_preview": ["search", "read_page", "create_page", "query_database"]
    }
  ]
}
```

### Namespacing

Mirrors agent namespacing: official servers use bare IDs (`zai-search`); servers from other registries are prefixed (`company/internal-db`). Collision resolution: registry ID prefix always wins over bare name if there's a conflict.

### Registry Config

Registries are configured under `tools.mcp.registries`. Auth tokens are read from environment variables — never stored in the config file.

```json
{
  "tools": {
    "mcp": {
      "registries": [
        {
          "id": "openclaw",
          "name": "OpenClaw Official",
          "url": "https://github.com/openclaw/mcp-servers",
          "description": "Official OpenClaw MCP server catalog",
          "visibility": "public",
          "enabled": true
        },
        {
          "id": "company",
          "name": "Company Internal",
          "url": "https://github.com/company/mcp-servers",
          "auth_token_env": "COMPANY_MCP_TOKEN",
          "description": "Internal MCP servers",
          "visibility": "private",
          "enabled": true
        }
      ]
    }
  }
}
```

### Registry Repo Layout

```
openclaw-mcp-servers/
├── mcp-registry.json           # Registry manifest
└── servers/
    ├── zai-search/
    │   ├── server.yaml         # Server metadata + config template
    │   └── README.md           # Documentation
    ├── zai-zread/
    │   ├── server.yaml
    │   └── README.md
    └── notion/
        ├── server.yaml
        └── README.md
```

### `server.yaml` Format

```yaml
id: zai-zread
name: Z.AI GitHub Reader
description: Explore GitHub repos — search docs, read files, browse structure
version: 1.0.0

# Connection
type: sse
url: https://api.z.ai/api/mcp/zread/mcp

# Authentication
auth:
  type: bearer
  env: ZAI_API_KEY
  setup_url: https://docs.z.ai/devpack/mcp

# Metadata
category: code
keywords:
  - github
  - code
  - repository
  - documentation
author:
  name: Z.AI
  url: https://z.ai

# Recommended config
defaults:
  toolNames: bare
  timeout: 30000
  maxResultBytes: 100000

# Tools preview (static, for browse without connecting)
tools:
  - name: search_doc
    description: Search documentation in a GitHub repository
  - name: read_file
    description: Read a file from a GitHub repository
  - name: get_repo_structure
    description: Get the file/folder structure of a GitHub repository
```

---

## Installation Scopes

Mirrors agent installation scopes (local / project / user):

| Scope       | Config Location            | Lock File                       | Use Case                               |
| ----------- | -------------------------- | ------------------------------- | -------------------------------------- |
| **local**   | `.openclaw/mcp.local.json` | `.openclaw/mcp.local-lock.yaml` | Project-specific, gitignored           |
| **project** | `.openclaw/mcp.json`       | `.openclaw/mcp-lock.yaml`       | Team-shared servers in version control |
| **user**    | `~/.openclaw/mcp.json`     | `~/.openclaw/mcp-lock.yaml`     | Personal servers across all projects   |

### Scope Resolution Order

**local -> project -> user** (narrowest wins). When building the server list, all three scopes are merged in that order — a local-scope server with the same ID as a user-scope one overrides it for that project.

### Lock File (`mcp-lock.yaml`)

Ensures reproducible MCP server configurations across environments:

```yaml
# Generated by openclaw mcp install
# Do not edit manually

lockfile_version: 1

servers:
  zai-zread:
    version: 1.0.0
    type: sse
    url: https://api.z.ai/api/mcp/zread/mcp
    installed_at: 2026-03-11T10:00:00Z
    scope: user
    registry: openclaw
    tools_discovered:
      - search_doc
      - read_file
      - get_repo_structure

  zai-search:
    version: 1.0.0
    type: http
    url: https://api.z.ai/api/mcp/web_search_prime/mcp
    installed_at: 2026-03-11T10:01:00Z
    scope: user
    registry: openclaw
    tools_discovered:
      - web_search_prime

registry:
  openclaw:
    url: https://github.com/openclaw/mcp-servers
    synced_at: 2026-03-11T09:55:00Z
    commit: a1b2c3d...
```

### Auto-Import Sources

In addition to registries, MCP server configs can be imported from existing tools:

| Source                  | Config Path                                    | Import Command                       |
| ----------------------- | ---------------------------------------------- | ------------------------------------ |
| **MCPorter**            | `~/.mcporter/mcporter.json`                    | `openclaw mcp import mcporter`       |
| **Claude Code**         | `~/.claude.json` → `mcpServers`                | `openclaw mcp import claude-code`    |
| **Cursor**              | `~/.cursor/mcp.json`                           | `openclaw mcp import cursor`         |
| **Project `.mcp.json`** | `./.mcp.json` (Claude Code project scope)      | `openclaw mcp import project`        |
| **Claude Desktop**      | Platform-specific `claude_desktop_config.json` | `openclaw mcp import claude-desktop` |

MCPorter is listed first because existing operator1 users already have z.ai servers configured there — `openclaw mcp import mcporter` is the natural first migration command.

Import creates entries in the target scope and runs a test connection. Existing servers with the same URL are skipped.

---

## CLI Commands

### Server Management

```bash
# List installed/configured MCP servers
openclaw mcp list
openclaw mcp list --scope user
openclaw mcp list --all              # all scopes merged

# Install from registry
openclaw mcp install zai-zread
openclaw mcp install zai-zread --scope user
openclaw mcp install zai-search zai-reader zai-zread  # batch install

# Install from lock file (CI mode)
openclaw mcp install --frozen

# Add a server manually (not from registry)
openclaw mcp add my-server --type http --url https://example.com/mcp
openclaw mcp add my-server --type stdio -- npx -y @example/mcp-server

# Remove a server
openclaw mcp remove zai-search
openclaw mcp remove zai-search --scope user

# Enable / disable without removing
openclaw mcp enable zai-search
openclaw mcp disable zai-search

# Update server to latest registry version
openclaw mcp update zai-zread
openclaw mcp update --all

# Check for available updates
openclaw mcp outdated

# Configure an installed server (change timeout, URL, headers, etc.)
openclaw mcp configure zai-zread --timeout 60000
openclaw mcp configure zai-zread --set headers.Authorization "Bearer ${NEW_KEY}"

# Test connection to a server
openclaw mcp test zai-zread
openclaw mcp test --all

# View discovered tools for a server
openclaw mcp tools zai-zread
```

### Registry Management

```bash
# List configured registries
openclaw mcp registry list

# Add a registry
openclaw mcp registry add company https://github.com/company/mcp-servers

# Remove a registry
openclaw mcp registry remove company

# Enable / disable
openclaw mcp registry enable company
openclaw mcp registry disable company

# Sync registries (fetch latest manifests)
openclaw mcp sync
openclaw mcp sync --registry company
```

### Browse & Discovery

```bash
# Browse available servers from all registries
openclaw mcp browse
openclaw mcp browse --category code
openclaw mcp browse --registry company

# Search servers
openclaw mcp search "github"
openclaw mcp search "database" --registry openclaw

# Show server details
openclaw mcp info zai-zread
```

### Health & Diagnostics

```bash
# Health check all installed servers
openclaw mcp health
openclaw mcp health --all

# Health check specific server
openclaw mcp health zai-zread

# Output:
# Server: zai-zread (v1.0.0)
#   ✓ Connection OK (SSE, 240ms)
#   ✓ Tools discovered (3 tools)
#   ✓ Auth valid
#   ✓ Test call: search_doc OK (1.2s)
# Status: healthy
```

### Import

```bash
# Import from Claude Code config
openclaw mcp import claude-code
openclaw mcp import claude-code --scope user

# Import from Cursor
openclaw mcp import cursor

# Import from project .mcp.json
openclaw mcp import project
```

### Lock File

```bash
# Regenerate lock file from installed servers
openclaw mcp lock --regenerate

# Show diff between lock file and actual state
openclaw mcp lock --check

# Strict mode for CI — exits non-zero if lock file differs from actual state
openclaw mcp lock --check --strict
```

**`--frozen` scope behavior:** `openclaw mcp install --frozen` reads the **project-scope** lock file (`.openclaw/mcp-lock.yaml`) only — this is the one committed to VCS. It installs exactly what the lock file specifies, ignoring user-scope and local-scope configs. This gives CI reproducibility: the project lock file is the single source of truth for frozen installs. User-scope and local-scope lock files are for personal use only and are never used by `--frozen`.

---

## Web UI

MCP management pages in ui-next, mirroring the agent marketplace navigation:

```
MCP Servers
├── Browse        # Discover MCP servers from registries
├── Installed     # Manage connected servers (enable/disable/remove/test)
├── Registries    # Manage MCP registries (add/sync/remove/enable/disable)
└── Health        # Server health dashboard (auto-refresh)
```

### Browse Page

Card grid or table of available MCP servers from all enabled registries. Filter by category (All, Search, Code, Productivity, Database, etc.). Grid/table toggle persisted in localStorage.

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Servers — Browse                         [Grid] [Table] │
├─────────────────────────────────────────────────────────────┤
│  [All] [Search] [Code] [Productivity] [Database] [Custom]   │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┐ ┌──────────────────────────┐  │
│  │ Z.AI Web Search          │ │ Z.AI GitHub Reader       │  │
│  │ Search the web           │ │ Explore GitHub repos     │  │
│  │ 1 tool • HTTP • Search   │ │ 3 tools • SSE • Code     │  │
│  │ openclaw registry        │ │ openclaw registry        │  │
│  │            [Install]      │ │            [Installed ✓] │  │
│  └──────────────────────────┘ └──────────────────────────┘  │
│  ┌──────────────────────────┐ ┌──────────────────────────┐  │
│  │ Notion                   │ │ PostgreSQL               │  │
│  │ Notes, wikis, databases  │ │ Query PostgreSQL DBs     │  │
│  │ 12 tools • HTTP • Prod.  │ │ 5 tools • Stdio • DB    │  │
│  │ openclaw registry        │ │ company registry         │  │
│  │            [Install]      │ │            [Install]     │  │
│  └──────────────────────────┘ └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Installed Page

Manage all connected MCP servers. Search, filter by status/type/scope. Actions: Configure, Test, Enable/Disable, Remove.

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Servers — Installed                [+ Add Server]       │
├─────────────────────────────────────────────────────────────┤
│  Search: [_______________]  Filter: [All ▾] Scope: [All ▾] │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ● zai-zread                         SSE • user scope │   │
│  │   Z.AI GitHub Reader — 3 tools                       │   │
│  │   search_doc, read_file, get_repo_structure          │   │
│  │   Last call: 2 min ago • Avg latency: 1.8s           │   │
│  │                         [Test] [Configure] [Disable] │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ● zai-search                       HTTP • user scope │   │
│  │   Z.AI Web Search — 1 tool                           │   │
│  │   web_search_prime                                   │   │
│  │   Last call: 5 min ago • Avg latency: 2.4s           │   │
│  │                         [Test] [Configure] [Disable] │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ○ company-db                     Stdio • local scope │   │
│  │   Company PostgreSQL — 5 tools              Disabled │   │
│  │   query, list_tables, describe_table, ...            │   │
│  │                          [Test] [Configure] [Enable] │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Add Server Modal

```
┌─────────────────────────────────────────────────────────────┐
│  Add MCP Server                                        [✕]  │
├─────────────────────────────────────────────────────────────┤
│  Server Name *                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ my-api                                              │   │
│  └─────────────────────────────────────────────────────┘   │
│  Transport Type *                                           │
│  ● HTTP   ○ SSE   ○ Stdio                                  │
│  URL *                                                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ https://api.example.com/mcp                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  Headers (optional)                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Authorization: Bearer ${MY_API_KEY}                 │   │
│  └─────────────────────────────────────────────────────┘   │
│  Scope                                                      │
│  ○ Local   ● Project   ○ User                               │
│  Tool Naming                                                │
│  ● Prefixed (mcp_my-api_<tool>)   ○ Bare (<tool>)          │
│                                                             │
│                        [Cancel]  [Add & Test Connection]     │
└─────────────────────────────────────────────────────────────┘
```

### Registries Page

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Servers — Registries                           [+ Add] │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● OpenClaw Official                          Public  │   │
│  │ github.com/openclaw/mcp-servers                      │   │
│  │ 12 servers • Last synced: 1 hour ago                 │   │
│  │                                          [Sync] [···] │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ● Company Internal                          Private  │   │
│  │ github.com/company/mcp-servers                       │   │
│  │ 4 servers • Last synced: 3 days ago                  │   │
│  │                                          [Sync] [···] │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ○ Community MCP                             Disabled  │   │
│  │ github.com/community/mcp-catalog                     │   │
│  │ Not synced                                           │   │
│  │                                        [Enable] [···] │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Registry detail view (click a registry):**

```
┌─────────────────────────────────────────────────────────────┐
│  ← Registries / Company Internal                            │
├─────────────────────────────────────────────────────────────┤
│  ● Company Internal                               Private   │
│  URL: github.com/company/mcp-servers                        │
│  Status: ● Connected                                        │
│  Servers: 4 • Last synced: 3 days ago                       │
│  [Sync Now]  [Disable]  [Remove]                            │
├─────────────────────────────────────────────────────────────┤
│  Available Servers                                          │
│  company/internal-db    PostgreSQL queries     [Install]     │
│  company/jira           JIRA issue tracking    [Install]     │
│  company/confluence     Confluence wiki        [Installed ✓] │
│  company/slack          Slack messaging        [Install]     │
└─────────────────────────────────────────────────────────────┘
```

### Health Page

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Servers — Health              Auto-refresh: [5s ▾] Poll │
├─────────────────────────────────────────────────────────────┤
│  Overall: 3/4 servers healthy                               │
│                                                             │
│  ● zai-zread              Healthy       3 tools     1.8s    │
│    Connection: SSE ✓ • Auth: ✓ • Last call: 2m ago          │
│                                                             │
│  ● zai-search             Healthy       1 tool      2.4s    │
│    Connection: HTTP ✓ • Auth: ✓ • Last call: 5m ago         │
│                                                             │
│  ● zai-reader             Healthy       1 tool      3.1s    │
│    Connection: HTTP ✓ • Auth: ✓ • Last call: 12m ago        │
│                                                             │
│  ○ company-db             Unavailable   —           —       │
│    Connection: Stdio ✗ • Error: command not found            │
│    [Retry] [Configure] [Disable]                            │
└─────────────────────────────────────────────────────────────┘
```

**Refresh mechanism:** Client-side polling via `mcp.health.list` RPC at the selected interval (default 5s, configurable: 5s/10s/30s/off). Not WebSocket/SSE subscription — keeps implementation simple and consistent with the agent health page pattern. Per-server throttling: stdio servers are only re-checked on explicit "Retry" clicks (not on auto-refresh) to avoid noisy process restarts.

### RPC Endpoints

Gateway RPC methods for the web UI (mirrors agent marketplace RPCs):

```
mcp.servers.list           # List installed servers with status
mcp.servers.get            # Get single server details (config, tools, metrics)
mcp.servers.install        # Install server from registry
mcp.servers.add            # Add server manually
mcp.servers.remove         # Remove server
mcp.servers.update         # Update server to latest registry version
mcp.servers.enable         # Enable server
mcp.servers.disable        # Disable server
mcp.servers.test           # Test connection to server
mcp.servers.configure      # Update server config
mcp.servers.tools          # List tools for a server

mcp.registry.list          # List configured registries
mcp.registry.add           # Add a registry
mcp.registry.remove        # Remove a registry
mcp.registry.enable        # Enable a registry
mcp.registry.disable       # Disable a registry
mcp.registry.sync          # Sync registry (fetch latest manifest)

mcp.browse.list            # List available servers from all registries
mcp.browse.search          # Search available servers
mcp.browse.info            # Get details for a registry server

mcp.health.list            # Health status for all servers (poll-based, not subscription)
mcp.health.check           # Health check specific server
```

---

## Architecture

### MCP Protocol Scope

MCP defines three server primitives: **Tools**, **Resources**, and **Prompts**, plus a client-side **Sampling** capability.

| Primitive     | Status                 | Notes                                                                                                                                                                                                                                                                                     |
| ------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tools**     | In scope (this doc)    | Core focus — discover, invoke, manage                                                                                                                                                                                                                                                     |
| **Resources** | Out of scope           | File/data access via `resources/list` + `resources/read`. Could be useful for @ mentions. Future consideration.                                                                                                                                                                           |
| **Prompts**   | Out of scope           | Templated LLM interactions via `prompts/list` + `prompts/get`. Low priority — agents have their own prompt system.                                                                                                                                                                        |
| **Sampling**  | Explicitly unsupported | MCP 2025-03-26 added server→client sampling (servers request LLM completions). We explicitly set `capabilities: { sampling: undefined }` in the Client constructor to signal non-support. Servers requiring sampling will receive an error. Revisit if a valuable MCP server requires it. |

Startup discovery calls `client.listTools()` only — not `resources/list` or `prompts/list`. This keeps startup fast and avoids loading data we don't use.

### Key Decision: Use the Official MCP SDK

Instead of writing custom transport/session code, use `@modelcontextprotocol/sdk` which provides:

- `Client` class with full JSON-RPC lifecycle (initialize, tools/list, tools/call)
- `StreamableHTTPClientTransport` for HTTP servers
- `SSEClientTransport` for SSE servers
- `StdioClientTransport` for local process servers (Phase 4)
- Session management, content negotiation, and spec compliance built-in

This collapses what would be a 5-file transport/session layer into thin wrappers around the SDK.

### Module Structure

```
src/mcp/
  index.ts              # Public API: connectMcpServers(), disconnectMcpServers(), getMcpToolMode()
  client-manager.ts     # Manages MCP Client instances per server, connection lifecycle
  tool-adapter.ts       # Convert MCP tools to operator1 AgentTool format (Tier 1: direct)
  tool-search.ts        # The mcp_search meta-tool implementation (Tier 2: progressive disclosure)
  tool-index.ts         # In-memory search index over discovered MCP tools
  result-truncation.ts  # Truncate oversized tool results
  registry-sync.ts      # Git-based registry sync with local caching
  scope.ts              # Installation scope resolution (local/project/user)
  types.ts              # McpServerConfig, McpConfig, ToolIndexEntry, shared types

src/commands/
  mcp.commands.ts       # CLI: openclaw mcp install/remove/list/test/...
  mcp.commands.registry.ts  # CLI: openclaw mcp registry add/remove/sync/...

src/gateway/server-methods/
  mcp.ts                # Gateway RPC handlers for web UI

ui-next/src/pages/mcp/
  browse.tsx            # Browse page (registry servers, search, categories)
  installed.tsx         # Installed page (manage connected servers)
  registries.tsx        # Registries page (add/sync/remove)
  health.tsx            # Health dashboard (auto-refresh)
```

### Runtime Flow

#### Tier 1: Direct Registration (< threshold tools)

```
Gateway Startup
  |
  v
Load MCP config (merge local → project → user scopes)
  |
  v
For each enabled server (in parallel):
  1. Create SDK transport (StreamableHTTPClientTransport or SSEClientTransport)
  2. Create SDK Client, call client.connect() (handles initialize + initialized)
  3. Call client.listTools() to discover available tools
  4. Total tool count < toolSearchThreshold? → Direct registration
  5. Convert each MCP tool to an AgentTool via tool-adapter
  6. Register with resolved name (prefixed or bare)
  |
  v
Agent runs, calls search_doc({ repo: "...", query: "..." })
  |
  v
tool-adapter.execute() calls client.callTool({ name, arguments })
  |
  v
Truncate result if > maxResultBytes, return to agent
```

#### Tier 2: Tool Search (>= threshold tools)

```
Gateway Startup
  |
  v
Load MCP config (merge scopes)
  |
  v
For each enabled server (in parallel):
  1. Create SDK transport + Client, call client.connect()
  2. Call client.listTools() to discover available tools
  3. Total tool count >= toolSearchThreshold? → Tool Search mode
  4. Build in-memory ToolIndex from all discovered tools
  5. Register single mcp_search AgentTool
  |
  v
Agent runs, calls mcp_search({ action: "search", query: "github files" })
  |
  v
tool-index.search("github files") returns compact tool cards
  |
  v
Agent calls mcp_search({ action: "get_schema", tool: "read_file" })
  |
  v
Returns full JSON Schema for read_file tool
  |
  v
Agent calls mcp_search({ action: "invoke", tool: "read_file", arguments: { repo: "...", path: "..." } })
  |
  v
client-manager routes to correct MCP server, calls client.callTool()
  |
  v
Truncate result if > maxResultBytes, return to agent
```

### Transport Layer (via SDK)

#### Streamable HTTP (`type: "http"`)

- Uses `StreamableHTTPClientTransport` from `@modelcontextprotocol/sdk/client/streamableHttp.js`
- Handles both `application/json` and `text/event-stream` responses automatically
- Session ID management built-in
- Used by: z.ai reader

#### SSE (`type: "sse"`)

- Uses `SSEClientTransport` from `@modelcontextprotocol/sdk/client/sse.js`
- Standard EventSource-style persistent connection
- Used by: z.ai search, z.ai zread

#### Stdio (`type: "stdio"`) — Phase 4

- Uses `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js`
- Spawns local process, communicates over stdin/stdout
- Supports `cwd` config field for working directory (defaults to project root)
- For local MCP servers (filesystem, database tools)

### Tool Naming

Two strategies, configurable per server:

**Prefixed (default):** `mcp_<server_key>_<tool_name>`

- Always unique, no collision risk
- Example: `mcp_zai_search_web_search_prime` (verbose — 31 chars)

**Bare:** just `<tool_name>` as-is from the MCP server

- Shorter, cleaner for the agent
- Example: `search_doc`, `read_file`, `get_repo_structure`
- Collision check at registration: if a bare name collides with a native tool or another MCP tool, fall back to prefixed and log a warning

Users can set `toolNames: "bare"` per server when they know names won't collide (typical for dedicated servers like zread). Use `prefix` to customize the prefix string.

In Tool Search mode (Tier 2), naming is less critical since the LLM discovers tools through search results and invokes through the gateway — but the display names in search results still use the resolved names.

### Schema Translation

MCP tools use JSON Schema for input parameters. Operator1 tools use TypeBox. At runtime:

1. Receive JSON Schema from `client.listTools()` response
2. Convert to TypeBox via `Type.Unsafe()` with the raw JSON Schema passed through
3. Wrap in an `AgentTool` with `execute` that calls `client.callTool()`

This avoids needing to understand every JSON Schema feature — just pass through.

In Tool Search mode, schemas are stored in the ToolIndex but **not** sent to the LLM until explicitly requested via `mcp_search({ action: "get_schema", tool: "..." })`.

### Result Truncation

MCP tools can return arbitrarily large responses (full web pages, large file contents). Before returning to the agent:

1. Serialize result content to string
2. If byte length > `maxResultBytes` (default 100KB), truncate with a `[truncated — X bytes total, showing first Y]` marker
3. Per-server `maxResultBytes` override available in config

This protects against context window blowout from MCP tools that return entire documents. Applied in both Tier 1 and Tier 2 modes.

### Session Management

**Phase 1: Connect-discover-close, reconnect-per-call**

Two distinct phases within Phase 1:

1. **Startup discovery:** For each server, create transport → `client.connect()` → `client.listTools()` → `client.close()`. This populates the tool registry (Tier 1 AgentTools or Tier 2 ToolIndex). Connections are closed after discovery — no long-lived state at startup.
2. **Per-call execution:** When the agent calls an MCP tool, create a fresh transport → `client.connect()` → `client.callTool()` → `client.close()`. Each tool call is an independent connection cycle.

This means 3 round-trips per tool call (~1s overhead), which is acceptable for research tools responding in 2-4s. The key benefit: zero long-lived state, no reconnection logic, no keepalive management.

**Phase 2: Persistent sessions**

- `client.connect()` once at startup, keep alive for both discovery and tool calls
- All tool calls reuse the existing connection (1 round-trip instead of 3)
- Reconnect on failure with exponential backoff
- Need to handle concurrent access: each MCP `Client` instance gets a request queue (FIFO) — concurrent calls from parallel agent sessions are serialized per-server to avoid protocol-level races. The SDK's `Client` is not documented as thread-safe, so we serialize rather than risk interleaving JSON-RPC messages. If throughput becomes an issue, pool multiple Client instances per high-traffic server.
- `listChanged` notification triggers re-discovery without reconnecting

Start with Phase 1. The SDK makes upgrading to Phase 2 straightforward — same `Client` class, just keep it alive instead of closing after each call.

### Error Handling

- MCP server unreachable at startup: log warning, skip server, continue with other tools
- MCP server error during tool call: return tool error result to agent (not a crash)
- Auth failure (401/403): log error, mark server as unavailable, include hint in error message
- Timeout: respect per-server `timeout` config, default 30s
- Invalid tool schema: log warning, skip that specific tool
- Result too large: truncate (not error) per maxResultBytes config
- Tool Search: if `mcp_search` invocation targets an unavailable server, return helpful error with available alternatives
- Empty ToolIndex: if all servers fail at startup and the index has zero tools, `mcp_search({ action: "search" })` returns: `"No MCP servers are currently connected. Check server configuration with 'openclaw mcp health'."` — not empty results, which would cause the LLM to spin
- Ambiguous invoke: if tool name exists on multiple servers and `server` param is omitted, return disambiguation error listing the matching servers (see "Invoke Routing Collision" section)

### Tool Policy Integration

MCP tools interact with the existing tool policy system (`tools.allow`, `tools.deny`, `tools.byProvider`):

- **Tier 1 (direct):** MCP tools are registered with their resolved name (prefixed or bare). They appear in the runtime tool list and can be referenced in `allow`/`deny` lists by name.
- **Tier 2 (search):** The `mcp_search` meta-tool itself can be denied via `tools.deny: ["mcp_search"]` to disable all MCP access. Individual MCP tools can be denied by name — the tool-search module checks deny lists before returning search results or executing invocations.
- MCP tools bypass tool profiles (`minimal`, `coding`, `full`) — they're always available if configured
- Explicit `tools.deny` entries block MCP tools (e.g., `deny: ["mcp_zai_search_*"]`)
- `tools.byProvider` does not apply (MCP tools are provider-agnostic)

### System Prompt Report Integration

The existing `system-prompt-report.ts` tracks per-tool schema size (`schemaChars`, `propertiesCount`). MCP tools flow through the same reporting:

- **Tier 1:** Each MCP tool appears as a separate entry with its full schema cost
- **Tier 2:** Only `mcp_search` appears (~200 chars schema), with a summary annotation showing total deferred tools count
- This gives operators visibility into MCP token overhead in gateway logs

### Tool Count Warning

At startup, after discovering all MCP tools, log a summary:

```
[mcp] Connected to 3 servers, discovered 5 tools (direct registration mode)
```

```
[mcp] Connected to 8 servers, discovered 47 tools (tool search mode, threshold: 15)
```

If in direct mode and tool count is approaching the threshold:

```
[mcp] Warning: 13/15 MCP tools registered directly. Consider toolSearch: "always" or adding more servers will auto-switch to search mode.
```

---

## Integration Points

### 1. Config Schema (`src/config/types.tools.ts`)

Add `McpConfig`, `McpServerConfig`, and `McpRegistryConfig` types:

```typescript
export interface McpServerConfig {
  type: "http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string; // Working directory for stdio servers
  headers?: Record<string, string>; // Supports ${ENV_VAR} interpolation
  env?: Record<string, string>;
  auth?: McpAuthConfig; // OAuth config (Phase 4); placeholder until then
  enabled?: boolean;
  timeout?: number;
  toolNames?: "prefixed" | "bare";
  prefix?: string;
  maxResultBytes?: number;
}

// Phase 4: OAuth support for servers like Notion, GitHub, Sentry
export interface McpAuthConfig {
  type: "bearer" | "oauth";
  token_env?: string; // Env var name for bearer token
  client_id?: string; // OAuth client ID
  client_secret_env?: string; // Env var name for OAuth client secret
  callback_port?: number; // Fixed OAuth callback port
  auth_server_metadata_url?: string; // Override OIDC discovery URL
}

export interface McpRegistryConfig {
  id: string;
  name: string;
  url: string;
  description?: string;
  auth_token_env?: string;
  visibility?: "public" | "private";
  enabled?: boolean;
}

export interface McpConfig {
  maxResultBytes?: number;
  toolSearchThreshold?: number;
  toolSearch?: "auto" | "always" | "never";
  registries?: McpRegistryConfig[];
  servers?: Record<string, McpServerConfig>;
}
```

Add `mcp?: McpConfig` to the existing `ToolsConfig` interface.

### 2. Tool Registration (`src/agents/openclaw-tools.ts`)

In `createOpenClawTools()`, after registering native tools:

```typescript
import { connectMcpServers } from "../mcp/index.js";

const mcpTools = await connectMcpServers(config?.tools?.mcp);
// mcpTools is either:
//   - AgentTool[] of individual MCP tools (Tier 1, direct mode)
//   - [mcpSearchTool] single meta-tool (Tier 2, search mode)
tools.push(...mcpTools);
```

The `connectMcpServers()` function decides the tier based on config and tool count. The caller doesn't need to know which mode is active.

### 3. Tool Catalog (`src/agents/tool-catalog.ts`)

Add a dynamic "MCP" section to `CORE_TOOL_SECTIONS`. MCP tools don't appear in `CORE_TOOL_DEFINITIONS` (they're discovered at runtime). The catalog's `getActiveMcpTools()` function returns currently connected MCP tool metadata for UI display.

In Tool Search mode, the catalog shows all indexed tools (even though only `mcp_search` is registered with the agent).

### 4. Schema Normalization (`src/agents/pi-tools.schema.ts`)

MCP tool schemas pass through the existing `normalizeToolParameters()` pipeline:

- Gemini: constraint keywords stripped
- OpenAI: root-level `type: "object"` enforced
- xAI: validation keywords stripped
- Anthropic: full JSON Schema accepted

In Tier 1, this happens at registration time. In Tier 2, schemas are normalized on-demand when returned via `get_schema` or before `invoke`.

### 5. Migration: `github_read` Tool

The existing `github_read` tool wraps MCPorter for zread. Migration path:

1. Phase 1 ships with MCP client + `github_read` still present (deprecated). At startup, always log: `[mcp] github_read is deprecated — add zai-zread to tools.mcp.servers to migrate to native MCP client`
2. If `tools.mcp.servers` includes a zread server, `github_read` is auto-disabled with a log message: `[mcp] github_read auto-disabled — zai-zread MCP server provides equivalent tools natively`
3. Keep deprecation notice for 1-2 releases, then remove `github_read` entirely once MCP client is validated

This avoids breaking saved agent configs or system prompts that reference `github_read`.

### 6. Gateway Startup

Initialize MCP connections after config is loaded but before the agent loop starts. Each server connects in parallel with a 10s init timeout. Failures are logged and skipped — the gateway starts regardless.

Startup flow:

1. Parse `tools.mcp` config (merge scopes: local → project → user)
2. Connect to all enabled servers in parallel (10s timeout each)
3. Collect `tools/list` from each successful connection
4. Count total tools across all servers
5. Decide mode: direct (Tier 1) or search (Tier 2) based on count vs threshold
6. Build either individual AgentTools or the mcp_search meta-tool + ToolIndex
7. Return tools to `createOpenClawTools()`

---

## Security Considerations

- MCP server URLs and headers may contain secrets — treat like API keys in config
- Auth tokens for registries are read from environment variables (never stored in config files)
- MCP tool names come from server config — sanitize (alphanumeric + underscores only) before registering
- MCP tool results contain external data — wrap with `wrapExternalContent()` safety boundary
- Result truncation prevents oversized responses from consuming context
- Stdio servers execute local commands — require explicit opt-in, never auto-discover
- Rate limiting: respect per-server timeout in Phase 1; per-server call rate limits added in Phase 2 (see Persistent Sessions deliverables)
- Tool Search mode: the `mcp_search` tool validates tool names against the index before invocation — prevents the LLM from fabricating tool names to probe servers
- Prompt injection: MCP tool descriptions and server instructions are external data. In Tool Search mode, search results are wrapped with `wrapExternalContent()` to prevent injection via tool descriptions
- Registry security: community/external registries should be treated as untrusted; server configs from external registries require user confirmation before installation (mirrors agent marketplace behavior)

---

## Implementation Phases

### Phase 1: Direct Registration + Z.AI Servers

**Goal:** Replace MCPorter, connect z.ai MCP servers natively, establish the `src/mcp/` module.

**Deliverables:**

- Add `@modelcontextprotocol/sdk` dependency
- Implement `src/mcp/` core modules:
  - `types.ts` — McpServerConfig, McpConfig, McpRegistryConfig types
  - `client-manager.ts` — SDK Client lifecycle (connect, listTools, callTool, close)
  - `tool-adapter.ts` — MCP tool → AgentTool conversion via `Type.Unsafe()`
  - `result-truncation.ts` — maxResultBytes enforcement
  - `scope.ts` — Installation scope resolution (local/project/user merge)
  - `index.ts` — `connectMcpServers()` public API
- Config schema for `tools.mcp` in `src/config/types.tools.ts`
- Dynamic tool registration in `createOpenClawTools()`
- Tool policy integration (deny list filtering, profile bypass)
- System prompt report integration (schema size tracking)
- Basic CLI commands: `openclaw mcp list`, `openclaw mcp add`, `openclaw mcp remove`, `openclaw mcp test`
- Deprecate `github_read` (keep as fallback, auto-disable when MCP zread configured)
- Test with all 3 z.ai MCP servers (HTTP + SSE transports)
- Unit tests with mocked SDK clients
- Startup logging (server count, tool count, mode)

**Token impact:** ~800 extra tokens/call for 5 z.ai tools. Negligible.

**Not in Phase 1:** Tool Search, persistent sessions, stdio transport, registries, web UI.

### Phase 2: Tool Search + Persistent Sessions

**Goal:** Scale to many MCP servers without context window pressure. Reduce per-call latency.

**Deliverables:**

#### Tool Search (Progressive Disclosure)

- Implement `tool-index.ts` — in-memory search index over all MCP tool metadata
- Implement `tool-search.ts` — the `mcp_search` meta-tool (search, get_schema, invoke actions)
- Auto-switching logic: direct mode vs search mode based on `toolSearchThreshold`
- `toolSearch` config override (`"auto"` / `"always"` / `"never"`)
- Compact tool card format for search results (name + description + parameter summary, no schema)
- Server instructions extraction and system prompt injection
- Tool policy enforcement within search results and invocations
- Schema normalization on-demand (per-provider cleaning at invoke time)

#### Persistent Sessions

- Keep SDK Client instances alive across calls (connection pooling in client-manager)
- Request serialization: FIFO queue per Client instance for concurrent call safety
- Reconnection with exponential backoff on server failure
- `listChanged` notification handling — rebuild ToolIndex when servers update their tools
- Per-server call rate limiting (configurable max calls/minute, default unlimited)
- Latency metrics logging (connect time, call time, reconnect count)

#### Observability

- Per-server health status (connected, degraded, unavailable)
- Per-server call rate and latency metrics
- Tool Search hit rate (how often the LLM finds what it needs on first search)
- System prompt report shows deferred tool count in search mode

**Token impact:** In search mode, MCP overhead drops from O(tools) to O(1) — ~200 tokens for the `mcp_search` tool regardless of how many MCP tools are configured.

### Phase 3: Registry, CLI & Web UI

**Goal:** Full marketplace experience — browse, install, manage MCP servers through registries, CLI, and web UI. Mirrors the agent marketplace pattern.

**Deliverables:**

#### Registry System

- Implement `registry-sync.ts` — git-based registry sync with local caching (mirrors `agent-registry-sync.ts`)
- Registry manifest format (`mcp-registry.json`) and `server.yaml` parsing
- Multi-registry support with namespace prefixing
- Registry CLI: `openclaw mcp registry add/remove/enable/disable/list`
- Registry sync: `openclaw mcp sync` (fetch latest manifests from all registries)
- Lock file support (`mcp-lock.yaml`) per scope

#### CLI Commands (Full)

- `openclaw mcp browse` — browse available servers from registries
- `openclaw mcp search` — search by keyword/category
- `openclaw mcp install` — install from registry
- `openclaw mcp info` — show server details
- `openclaw mcp health` — health check all/specific servers
- `openclaw mcp import` — import from Claude Code / Cursor / project `.mcp.json`
- `openclaw mcp lock --regenerate` — lock file management

#### Web UI Pages

- **Browse page** (`ui-next/src/pages/mcp/browse.tsx`) — card grid/table, category filters, search, install from registry
- **Installed page** (`ui-next/src/pages/mcp/installed.tsx`) — manage connected servers, enable/disable/remove/test/configure
- **Registries page** (`ui-next/src/pages/mcp/registries.tsx`) — add/sync/remove/enable/disable registries, expand to see servers
- **Health page** (`ui-next/src/pages/mcp/health.tsx`) — auto-refresh dashboard, per-server status/latency/tool count
- **Add Server modal** — manual server config (type, URL, headers, scope, naming)

#### Gateway RPCs

- `mcp.servers.*` — server CRUD, test, tools listing
- `mcp.registry.*` — registry management
- `mcp.browse.*` — registry server discovery
- `mcp.health.*` — health status and checks

#### Navigation

Add to ui-next sidebar:

```
MCP Servers
├── Browse
├── Installed
├── Registries
└── Health
```

### Phase 4: Stdio Transport + Ecosystem

**Goal:** Support local MCP servers, config auto-import, per-agent scoping.

**Deliverables:**

- Stdio transport for local MCP servers via `StdioClientTransport`
- Auto-import from Claude Code config (`~/.claude.json` mcpServers section)
- Auto-import from Cursor MCP config (`~/.cursor/mcp.json`)
- Auto-import from `.mcp.json` project files (Claude Code project scope format)
- Per-agent MCP server scoping — two approaches (decide during Phase 4):
  - **Config-level:** `tools.mcp.agentScopes: { "neo": ["zai-zread", "company-db"], "trinity": ["company-db"] }`
  - **Agent-level:** add `mcpServers` field to agent instance config (in `agents.instances[].mcpServers`)
  - Default: all agents can access all MCP servers (current behavior)
- OAuth 2.0 support for MCP servers that require it (Notion, GitHub, Sentry) via `McpAuthConfig`

### Phase 5: Community & Security

**Goal:** Enable external/community registries safely.

**Deliverables:**

- Community registry submission process with review/approval workflow
- Server config sandboxing (especially for stdio servers from untrusted sources)
- GPG/Sigstore signing for registry manifests
- User confirmation workflow for installing from external registries (mirrors agent marketplace behavior)

---

## Testing

### Phase 1 Tests

- Unit tests for tool-adapter (schema translation via Type.Unsafe, name resolution, collision handling)
- Unit tests for result-truncation (boundary cases, multi-content results, text + image mixed)
- Unit tests for client-manager (mock SDK Client, test connect/disconnect/error/timeout paths)
- Unit tests for scope resolution (local/project/user merge, override behavior)
- Config validation tests (invalid configs, missing required fields, type mismatches)
- Graceful degradation tests (server down at startup, auth failure, timeout, oversized results)
- Tool policy tests (deny list blocks MCP tools, profiles don't affect MCP tools)
- Integration test with z.ai MCP servers (live, behind `LIVE=1` flag)

### Phase 2 Tests

- Unit tests for tool-index (search relevance, edge cases, empty index)
- Unit tests for tool-search meta-tool (search/get_schema/invoke actions, error handling)
- Tier switching tests (auto threshold, always/never overrides)
- Persistent session tests (reconnection, listChanged handling, concurrent calls)
- Tool policy tests in search mode (denied tools excluded from results, denied servers blocked)
- System prompt report tests (deferred tool count, schema cost reporting)

### Phase 3 Tests

- Registry sync tests (git clone, manifest parsing, caching, offline)
- Registry namespace tests (collision detection, prefix resolution)
- Lock file tests (generate, frozen install, check drift)
- Web UI RPC tests (all mcp.\* endpoints)
- CLI command tests (install, remove, browse, search, health, import)

---

## Current State (as of 2026-03-11)

### What works today:

- `github_read` tool wraps MCPorter CLI to call z.ai zread (3 tools: search_doc, read_file, get_repo_structure)
- MCPorter config in `~/.mcporter/mcporter.json` has all 3 z.ai servers
- Claude Code config in `~/.claude.json` has all 3 z.ai MCPs configured
- z.ai zread: fully working
- z.ai reader: blocked by MCPorter SSE-only transport
- z.ai search: MCP protocol works but returns empty results (suspected z.ai backend issue)

### What this proposal replaces:

- The `github_read` MCPorter wrapper tool (`src/agents/tools/github-read.ts`)
- MCPorter as runtime dependency for MCP tools
- Per-tool wrapper code for each MCP server

---

## Comparison: Agent Marketplace vs MCP Marketplace

| Aspect                | Agent Marketplace                                           | MCP Marketplace                       |
| --------------------- | ----------------------------------------------------------- | ------------------------------------- |
| **Entity**            | Agents (agent.yaml + AGENT.md)                              | MCP Servers (server.yaml + README.md) |
| **Registry manifest** | `registry.json`                                             | `mcp-registry.json`                   |
| **Lock file**         | `agents-lock.yaml`                                          | `mcp-lock.yaml`                       |
| **Scopes**            | local / project / user                                      | local / project / user                |
| **CLI prefix**        | `openclaw agents`                                           | `openclaw mcp`                        |
| **Navigation**        | Browse, Organization, Installed, Registries, Health, Create | Browse, Installed, Registries, Health |
| **Dependencies**      | Tier 3 requires Tier 2 parent                               | None (servers are independent)        |
| **Namespacing**       | `registry/agent-id`                                         | `registry/server-id`                  |
| **Config location**   | `agents.registries`                                         | `tools.mcp.registries`                |
| **Bundles**           | `is_bundle: true` with `bundle_agents`                      | Not needed (servers are atomic)       |

Agent and MCP lock files are managed independently — `agents-lock.yaml` and `mcp-lock.yaml` live in the same scope directories but are never merged or cross-referenced. An agent install does not affect MCP lock files and vice versa.

---

## Dependencies

- `@modelcontextprotocol/sdk` — Official MCP TypeScript SDK (provides Client, transports, types)
- No other new dependencies needed (search index is simple keyword matching, no external lib required)

## References

- MCP Specification: https://modelcontextprotocol.io/specification
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- Claude Code Tool Search docs: https://code.claude.com/docs/en/mcp (see "Scale with MCP Tool Search" section)
- Claude Code MCP management: https://code.claude.com/docs/en/mcp (scopes, import, managed config)
- mcp-gateway (PMCP): https://github.com/ViperJuice/mcp-gateway (progressive disclosure pattern)
- ToolHive: https://github.com/stacklok/toolhive (gateway-level filtering + optimization)
- Z.AI MCP Docs: https://docs.z.ai/devpack/mcp/search-mcp-server
- Operator1 agent marketplace: `Project-tasks/Done/agent-marketplace-implementation.md` (reference for registry/marketplace patterns)
- Operator1 tool architecture: `src/agents/openclaw-tools.ts`, `src/agents/tools/common.ts`
- Operator1 tool pipeline: `src/agents/pi-tools.ts` (policy filtering), `src/agents/pi-tools.schema.ts` (provider normalization)
- Operator1 system prompt report: `src/agents/system-prompt-report.ts` (schema size tracking)
