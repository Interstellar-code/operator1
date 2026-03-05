# Operator1

## What This Project Is

Operator1 (OpenClaw) is an AI agent framework that provides a CLI, gateway server, and multi-agent orchestration system. It enables conversational AI agents to manage tasks across messaging channels (Telegram, Discord, Slack, Signal, iMessage, WhatsApp, web) with a unified gateway architecture.

## Architecture Overview

- **CLI** (`src/cli/`): Command-line interface for configuration, channel management, and agent operations
- **Gateway** (`src/gateway/`): HTTP/WebSocket server that routes messages between channels and AI providers
- **Agents** (`src/agents/`): Multi-agent system with Pi (primary agent) and Matrix (team orchestration)
- **Channels** (`src/telegram/`, `src/discord/`, etc.): Platform-specific message adapters
- **Extensions** (`extensions/`): Plugin system for additional channels and integrations
- **UI** (`ui-next/`): Next.js dashboard for agent management and visualization
- **Apps** (`apps/`): Native macOS, iOS, and Android applications

## Current Phase

Active development — CLI, gateway, multi-agent Matrix system, and native apps all under active iteration.

## Key Decisions

- TypeScript (ESM) throughout, with Bun as the primary runtime for dev/test
- pnpm for package management with workspace support
- Vitest for testing with V8 coverage
- Agent orchestration via ACP (Agent Communication Protocol)
- Matrix system: 4-tier agent hierarchy (Operator1 → Department Heads → Specialists → Coding Agents)
