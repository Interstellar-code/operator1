# Matrix Project Context Plan

> How Operator1 and the agent team handle multiple projects seamlessly

---

## The Problem

The CEO (Rohit) works on multiple projects:

- **Operator1** — OpenClaw agent framework
- **Subzero App** — Mobile application
- **ui-next** — Dashboard frontend
- And potentially more in the future

Interactions happen in chat sessions with Operator1 (the COO agent). The challenge: how do we work across multiple projects without context mixing or repeating "this is for project X" every time — while also being able to **lock a session to a specific project** when focus is needed?

---

## Core Principles

**Agents are employees. Projects are assignments.**

Neo (CTO) can do engineering work for any project. The project is _where_ the work happens — it's context, not a separate agent. We don't need "Subzero Neo" and "Operator1 Neo." We need **one Neo** who knows which project he's on.

**Workspace = context.** Point an agent at a project folder, and they inherit everything in that project's `.openclaw/` directory automatically. No separate CONTEXT.md needed — the project's own workspace files (`SOUL.md`, `MEMORY.md`, `AGENTS.md`, `TOOLS.md`) _are_ the context.

---

## Two Session Modes

Every Operator1 session runs in one of two modes:

### Mode 1: Project-Focused Session

A session is explicitly linked to one project. Operator1 behaves as if that project is the only thing that exists in this conversation.

**Behaviour:**

- All tasks default to the linked project — no need to mention the project name
- All subagents spawned (Tier 2: Neo/Morpheus/Trinity, Tier 3: Tank/Apoc/etc.) automatically receive the project context
- Operator1 pushes back on clearly off-topic tasks: "This session is focused on Subzero. Want me to handle that in a separate session?"

**How a session gets linked:**

- The CEO triggers it via the UI (a project selector in the chat interface — to be implemented)
- Or by saying: "Focus this session on Subzero" / "Link to operator1 project"
- Operator1 acknowledges and confirms: "Got it. This session is now focused on **Subzero** (`~/dev/subzero-app`). I'll keep all work scoped to that project."

### Mode 2: Generic Session (No Project Linked)

No project is set. Operator1 operates as the cross-project command center — free to work across any project or handle non-project work (standups, strategy, etc.).

**Behaviour:**

- Operator1 detects project from message content (see Component 2 below)
- Confirms project before delegating: "I'll treat this as a Subzero task — is that right?"
- Non-project interactions (standup, strategy, general questions) handled directly

**When to use:**

- Morning standups, strategic planning, cross-project coordination
- CEO hasn't decided what to work on yet
- Task spans multiple projects

---

## Architecture

| Component               | Purpose                                                    | Location                            |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------- |
| `PROJECTS.md`           | Pure index — project ID, path, type, status, primary agent | Operator1's workspace (auto-loaded) |
| Project workspace files | Full context via existing `.openclaw/` files               | Each project's own folder           |

**No CONTEXT.md.** Each project already has (or can have) its own workspace with `SOUL.md`, `MEMORY.md`, `AGENTS.md`, `TOOLS.md`. That _is_ the context. Duplicating it into a separate CONTEXT.md creates maintenance burden for zero benefit.

---

## Project Folder Conventions

Projects can live in two places:

### Managed Projects (created via `openclaw matrix project add`)

When a project is set up through Operator1, it gets created under a standard location:

```
~/.openclaw/projects/{project-id}/
  .openclaw/
    SOUL.md       # Project-specific agent behaviour
    MEMORY.md     # Project history, decisions, blockers
    AGENTS.md     # Conventions, workflow, team assignments
    TOOLS.md      # Project-specific tools/scripts
  src/            # Project source code (or symlink)
```

**Default projects folder:** `~/.openclaw/projects/`

This keeps project workspaces organized and discoverable. The `matrix project add` command scaffolds the `.openclaw/` directory with sensible defaults.

### External Projects (existing repos)

Projects that already exist elsewhere on disk (e.g. `~/dev/subzero-app`) stay where they are. The system handles this by:

1. **PROJECTS.md points to the actual path** — no need to move anything
2. **`.openclaw/` is scaffolded on first use** — when Operator1 first spawns an agent for an external project without `.openclaw/`, it asks the CEO: "Project doesn't have a workspace yet. Create default `.openclaw/` files?" No auto-creation without confirmation.
3. **Agent workspace switching** — when spawning an agent for an external project, the task string includes the project path and the agent navigates there via shell

Both scenarios are first-class. PROJECTS.md is the single source of truth for where each project lives.

---

## Components

### 1. Project Registry

**Location:** Operator1's workspace — `~/.openclaw/workspace/PROJECTS.md`

This file lives in Operator1's workspace directory so it is automatically loaded into his system prompt on every session. No code needed — Operator1 always knows what projects exist.

**Contents per project:**

- Name and short ID (used for matching)
- Path (where the project lives on disk)
- Type (web app, mobile, API, framework, etc.)
- Status (active, paused, MVP, etc.)
- Default flag — marks the fallback project when context is ambiguous
- Primary agent — which agent handles engineering/work on this project by default

**Size guidance:** Keep each project entry to ~5-8 lines. This is a registry, not documentation. Total file should stay under 200 lines.

**Example:**

```markdown
# Active Projects

## operator1

- **Path:** ~/dev/operator1
- **Type:** Agent framework
- **Status:** Active development
- **Default:** true
- **Primary agent:** neo (engineering), morpheus (marketing)

## subzero

- **Path:** ~/dev/subzero-app
- **Type:** Mobile app (iOS + Android)
- **Status:** MVP phase
- **Primary agent:** neo (engineering)

## ui-next

- **Path:** ~/dev/operator1/ui-next
- **Type:** Web dashboard
- **Status:** Feature development
- **Primary agent:** neo (engineering)
```

---

### 2. Project Detection (Prompt-Driven, Not Code)

Operator1 detects the active project through its own reasoning — this is an LLM behaviour configured in SOUL.md/AGENTS.md, not a code module.

**Detection signals (in priority order):**

1. **Session is project-focused** — Skip detection entirely. Project is already set.
2. **Explicit mention** — "On Subzero, do X" → project = subzero
3. **Path reference** — "In ~/dev/subzero-app" → project = subzero
4. **Keyword/type match** — "The mobile app needs..." → match against project `type` field in PROJECTS.md
5. **`agents_list` routing** — Operator1 calls `agents_list` to see available agents with their `department` and `role` fields. Routes to the right specialist without hardcoding agent names.
6. **Default project** — Marked `default: true` in PROJECTS.md. Used only when signal is too weak to determine project confidently.
7. **Ask** — When still ambiguous, Operator1 asks before proceeding.

---

### 3. Context Flow (Workspace = Context)

When Operator1 spawns a subagent for a project task, context flows through two mechanisms:

**Mechanism A: Agent's own workspace (automatic)**

If the agent's `workspace` in `openclaw.json` points to the project folder, all `.openclaw/*.md` files auto-load. This is the zero-effort path for an agent's primary project.

**Mechanism B: Task string injection (for cross-project work)**

When an agent works on a project that isn't their primary workspace, Operator1 includes the project path in the task string:

```
[Project: subzero | Path: ~/dev/subzero-app]
[Task]: Add push notifications to the iOS app.

Read the project's .openclaw/AGENTS.md for conventions before starting.
When you spawn sub-agents, pass the project path forward.
```

The spawned agent reads the project's `.openclaw/` files on demand via `read`. This handles the "project is outside the agent's workspace" scenario.

**`cwd` limitation:** The `sessions_spawn` tool's `cwd` parameter only applies to ACP runtime, not the default subagent runtime. The agent's working directory is fixed by their `workspace` in `openclaw.json`. This is why the task string must explicitly state the project path — the spawned agent uses shell tools to navigate there.

---

### 4. Subagent Context Inheritance

In a project-focused session, **every spawn in the chain** must carry the project context forward.

**The chain:**

```
CEO
 └─ Operator1 (project-focused: subzero)
     └─ Neo (spawned with subzero path + task)
         └─ Tank (spawned by Neo with subzero path + sub-task)
```

Operator1's task string to Neo includes:

```
[Project: subzero | Path: ~/dev/subzero-app]
[Task]: Implement push notifications.
When you spawn sub-agents for this task, pass the project info
([Project: subzero | Path: ~/dev/subzero-app]) forward in their task strings.
```

Neo is explicitly told to propagate the context. This is a prompt instruction, not automatic.

---

### 5. Agent-to-Project Workspace Mapping (Config)

Each agent in `openclaw.json` supports `workspace`, `department`, and `role` fields:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        default: true,
        role: "COO",
        workspace: "~/.openclaw/workspace", // PROJECTS.md auto-loads from here
      },
      {
        id: "neo",
        role: "CTO",
        department: "engineering",
        workspace: "~/dev/operator1", // Neo's primary project
      },
      {
        id: "morpheus",
        role: "CMO",
        department: "marketing",
        workspace: "~/.openclaw/workspace-morpheus",
      },
    ],
  },
}
```

**Why this matters:**

- `department` and `role` are returned by `agents_list`. Operator1 routes tasks by role, not hardcoded names.
- An agent's `workspace` controls which `.openclaw/*.md` files auto-load. Point it at their primary project for zero-config context.
- For cross-project tasks, project context flows via the task string (Component 3, Mechanism B).

---

## Session Linking via UI

The UI will expose a project selector per chat session. When a project is selected:

1. The UI sends an initialization message at session start: `"[Session Init] Active project: subzero | Path: ~/dev/subzero-app"`
2. Operator1 reads this and confirms the focus
3. All subsequent messages in the session are treated as project-scoped

For the CLI path (no UI), the CEO can say "Focus this session on subzero" and Operator1 handles the same initialization flow.

**Session state is held in Operator1's working memory for the session** — it is not persisted across session restarts. If a session is restarted, the project link must be re-established.

> **Note:** Persistent session-to-project binding (surviving restarts) is part of the future project management system — out of scope for this plan.

---

## Implementation Order

| Step | What                                                                                         | How                | Effort             |
| ---- | -------------------------------------------------------------------------------------------- | ------------------ | ------------------ |
| 1    | Create `PROJECTS.md` in Operator1's workspace                                                | Markdown editing   | 30 min             |
| 2    | Update Operator1's `SOUL.md`/`AGENTS.md` with project detection + session focus instructions | Prompt engineering | 1-2 hrs            |
| 3    | Set `department`, `role`, `workspace` for each agent in `openclaw.json`                      | Config             | 30 min             |
| 4    | Scaffold `.openclaw/` in projects you'll work on soon (skip dormant ones)                    | Markdown editing   | 30 min per project |
| 5    | Test: generic session task routing                                                           | Manual testing     | 1 hr               |
| 6    | Test: project-focused session with Tier 2 + Tier 3 spawns                                    | Manual testing     | 1 hr               |
| 7    | Build UI project selector (session-level project link)                                       | UI work            | Separate task      |

---

## Benefits

1. **No duplication** — Project context lives in the project, not in a separate CONTEXT.md
2. **Session focus** — Lock a session to one project and never repeat the project name
3. **Subagent inheritance** — Project path flows down the full spawn chain via task strings
4. **No-code detection** — Project routing is LLM reasoning over PROJECTS.md
5. **Config-driven routing** — `department` and `role` on agents make routing agent-agnostic
6. **Both managed and external projects** — Projects in `~/.openclaw/projects/` or anywhere on disk
7. **Zero new infrastructure** — Everything runs on existing OpenClaw primitives

---

## What This Is Not

- This is **not** a task management system — tasks, statuses, and persistence are a separate project
- Session-to-project binding does **not** persist across session restarts (future work)
- Context is **not** automatically injected to cross-project agents — Operator1 passes the path via task strings, the agent reads `.openclaw/` files on demand

---

_Created: 2026-03-02_
_Updated: 2026-03-03_
_Author: Neo (CTO) + Operator1 (COO)_
