# Straico Provider Integration for OpenClaw

## Overview

Integrate Straico as a custom LLM provider in OpenClaw to access 50+ AI models through a unified OpenAI-compatible API with coin-based pricing. Pure configuration — no code changes required.

## Status

- [x] Planning
- [x] Research (API docs, model IDs verified)
- [ ] Configuration & Testing
- [ ] Completed

## Critical Findings

### Streaming NOT Supported

Straico confirmed: "Streaming isn't supported yet, but asynchronous completions work normally." **Every Straico model entry must have `streaming: false`** in `agents.defaults.models` — without this, OpenClaw defaults to `streaming: true` and will get broken/empty responses.

Config lever: `AgentModelEntryConfig.streaming` (see `src/config/types.agent-defaults.ts:16`).

### Tool Calling — Unknown, Default to Disabled

Tool/function calling support is unconfirmed. **Safe default: `compat: { supportsTools: false }`** on every model definition until verified. Without this, agent tool-use workflows will break silently.

Config lever: `ModelCompatConfig.supportsTools` (see `src/config/types.models.ts:21`).

### API Versions

Straico exposes multiple API versions:

- **v0** — Original endpoints (`/v0/chat/completions`, `/v0/models`)
- **v2** — Newer OpenAI-compatible family (`/v2/chat`, `/v2/models`)
- Use **v0** for now — it's the most tested by third-party integrations
- **Priority test:** check if v2 supports streaming — it's the newer family and may have added it

### Model ID Format

Model IDs use `provider/model` format (e.g., `openai/gpt-4.1`, `anthropic/claude-sonnet-4`). The slash is part of the ID. In OpenClaw config, these become `straico/openai/gpt-4.1` (provider prefix + Straico model ID).

## Architecture

```
┌─────────────────────────────────────────────┐
│         OpenClaw Gateway                    │
│                                             │
│  ┌────────────────────────────────────┐     │
│  │   Config (op1_config SQLite)       │     │
│  │   models.providers.straico → ...   │     │
│  └────────────────────────────────────┘     │
│                    ↓                        │
│  ┌────────────────────────────────────┐     │
│  │   Provider Resolution Pipeline     │     │
│  │   resolveProvidersForModelsJson()  │     │
│  │   → models.json (ephemeral)        │     │
│  └────────────────────────────────────┘     │
│                    ↓                        │
│  ┌────────────────────────────────────┐     │
│  │   Provider: straico                │     │
│  │   baseUrl: api.straico.com/v0      │     │
│  │   api: openai-completions          │     │
│  │   Auth: Bearer token               │     │
│  │   Streaming: DISABLED              │     │
│  │   Tools: DISABLED (until verified) │     │
│  └────────────────────────────────────┘     │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────┐
│      Straico API                            │
│  https://api.straico.com/v0                 │
│                                             │
│  POST /v0/chat/completions                  │
│  GET  /v0/models                            │
│  GET  /v0/models/{model_id}                 │
│                                             │
│  Auth: Authorization: Bearer <API_KEY>      │
└─────────────────────────────────────────────┘
```

### Storage Flow

Config is stored in the `op1_config` SQLite table (not a standalone JSON file). The gateway config JSON5 — including `models.providers.straico` — lives as `raw_json5` in the singleton `op1_config` row. Auth credentials go in `op1_auth_profiles`. The resolved provider list is written to an ephemeral `~/.openclaw/agents/{agentId}/models.json` on startup.

Key source files:

- `src/config/types.models.ts` — `ModelsConfig`, `ModelProviderConfig`, `ModelDefinitionConfig`
- `src/config/types.agent-defaults.ts` — `AgentModelEntryConfig` (streaming toggle)
- `src/config/zod-schema.core.ts` — Validation schema (fields are optional in Zod but should be provided)
- `src/agents/models-config.providers.ts` — Provider resolution
- `src/infra/state-db/config-sqlite.ts` — `op1_config` read/write

## Configuration

### Basic Setup

```json5
// Gateway config (stored in op1_config SQLite table)
// Edit via: openclaw config edit
{
  env: {
    STRAICO_API_KEY: "your-api-key-here",
  },

  agents: {
    defaults: {
      model: { primary: "straico/openai/gpt-4.1" },
      // Disable streaming for all Straico models
      models: {
        "straico/openai/gpt-4.1": { streaming: false },
        "straico/anthropic/claude-sonnet-4": { streaming: false },
        "straico/google/gemini-2.5-flash": { streaming: false },
      },
    },
  },

  models: {
    mode: "merge",
    providers: {
      straico: {
        baseUrl: "https://api.straico.com/v0",
        apiKey: "${STRAICO_API_KEY}",
        api: "openai-completions",
        models: [
          {
            id: "openai/gpt-4.1",
            name: "GPT 4.1",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16384,
            compat: { supportsTools: false },
          },
          {
            id: "anthropic/claude-sonnet-4",
            name: "Claude Sonnet 4",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "google/gemini-2.5-flash",
            name: "Gemini 2.5 Flash",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1000000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
        ],
      },
    },
  },
}
```

### Full Configuration with Failover

```json5
{
  env: {
    STRAICO_API_KEY: "sk-...",
  },

  agents: {
    defaults: {
      model: {
        primary: "straico/openai/gpt-4.1",
        fallbacks: ["straico/anthropic/claude-sonnet-4", "straico/google/gemini-2.5-flash"],
      },
      // Disable streaming for ALL Straico models
      models: {
        "straico/openai/gpt-4.1": { streaming: false },
        "straico/openai/gpt-4o-2024-11-20": { streaming: false },
        "straico/openai/o3-mini": { streaming: false },
        "straico/anthropic/claude-sonnet-4": { streaming: false },
        "straico/anthropic/claude-3.7-sonnet": { streaming: false },
        "straico/anthropic/claude-3.7-sonnet:thinking": { streaming: false },
        "straico/anthropic/claude-3.5-sonnet": { streaming: false },
        "straico/anthropic/claude-3-opus": { streaming: false },
        "straico/anthropic/claude-3-5-haiku-20241022": { streaming: false },
        "straico/google/gemini-2.5-pro-preview": { streaming: false },
        "straico/google/gemini-2.5-flash": { streaming: false },
        "straico/google/gemini-2.5-flash-lite": { streaming: false },
        "straico/google/gemini-2.0-flash-001": { streaming: false },
        "straico/google/gemini-pro-1.5": { streaming: false },
        "straico/deepseek/deepseek-chat-v3.1": { streaming: false },
        "straico/deepseek/deepseek-chat-v3-0324": { streaming: false },
        "straico/deepseek/deepseek-chat": { streaming: false },
        "straico/deepseek/deepseek-r1": { streaming: false },
        "straico/deepseek/deepseek-r1:nitro": { streaming: false },
        "straico/x-ai/grok-4": { streaming: false },
        "straico/meta-llama/llama-3.1-405b-instruct": { streaming: false },
        "straico/amazon/nova-pro-v1": { streaming: false },
        "straico/amazon/nova-lite-v1": { streaming: false },
        "straico/amazon/nova-micro-v1": { streaming: false },
        "straico/cohere/command-r-plus-08-2024": { streaming: false },
        "straico/cohere/command-r-08-2024": { streaming: false },
        "straico/mistralai/mixtral-8x7b-instruct": { streaming: false },
      },
    },
  },

  models: {
    mode: "merge",
    providers: {
      straico: {
        baseUrl: "https://api.straico.com/v0",
        apiKey: "${STRAICO_API_KEY}",
        api: "openai-completions",
        models: [
          // OpenAI
          {
            id: "openai/gpt-4.1",
            name: "GPT 4.1",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16384,
            compat: { supportsTools: false },
          },
          {
            id: "openai/gpt-4o-2024-11-20",
            name: "GPT-4o",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 16384,
            compat: { supportsTools: false },
          },
          {
            id: "openai/o3-mini",
            name: "o3-mini",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 100000,
            compat: { supportsTools: false },
          },

          // Anthropic
          {
            id: "anthropic/claude-sonnet-4",
            name: "Claude Sonnet 4",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "anthropic/claude-3.7-sonnet",
            name: "Claude 3.7 Sonnet",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "anthropic/claude-3.7-sonnet:thinking",
            name: "Claude 3.7 Sonnet (Thinking)",
            reasoning: true,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "anthropic/claude-3.5-sonnet",
            name: "Claude 3.5 Sonnet",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "anthropic/claude-3-opus",
            name: "Claude 3 Opus",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 4096,
            compat: { supportsTools: false },
          },
          {
            id: "anthropic/claude-3-5-haiku-20241022",
            name: "Claude 3.5 Haiku",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },

          // Google
          {
            id: "google/gemini-2.5-pro-preview",
            name: "Gemini 2.5 Pro",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1000000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "google/gemini-2.5-flash",
            name: "Gemini 2.5 Flash",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1000000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "google/gemini-2.5-flash-lite",
            name: "Gemini 2.5 Flash Lite",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1000000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "google/gemini-2.0-flash-001",
            name: "Gemini 2.0 Flash",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 1000000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "google/gemini-pro-1.5",
            name: "Gemini Pro 1.5",
            reasoning: false,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 2000000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },

          // DeepSeek
          {
            id: "deepseek/deepseek-chat-v3.1",
            name: "DeepSeek V3.1",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 64000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "deepseek/deepseek-chat-v3-0324",
            name: "DeepSeek V3 (0324)",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 64000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "deepseek/deepseek-chat",
            name: "DeepSeek Chat",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 64000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "deepseek/deepseek-r1",
            name: "DeepSeek R1",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 64000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },
          {
            id: "deepseek/deepseek-r1:nitro",
            name: "DeepSeek R1 Nitro",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 64000,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },

          // xAI
          {
            id: "x-ai/grok-4",
            name: "Grok 4",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 131072,
            maxTokens: 8192,
            compat: { supportsTools: false },
          },

          // Meta
          {
            id: "meta-llama/llama-3.1-405b-instruct",
            name: "Llama 3.1 405B",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 4096,
            compat: { supportsTools: false },
          },

          // Amazon
          {
            id: "amazon/nova-pro-v1",
            name: "Nova Pro",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 300000,
            maxTokens: 5120,
            compat: { supportsTools: false },
          },
          {
            id: "amazon/nova-lite-v1",
            name: "Nova Lite",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 300000,
            maxTokens: 5120,
            compat: { supportsTools: false },
          },
          {
            id: "amazon/nova-micro-v1",
            name: "Nova Micro",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 5120,
            compat: { supportsTools: false },
          },

          // Cohere
          {
            id: "cohere/command-r-plus-08-2024",
            name: "Command R+",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 4096,
            compat: { supportsTools: false },
          },
          {
            id: "cohere/command-r-08-2024",
            name: "Command R",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128000,
            maxTokens: 4096,
            compat: { supportsTools: false },
          },

          // Mistral
          {
            id: "mistralai/mixtral-8x7b-instruct",
            name: "Mixtral 8x7B",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 32768,
            maxTokens: 4096,
            compat: { supportsTools: false },
          },
        ],
      },
    },
  },
}
```

### Channel-Specific Routing

```json5
{
  channels: {
    modelByChannel: {
      telegram: {
        "-1001234567890": "straico/anthropic/claude-sonnet-4",
        "-1009876543210": "straico/deepseek/deepseek-chat-v3.1",
      },
      discord: {
        "123456789012345678": "straico/google/gemini-2.5-pro-preview",
      },
    },
  },
}
```

## Verified Model IDs (from API)

These IDs were confirmed from actual `/v0/models` responses reported by third-party integrations.
**Important:** Run `GET /v0/models` with the real API key before deploying — some IDs may have changed.

### Chat Models

| Straico Model ID                       | Provider  | Reasoning | Notes             |
| -------------------------------------- | --------- | --------- | ----------------- |
| `openai/gpt-4.1`                       | OpenAI    | No        |                   |
| `openai/gpt-4o-2024-11-20`             | OpenAI    | No        |                   |
| `openai/o3-mini`                       | OpenAI    | Yes       |                   |
| `anthropic/claude-sonnet-4`            | Anthropic | No        |                   |
| `anthropic/claude-3.7-sonnet`          | Anthropic | No        |                   |
| `anthropic/claude-3.7-sonnet:thinking` | Anthropic | Yes       | Extended thinking |
| `anthropic/claude-3.5-sonnet`          | Anthropic | No        |                   |
| `anthropic/claude-3-opus`              | Anthropic | No        |                   |
| `anthropic/claude-3-5-haiku-20241022`  | Anthropic | No        | Fast/cheap        |
| `google/gemini-2.5-pro-preview`        | Google    | No        |                   |
| `google/gemini-2.5-flash`              | Google    | No        |                   |
| `google/gemini-2.5-flash-lite`         | Google    | No        |                   |
| `google/gemini-2.0-flash-001`          | Google    | No        |                   |
| `google/gemini-pro-1.5`                | Google    | No        |                   |
| `deepseek/deepseek-chat-v3.1`          | DeepSeek  | No        |                   |
| `deepseek/deepseek-chat-v3-0324`       | DeepSeek  | No        |                   |
| `deepseek/deepseek-chat`               | DeepSeek  | No        |                   |
| `deepseek/deepseek-r1`                 | DeepSeek  | Yes       |                   |
| `deepseek/deepseek-r1:nitro`           | DeepSeek  | Yes       | Faster R1         |
| `x-ai/grok-4`                          | xAI       | No        |                   |
| `meta-llama/llama-3.1-405b-instruct`   | Meta      | No        |                   |
| `amazon/nova-pro-v1`                   | Amazon    | No        |                   |
| `amazon/nova-lite-v1`                  | Amazon    | No        |                   |
| `amazon/nova-micro-v1`                 | Amazon    | No        |                   |
| `cohere/command-r-plus-08-2024`        | Cohere    | No        |                   |
| `cohere/command-r-08-2024`             | Cohere    | No        |                   |
| `mistralai/mixtral-8x7b-instruct`      | Mistral   | No        |                   |

50+ models total. Run `GET /v0/models` with your API key for the full current list.

## Testing

### Validate API Connectivity

```bash
# 1. List all available models
curl -s -H "Authorization: Bearer $STRAICO_API_KEY" \
  https://api.straico.com/v0/models | jq '.[] | .id'

# 2. Test chat completion (non-streaming)
curl -X POST https://api.straico.com/v0/chat/completions \
  -H "Authorization: Bearer $STRAICO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4.1",
    "stream": false,
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# 3. Test v2 streaming (may work on newer endpoint)
curl -X POST https://api.straico.com/v2/chat \
  -H "Authorization: Bearer $STRAICO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4.1",
    "stream": true,
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# 4. Test tool calling
curl -X POST https://api.straico.com/v0/chat/completions \
  -H "Authorization: Bearer $STRAICO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-4.1",
    "stream": false,
    "messages": [{"role": "user", "content": "What is the weather in London?"}],
    "tools": [{"type": "function", "function": {"name": "get_weather", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}}}]
  }'

# 5. Verify via OpenClaw
openclaw doctor
openclaw models list | grep straico

# 6. Switch model dynamically
openclaw models set straico/openai/gpt-4.1
openclaw models set straico/anthropic/claude-sonnet-4
```

### Test Checklist (Priority Order)

- [ ] API key authentication works
- [ ] `/v0/models` returns model list — verify IDs match config
- [ ] Chat completion works (non-streaming, v0)
- [ ] **v2 streaming** — test if `/v2/chat` supports `stream: true` (UX impact)
- [ ] **Tool/function calling** — test with tool payload, update `supportsTools` if it works
- [ ] Confirm `streaming: false` in agent config prevents broken responses
- [ ] Failover triggers when Straico is unreachable
- [ ] Failover triggers on `402` / coin-exhaustion errors
- [ ] Channel routing selects correct model
- [ ] `openclaw models set` switches to/from Straico dynamically

## Known Limitations

| Limitation                           | Impact                                               | Workaround                                                                                        |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **No streaming (v0)**                | Responses arrive all at once, no incremental display | Set `streaming: false` per model; test v2 for streaming; failover to streaming-capable providers  |
| **Tool calling unknown**             | Agent tool-use may break silently                    | Set `compat: { supportsTools: false }`; test explicitly; fall back to direct providers            |
| **Coin-based billing**               | Cost tracking doesn't map to per-token pricing       | Use `cost: { input: 0 ... }` placeholders; monitor via Straico dashboard                          |
| **Coin exhaustion mid-conversation** | Responses may fail with 402                          | Configure failover chain to direct providers (e.g., Anthropic, OpenAI) that trigger on 402 errors |
| **Rate limits undocumented**         | Could hit throttling unexpectedly                    | Implement failover chain                                                                          |

## Still Unknown (Needs Testing with API Key)

1. **v2 streaming support** (highest priority — may unlock streaming UX)
2. **Tool/function calling** (enables or disables agent workflows)
3. Exact coin cost per model per token
4. Rate limits and quotas
5. Image/video generation endpoint compatibility
6. Prompt caching support
7. What happens when coins are exhausted mid-conversation (402? 429? empty response?)

## References

- [Straico Platform](https://platform.straico.com)
- [Straico API Page](https://straico.com/api/)
- [Straico OpenAI-Compatible API v2 Changelog](https://straico.com/platform-changelog/%F0%9F%9A%80-new-openai-compatible-api-v2/)
- [Straico as OpenRouter Alternative](https://straico.com/simplifying-multi-model-llm-access-with-straico-as-an-openrouter-alternative/)
- [Postman API Docs](https://documenter.getpostman.com/view/5900072/2s9YyzddrR)
- [Opencode Straico Issue (streaming findings)](https://github.com/sst/opencode/issues/2724)
