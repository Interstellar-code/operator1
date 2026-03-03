---
summary: "Neo (CTO) environment-specific tool notes"
read_when:
  - Starting a new agent session
---

# TOOLS.md — Neo's Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — environment details unique to this setup.

## ACP Configuration

Your engineering workers (Tank, Dozer, Mouse, Spark, Cipher, etc.) orchestrate coding agents via ACP. They need ACP enabled and properly configured.

### Required Gateway Config

```json
{
  "acp": {
    "enabled": true,
    "dispatch": { "enabled": true },
    "backend": "acpx",
    "defaultAgent": "claude",
    "allowedAgents": ["claude", "codex", "pi", "opencode", "gemini"],
    "maxConcurrentSessions": 12,
    "stream": { "deliveryMode": "live" }
  }
}
```

### Harness Selection Guide

| Task Profile                        | Harness                | Why                     |
| ----------------------------------- | ---------------------- | ----------------------- |
| Complex refactoring, multi-file     | `claude` (Claude Code) | Best codebase reasoning |
| Fast boilerplate, simple generation | `codex` (Codex CLI)    | Speed-optimized         |
| Algorithm design, reasoning-heavy   | `pi` (Anthropic Pi)    | Step-by-step reasoning  |
| Large context (many files)          | `gemini` (Gemini CLI)  | Largest context window  |
| Default / uncertain                 | `claude`               | Best general-purpose    |

### Spawn Depth

The orchestration chain is: User → Operator1 → Neo → Worker → ACP Session = **depth 4**.
Ensure `maxSpawnDepth` is at least `4` in agent config defaults.

### Troubleshooting

- **ACP spawn fails:** Check `acp.enabled`, verify `acpx` backend is installed
- **Harness not found:** Check `acp.allowedAgents` includes the target harness ID
- **Session limit hit:** Increase `acp.maxConcurrentSessions` (default 8, recommend 12+ for multi-worker tasks)
- **Run `/acp doctor`** to diagnose backend health

## What Else Goes Here

Things like:

- Dev machine specs and OS
- SSH hosts and access patterns
- CI/CD service details
- Cloud provider accounts and regions
- Database connection notes
- Preferred IDE and extensions
- Container registries and image names

## Examples

```markdown
### Dev Environment

- Primary machine: MacBook Pro M4, macOS 15
- Editor: VS Code with Vim bindings
- Terminal: Kitty + zsh

### SSH

- staging → 10.0.1.50, user: deploy
- production → restricted, VPN required

### CI/CD

- GitHub Actions for PRs
- Deploy: Fly.io (staging auto, production manual)

### Databases

- Local dev: SQLite
- Staging: PostgreSQL 16 on Fly
```

## Why Separate?

Skills are shared across all agents. Your setup notes are yours. Keeping them apart means you can update skills without losing your notes.

---

Add whatever helps you do engineering work. This is your cheat sheet.
