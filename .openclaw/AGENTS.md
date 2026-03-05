# Operator1 — Agent Conventions

## Tech Stack

- **Language:** TypeScript (ESM)
- **Runtime:** Bun (dev/test), Node 22+ (production)
- **Package Manager:** pnpm (with workspace support)
- **Test Framework:** Vitest with V8 coverage (70% threshold)
- **Linting/Formatting:** Oxlint + Oxfmt
- **Build:** TypeScript compiler (`pnpm build`)

## Code Conventions

- Strict typing; avoid `any` — never add `@ts-nocheck`
- Colocated tests: `*.test.ts` next to source files
- Keep files under ~500-700 LOC; split/refactor as needed
- Use existing patterns for CLI options and dependency injection via `createDefaultDeps`
- Never share class behavior via prototype mutation
- Brief comments for tricky/non-obvious logic only

## Build & Test

```bash
pnpm install          # Install dependencies
pnpm build            # Type-check and build
pnpm tsgo             # TypeScript checks only
pnpm check            # Lint and format check
pnpm format:fix       # Auto-fix formatting
pnpm test             # Run tests (vitest)
pnpm test:coverage    # Run tests with coverage
```

## Deployment

- CLI published to npm as `openclaw`
- macOS app via Sparkle auto-update
- Gateway runs as menubar app or standalone process

## Team Assignments

- **Neo (CTO):** Architecture decisions, engineering coordination
- **Tank:** Backend, gateway, API endpoints
- **Spark:** Frontend, UI components, dashboard
- **Dozer:** DevOps, CI/CD, infrastructure
- **Cipher:** Security audits, auth flows
- **Mouse:** QA, testing, research
