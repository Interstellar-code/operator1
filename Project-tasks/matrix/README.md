# Matrix Multi-Agent Config

A 3-tier agent hierarchy for OpenClaw, themed after The Matrix.

## Hierarchy

```
Operator1 (Tier 1 - Orchestrator)
  Neo       (Tier 2 - Department Head, zai/glm-5)
  Morpheus  (Tier 2 - Department Head, zai/glm-5)
  Trinity   (Tier 2 - Department Head, zai/glm-5)
    Tank      (Tier 3 - Worker, zai/glm-4.7)
    Dozer     (Tier 3 - Worker, zai/glm-4.7)
    Mouse     (Tier 3 - Worker, zai/glm-4.7)
    Niobe     (Tier 3 - Worker, zai/glm-4.7)
    Switch    (Tier 3 - Worker, zai/glm-4.7)
    Rex       (Tier 3 - Worker, zai/glm-4.7)
    Oracle    (Tier 3 - Worker, zai/glm-4.7)
    Seraph    (Tier 3 - Worker, zai/glm-4.7)
    Zee       (Tier 3 - Worker, zai/glm-4.7)
```

Tier 3 agents are a **shared talent pool** — all three department heads can spawn any tier-3 worker.

## Setup

1. Copy `matrix-agents.template.json` to `~/.openclaw/matrix-agents.json`
2. Update `workspace` and `agentDir` paths to use your home directory (replace `~` with your absolute home path)
3. Add the include directive to your `~/.openclaw/openclaw.json`:

```json
{
  "$include": ["./matrix-agents.json"],
  ...rest of your config
}
```

4. Copy role-specific templates to each department head's workspace:

```bash
# Neo (CTO)
cp docs/reference/templates/matrix/neo/* ~/.openclaw/workspace-neo/

# Morpheus (CMO)
cp docs/reference/templates/matrix/morpheus/* ~/.openclaw/workspace-morpheus/

# Trinity (CFO)
cp docs/reference/templates/matrix/trinity/* ~/.openclaw/workspace-trinity/
```

5. Restart the gateway

## Agent Persona Templates

Role-specific workspace templates live in `docs/reference/templates/matrix/`:

```
docs/reference/templates/matrix/
├── neo/           # CTO — engineering, architecture, code quality
│   ├── SOUL.md    # Quiet precision, "there is no spoon"
│   ├── IDENTITY.md
│   ├── AGENTS.md  # Delegation: Tank, Dozer, Mouse
│   ├── HEARTBEAT.md
│   ├── BOOTSTRAP.md
│   ├── TOOLS.md
│   └── USER.md
├── morpheus/      # CMO — content, brand, marketing
│   ├── SOUL.md    # Conviction-driven, storytelling
│   ├── IDENTITY.md
│   ├── AGENTS.md  # Delegation: Niobe, Switch, Rex
│   ├── HEARTBEAT.md
│   ├── BOOTSTRAP.md
│   ├── TOOLS.md
│   └── USER.md
└── trinity/       # CFO — finance, budgets, cost optimization
    ├── SOUL.md    # Numbers-first, no wasted motion
    ├── IDENTITY.md
    ├── AGENTS.md  # Delegation: Oracle, Seraph, Zee
    ├── HEARTBEAT.md
    ├── BOOTSTRAP.md
    ├── TOOLS.md
    └── USER.md
```

Each template set includes all 7 workspace files with role-specific:

- **SOUL.md** — Personality, values, decision framework, delegation table, boundaries
- **AGENTS.md** — Memory structure, delegation trees, cross-department protocol, safety rules
- **HEARTBEAT.md** — Domain-specific periodic checks
- **BOOTSTRAP.md** — First-run onboarding tailored to the role

Worker agents (Tank, Dozer, Mouse, etc.) use the generic templates from `docs/reference/templates/` until role-specific templates are added.

## How it works

- `$include` deep-merges the agents file into the main config
- `subagents.allowAgents` defines which agents a parent can spawn via `sessions_spawn`
- `maxSpawnDepth: 3` allows Operator1 -> Department Head -> Worker delegation chains
- Each tier-2 and tier-3 agent has its own workspace and agent directory for isolated SOUL.md/IDENTITY.md persona files

See also: `Project-tasks/matrix-multi-agent-implementation.md`
