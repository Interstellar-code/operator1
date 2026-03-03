---
summary: "Neo (CTO) environment-specific tool notes"
read_when:
  - Starting a new agent session
---

# TOOLS.md — Neo's Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — environment details unique to this setup.

## What Goes Here

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
