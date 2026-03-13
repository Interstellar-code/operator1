---
# -- Dart AI metadata ----------------------------------------------------------
title: "Operator1Hub — Curated Registry"
description: "GitHub-hosted curated registry of skills, agents, and commands that ships built-in with operator1"
dartboard: "Operator1/Tasks"
type: Project
status: "To-do"
priority: high
assignee: "rohit sharma"
tags: [feature, hub, registry, skills, agents, commands]
startAt:
dueAt:
dart_project_id:
# -------------------------------------------------------------------------------
---

# Operator1Hub — Curated Registry

**Created:** 2026-03-13
**Status:** Planning
**Depends on:** Skills system (done), Commands system (done), Slash commands (done)
**Supersedes:** `Project-tasks/agent-personas-marketplace.md` (personas delivery now via Hub)

---

## 1. Overview

Operator1Hub is a first-party, GitHub-hosted registry of curated skills, agent
personas, and commands. It ships as the **default registry** with operator1 —
no setup required. Every item is tested and optimized before inclusion.

Users can also optionally connect ClawHub or other registries as additional
sources, but Operator1Hub is independent and self-contained.

**Repo:** `github.com/operator1ai/operator1hub` (to be created)

---

## 2. Goals

- Ship a built-in, curated registry that works out of the box
- Provide three content types: **skills**, **agents** (personas), **commands**
- Keep it independent from ClawHub — separate codebase, protocol, and UI
- GitHub-native: content as files, versioning via releases, PRs for curation
- Enable users to browse, install, and uninstall from the operator1 UI and CLI

## 3. Out of Scope

- Community submissions (future — requires review pipeline)
- Paid/premium content
- ClawHub integration or adapter layer
- Self-hosted hub instances
- Auto-update of installed items (manual refresh for now)

---

## 4. Design Decisions

| Decision                | Options Considered                             | Chosen                                     | Reason                                                                                    |
| ----------------------- | ---------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Hosting                 | Custom API server / npm registry / GitHub repo | GitHub repo                                | Zero infra cost, PR-based curation, raw content URLs for fetching, familiar workflow      |
| Registry protocol       | REST API / GraphQL / Static manifest           | Static `registry.json` manifest            | Single fetch to know everything available; no server needed; GitHub CDN handles delivery  |
| Relationship to ClawHub | Replace / Adapter / Independent                | Independent                                | No dependency on external infra; user can connect either or both                          |
| Default behavior        | Opt-in / Opt-out / Built-in                    | Built-in                                   | Hub URL baked into operator1 config; works on first launch                                |
| Content format          | Custom schema / Reuse SKILL.md / Mixed         | Unified manifest + native formats per type | Skills use SKILL.md, agents use AGENT.md, commands use command .md — manifest indexes all |
| Install location        | Global / Per-agent / Per-workspace             | Per-agent (default) with global option     | Matches current skills directory pattern `~/.openclaw/{agentId}/skills/`                  |

---

## 5. Technical Spec

### 5.1 Hub Repository Structure

```
operator1hub/
├── registry.json                  # manifest — single source of truth
├── skills/
│   ├── code-reviewer/
│   │   ├── SKILL.md               # skill definition (existing format)
│   │   └── README.md              # description for hub UI preview
│   ├── security-audit/
│   │   ├── SKILL.md
│   │   └── README.md
│   └── ...
├── agents/
│   ├── security-engineer.md       # persona definition (AGENT.md format)
│   ├── sre-agent.md
│   ├── architect.md
│   └── ...
├── commands/
│   ├── review-pr.md               # command definition (YAML frontmatter .md)
│   ├── deploy-check.md
│   └── ...
└── collections/
    ├── engineering-essentials.json # bundled sets
    └── devops-starter.json
```

### 5.2 Registry Manifest (`registry.json`)

```jsonc
{
  "version": 1,
  "updated": "2026-03-13T00:00:00Z",
  "items": [
    {
      "slug": "code-reviewer",
      "name": "Code Reviewer",
      "type": "skill", // "skill" | "agent" | "command"
      "category": "engineering",
      "description": "Thorough code review with style, correctness, and security checks",
      "path": "skills/code-reviewer/SKILL.md",
      "version": "1.0.0",
      "tags": ["code-quality", "review", "pr"],
      "emoji": "🔍",
      "sha256": "abc123...", // integrity check
    },
    {
      "slug": "security-engineer",
      "name": "Security Engineer",
      "type": "agent",
      "category": "engineering",
      "description": "OWASP-focused security review persona for subagents",
      "path": "agents/security-engineer.md",
      "version": "1.0.0",
      "tags": ["security", "owasp", "audit"],
      "emoji": "🛡️",
      "sha256": "def456...",
    },
  ],
  "collections": [
    {
      "slug": "engineering-essentials",
      "name": "Engineering Essentials",
      "description": "Core engineering skills and agents bundle",
      "items": ["code-reviewer", "security-engineer", "devops-automator", "architect"],
    },
  ],
}
```

### 5.3 Operator1 Integration Architecture

```
┌─────────────────────────────────────────────────────┐
│                    operator1                         │
│                                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │
│  │ hub.sync    │  │ hub.catalog │  │ hub.install│  │
│  │ hub.inspect │  │ hub.search  │  │ hub.remove │  │
│  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘  │
│         │                │               │          │
│         ▼                ▼               ▼          │
│  ┌─────────────────────────────────────────────┐    │
│  │         op1_hub_catalog (SQLite)            │    │
│  │  slug | type | name | version | installed  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  Installed content goes to:                         │
│  • skills → ~/.openclaw/{agentId}/skills/{slug}/    │
│  • agents → ~/.openclaw/{agentId}/agents/{slug}.md  │
│  • commands → ~/.openclaw/commands/{slug}.md         │
└─────────────────────────────────────────────────────┘
         │
         │ fetch registry.json + raw content
         ▼
┌─────────────────────────────────────────────────────┐
│  github.com/operator1ai/operator1hub                │
│  (static files, GitHub CDN, no server)              │
└─────────────────────────────────────────────────────┘
```

### 5.4 RPC Methods

| Method                  | Description                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| `hub.sync`              | Fetch `registry.json` from GitHub, upsert into `op1_hub_catalog`      |
| `hub.catalog`           | Query cached catalog — filter by type, category, search term          |
| `hub.search`            | Full-text search across name, description, tags                       |
| `hub.inspect`           | Fetch README/preview for a specific item                              |
| `hub.install`           | Download item content to local agent directory, record in locks table |
| `hub.remove`            | Delete installed item, remove lock                                    |
| `hub.installed`         | List locally installed hub items with version info                    |
| `hub.collections`       | List available collections                                            |
| `hub.installCollection` | Install all items in a collection                                     |

### 5.5 SQLite Schema

```sql
-- Hub catalog cache (refreshed on hub.sync)
CREATE TABLE IF NOT EXISTS op1_hub_catalog (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('skill', 'agent', 'command')),
  category    TEXT NOT NULL,
  description TEXT,
  path        TEXT NOT NULL,
  version     TEXT NOT NULL,
  tags_json   TEXT DEFAULT '[]',
  emoji       TEXT,
  sha256      TEXT,
  synced_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Installed items tracking
CREATE TABLE IF NOT EXISTS op1_hub_installed (
  slug          TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  version       TEXT NOT NULL,
  install_path  TEXT NOT NULL,
  agent_id      TEXT,           -- NULL = global (commands)
  installed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (slug) REFERENCES op1_hub_catalog(slug)
);

-- Collections cache
CREATE TABLE IF NOT EXISTS op1_hub_collections (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  items_json  TEXT NOT NULL     -- JSON array of item slugs
);
```

### 5.6 Default Hub URL Config

```typescript
// src/config/defaults.ts
export const DEFAULT_HUB_URL =
  "https://raw.githubusercontent.com/operator1ai/operator1hub/main/registry.json";
```

Configurable via `operator1 config set hub.url <url>` for custom/private hubs.

### 5.7 Initial Curated Content (Launch Set)

**Skills** (adapted from agency-agents + original):
| Slug | Name | Source |
| --- | --- | --- |
| `code-reviewer` | Code Reviewer | agency-agents |
| `security-audit` | Security Audit | agency-agents |
| `db-optimizer` | Database Optimizer | agency-agents |
| `devops-automator` | DevOps Automator | agency-agents |

**Agents** (personas):
| Slug | Name | Source |
| --- | --- | --- |
| `security-engineer` | Security Engineer | agency-agents |
| `sre-agent` | SRE Agent | agency-agents |
| `architect` | Software Architect | agency-agents |
| `technical-writer` | Technical Writer | agency-agents |

**Commands**:
| Slug | Name | Source |
| --- | --- | --- |
| `review-pr` | Review PR | original |
| `deploy-check` | Deploy Checklist | original |

**Collections**:
| Slug | Items |
| --- | --- |
| `engineering-essentials` | code-reviewer, security-audit, security-engineer, architect |
| `devops-starter` | devops-automator, sre-agent, deploy-check |

---

## 6. Implementation Plan

### Task 1: Phase 1 — Hub Repository & Manifest

**Status:** To-do | **Priority:** High | **Assignee:** rohit sharma | **Est:** 3h

Create the GitHub repo and populate with initial curated content.

- [ ] 1.1 Create `operator1ai/operator1hub` GitHub repo — initialize with README, LICENSE (MIT), and directory structure per §5.1
- [ ] 1.2 Define `registry.json` schema — implement manifest format per §5.2 with JSON schema validation
- [ ] 1.3 Convert 4 seed skills — adapt agency-agents engineering templates to SKILL.md format
- [ ] 1.4 Convert 4 seed agents — adapt agency-agents personas to AGENT.md format
- [ ] 1.5 Write 2 seed commands — create review-pr and deploy-check command definitions
- [ ] 1.6 Create 2 collections — engineering-essentials and devops-starter bundles

### Task 2: Phase 2 — Backend RPCs & SQLite

**Status:** To-do | **Priority:** High | **Assignee:** rohit sharma | **Est:** 4h

Build the operator1 gateway integration — sync, catalog, install/remove.

- [ ] 2.1 SQLite schema — add `op1_hub_catalog`, `op1_hub_installed`, `op1_hub_collections` tables per §5.5
- [ ] 2.2 `hub.sync` RPC — fetch registry.json from GitHub raw URL, upsert catalog, cache collections
- [ ] 2.3 `hub.catalog` + `hub.search` RPCs — query cached catalog with type/category/text filters
- [ ] 2.4 `hub.inspect` RPC — fetch item README from GitHub for preview
- [ ] 2.5 `hub.install` + `hub.remove` RPCs — download content to correct local directory, manage locks
- [ ] 2.6 `hub.installed` RPC — list installed items with version info
- [ ] 2.7 `hub.collections` + `hub.installCollection` RPCs — collection listing and bulk install
- [ ] 2.8 Register all hub methods — add to `server-methods.ts`, `server-methods-list.ts`, `method-scopes.ts`
- [ ] 2.9 Default hub URL config — bake in GitHub raw URL, allow override via `config set hub.url`

### Task 3: Phase 3 — UI Hub Page

**Status:** To-do | **Priority:** High | **Assignee:** rohit sharma | **Est:** 5h

Build the Hub page in ui-next — browse, search, preview, install.

- [ ] 3.1 Hub page route — add `/hub` page to ui-next with sidebar navigation entry
- [ ] 3.2 Catalog browser — grid/list view of available items with type/category filters and search
- [ ] 3.3 Item detail panel — preview with README content, metadata, install/remove button
- [ ] 3.4 Collections view — show bundled sets with "Install All" action
- [ ] 3.5 Installed tab — show currently installed items with version, remove action
- [ ] 3.6 Auto-sync on page load — trigger `hub.sync` if catalog is stale (>24h)

### Task 4: Phase 4 — CLI Integration

**Status:** To-do | **Priority:** Medium | **Assignee:** rohit sharma | **Est:** 2h

CLI commands for hub interaction without UI.

- [ ] 4.1 `operator1 hub list` — list available items (filter by type/category)
- [ ] 4.2 `operator1 hub install <slug>` — install an item by slug
- [ ] 4.3 `operator1 hub remove <slug>` — remove an installed item
- [ ] 4.4 `operator1 hub search <query>` — search the catalog

### Task 5: Phase 5 — Agent Persona Integration

**Status:** To-do | **Priority:** Medium | **Assignee:** rohit sharma | **Est:** 3h

Wire installed agent personas into the system prompt and subagent system.

- [ ] 5.1 Persona loader — load installed agent .md files as system prompt fragments
- [ ] 5.2 Subagent persona param — extend `sessions_spawn` to accept persona slug, inject into minimal prompt
- [ ] 5.3 SOUL.md activation — let users set an installed persona as their workspace SOUL.md
- [ ] 5.4 Active persona display — show current persona in chat header and status

---

## 7. References

- Hub inspiration: https://github.com/msitarzewski/agency-agents (MIT, persona templates)
- Existing registry pattern: `src/gateway/server-methods/clawhub.ts` (reference only, not reused)
- Key source files:
  - `src/gateway/server-methods/skills.ts` — existing skills RPCs
  - `src/infra/state-db/commands-sqlite.ts` — commands storage pattern
  - `src/infra/state-db/clawhub-sqlite.ts` — catalog caching pattern (reference)
  - `src/agents/system-prompt.ts` — persona injection point
  - `ui-next/src/pages/skills.tsx` — existing skills UI (hub page modeled after)
- Related task: `Project-tasks/agent-personas-marketplace.md` (superseded — personas now delivered via Hub)
- Dart project: _(filled after first sync)_

---

_Template version: 1.0_
