# Operator1 — Tools

## ACP Harness Preference

Default: `claude` (Claude Code)

Large TypeScript monorepo with complex multi-file dependencies across CLI, gateway, agents, and UI.
Claude Code is preferred for its ability to reason about cross-module changes.

## Scripts

```bash
pnpm openclaw ...       # Run CLI in dev mode
pnpm dev                # Alternative dev mode
pnpm check              # Lint + format check
pnpm format:fix         # Auto-fix formatting
pnpm test               # Run vitest
pnpm test:coverage      # Run with coverage
pnpm build              # Full build
```
