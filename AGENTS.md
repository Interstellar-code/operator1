# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

OpenClaw is a personal AI assistant platform with a local-first Gateway architecture. It connects to messaging channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, etc.) and provides an AI agent runtime with tools, sessions, and multi-channel routing.

- Repo: https://github.com/openclaw/openclaw
- Docs: https://docs.openclaw.ai (Mintlify)

## Build, Test, and Development Commands

**Runtime:** Node 22+ required. Prefer Bun for TypeScript execution.

```bash
# Install dependencies
pnpm install

# Build (type-check + compile)
pnpm build

# Lint/format
pnpm lint          # oxlint
pnpm format        # oxfmt (check)
pnpm format:fix    # oxfmt (write)

# Tests
pnpm test                  # vitest (unit)
pnpm test:coverage         # with V8 coverage (70% thresholds)
pnpm test:e2e              # e2e tests
pnpm test:watch            # watch mode

# Run specific test file
vitest run src/path/to/file.test.ts

# Live tests (require real API keys)
OPENCLAW_LIVE_TEST=1 pnpm test:live

# Run CLI in dev
pnpm openclaw <command>    # runs via tsx
pnpm dev                   # alias

# Gateway dev
pnpm gateway:dev           # skips channel init
pnpm gateway:watch         # auto-reload on changes
```

**Pre-commit hooks:** `prek install` (runs same checks as CI)

## Project Structure

```
src/
├── cli/           # CLI wiring, program builder, prompts
├── commands/      # CLI command implementations (agent, gateway, onboard, doctor, etc.)
├── gateway/       # WebSocket server, control plane, HTTP endpoints
├── agents/        # Pi agent runtime, tools, auth profiles, identity
├── channels/      # Channel routing and shared abstractions
├── telegram/      # Telegram channel (grammY)
├── discord/       # Discord channel (Carbon)
├── slack/         # Slack channel (Bolt)
├── signal/        # Signal channel (signal-cli)
├── imessage/      # iMessage channel
├── web/           # WhatsApp web (Baileys)
├── config/        # Config loading, sessions, workspace
├── infra/         # Binaries, env, ports, runtime guards
├── media/         # Media pipeline (images, audio, video)
├── providers/     # LLM provider abstractions
├── plugins/       # Plugin loader and SDK
├── terminal/      # CLI output (palette, tables, ANSI)
├── tui/           # Terminal UI components
└── wizard/        # Onboarding wizard flows

apps/
├── macos/         # macOS menu bar app (Swift)
├── ios/           # iOS app (Swift)
├── android/       # Android app (Kotlin)
└── shared/        # OpenClawKit (shared Swift code)

extensions/        # Channel plugins (workspace packages)
├── msteams/       # Microsoft Teams
├── matrix/        # Matrix
├── googlechat/    # Google Chat
├── bluebubbles/   # BlueBubbles
├── zalo/          # Zalo
├── voice-call/    # Voice calling
└── ...

docs/              # Mintlify documentation
dist/              # Built output
ui/                # Control UI (web)
```

## Architecture

**Gateway (Control Plane):** Single WebSocket server (`src/gateway/server*.ts`) that manages:
- Sessions and presence
- Channel connections and routing
- Agent RPC invocations
- Tools and hooks
- Config reload
- Control UI serving

**Agent Runtime:** Pi agent in RPC mode (`src/agents/`) with:
- Tool streaming and block streaming
- Auth profile rotation and failover
- Bash tools with PTY support
- Session compaction

**Channels:** Each channel has its own directory with adapter code. Core channels in `src/`, extension channels in `extensions/`. When refactoring shared channel logic, always consider all channels.

**CLI:** Commander-based (`src/cli/program/`) with commands in `src/commands/`. Use `createDefaultDeps` for dependency injection.

## Coding Conventions

- **Language:** TypeScript (ESM), strict typing, avoid `any`
- **Naming:** "OpenClaw" for product/docs headings; `openclaw` for CLI/package/paths
- **File size:** Aim for ~500-700 LOC max; split/refactor when needed
- **Tests:** Colocated `*.test.ts` files; e2e in `*.e2e.test.ts`
- **Progress/spinners:** Use `src/cli/progress.ts` (osc-progress + @clack/prompts)
- **Tables/output:** Use `src/terminal/table.ts` for ANSI-safe output
- **Colors:** Use `src/terminal/palette.ts` (no hardcoded colors)
- **Tool schemas:** Avoid `Type.Union`, `anyOf`/`oneOf`/`allOf`; use `stringEnum`/`optionalStringEnum`

## Commit and PR Guidelines

- Create commits with `scripts/committer "<msg>" <file...>` to keep staging scoped
- Concise, action-oriented messages (e.g., `CLI: add verbose flag to send`)
- Changelog: keep latest released version at top (no `Unreleased` section)
- When working on a PR: add changelog entry with PR # and thank the contributor
- Full gate before committing: `pnpm lint && pnpm build && pnpm test`
- GitHub issues/comments: use literal multiline strings or `-F - <<'EOF'` for real newlines

## Docs (Mintlify)

- Internal doc links: root-relative, no `.md`/`.mdx` (e.g., `[Config](/configuration)`)
- Anchors: `[Hooks](/configuration#hooks)`
- README links: use absolute URLs (`https://docs.openclaw.ai/...`)
- Avoid em dashes and apostrophes in headings (breaks Mintlify anchors)
- Content must be generic: use placeholders like `user@gateway-host`

## Plugin Development

- Plugins live in `extensions/*` (workspace packages)
- Keep plugin-only deps in the extension's `package.json`
- Runtime deps must be in `dependencies` (install runs `npm install --omit=dev`)
- Avoid `workspace:*` in `dependencies`; put `openclaw` in `devDependencies` or `peerDependencies`

## Version Locations

- `package.json` (CLI)
- `apps/android/app/build.gradle.kts` (versionName/versionCode)
- `apps/ios/Sources/Info.plist` (CFBundleShortVersionString/CFBundleVersion)
- `apps/macos/Sources/OpenClaw/Resources/Info.plist` (CFBundleShortVersionString/CFBundleVersion)
- `docs/install/updating.md` (pinned npm version)

## Testing Guidelines

- Framework: Vitest with V8 coverage (70% thresholds)
- Do not set test workers above 16
- Mobile: check for connected real devices before using simulators
- Docker tests: `pnpm test:docker:all`
- Pure test additions don't need changelog entries unless they alter user-facing behavior

## Security

- Never commit real phone numbers, videos, or live config values
- Web provider creds: `~/.openclaw/credentials/`
- Pi sessions: `~/.openclaw/sessions/`
- Agent sessions: `~/.openclaw/agents/<agentId>/sessions/*.jsonl`

## Key Dependencies

- **@whiskeysockets/baileys:** WhatsApp web client
- **grammy:** Telegram bot framework
- **@slack/bolt:** Slack app framework
- **@buape/carbon:** Discord interactions (do not update)
- **@mariozechner/pi-*:** Pi agent runtime
- **commander:** CLI framework
- **@sinclair/typebox:** JSON schema
- Patched deps (in `pnpm.patchedDependencies`) must use exact versions (no `^`/`~`)
- Patching dependencies (pnpm patches, overrides, or vendored changes) requires explicit approval

## Release Channels

- **stable:** tagged releases (`vYYYY.M.D`), npm dist-tag `latest`
- **beta:** prerelease tags (`vYYYY.M.D-beta.N`), npm dist-tag `beta`
- **dev:** moving head on `main` (no tag; git checkout main)

## macOS/iOS Development

- Mac packaging: `scripts/package-mac-app.sh` (defaults to current arch)
- Release checklist: `docs/platforms/mac/release.md`
- SwiftUI: prefer `Observation` framework (`@Observable`, `@Bindable`) over `ObservableObject`/`@StateObject`
- iOS Team ID lookup: `security find-identity -p codesigning -v`
- macOS logs: use `./scripts/clawlog.sh` to query unified logs
- Gateway runs as menubar app; restart via app or `scripts/restart-mac.sh`

## Android Development

```bash
pnpm android:run      # build + install + launch
pnpm android:test     # unit tests
```

## Multi-Agent Safety

- Do not create/apply/drop `git stash` entries unless explicitly requested
- Do not create/remove/modify `git worktree` checkouts unless explicitly requested
- Do not switch branches unless explicitly requested
- When user says "push": may `git pull --rebase` (never discard other agents' work)
- When user says "commit": scope to your changes only
- Focus reports on your edits; when multiple agents touch the same file, continue if safe

## Troubleshooting

- Run `openclaw doctor` to surface config issues and run migrations
- Legacy config/service warnings: covered by doctor migrations

## exe.dev VM Ops

- Access: `ssh exe.dev` then `ssh vm-name`
- Update: `sudo npm i -g openclaw@latest`
- Restart gateway: `pkill -9 -f openclaw-gateway || true; nohup openclaw gateway run --bind loopback --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &`
- Verify: `openclaw channels status --probe`, `ss -ltnp | rg 18789`
