# Operator1 Documentation Implementation Guide

**Created:** 2026-03-06
**Author:** Neo (CTO)
**Status:** Draft
**Version:** 1.0
**Related:** `Project-tasks/matrix-agent-scripting-implementation.md`, `Project-tasks/matrix/`

---

## Executive Summary

The Matrix/Operator1 multi-agent system has evolved rapidly, resulting in scattered documentation, undocumented configurations, and testing gaps. This guide establishes a comprehensive documentation strategy to serve as the single source of truth for both humans and agents.

**Key Goals:**

1. Centralize all Matrix system documentation
2. Align implementations with architectural design
3. Enable testing by documenting actual setups
4. Provide reference material for both humans and agents
5. Support UI integration for dashboard access

---

## 1. Purpose of Operator1 Docs

### 1.1 Why Documentation Matters Now

The Matrix system has grown organically:

| Component       | Current State                                                   | Risk Level |
| --------------- | --------------------------------------------------------------- | ---------- |
| Agent hierarchy | 34 agents defined, roles spread across multiple files           | Medium     |
| Configuration   | `openclaw.json` has 600+ lines, includes scattered across files | High       |
| RPC layer       | Methods exist but aren't catalogued                             | Medium     |
| Scripts         | 100+ scripts, many undocumented                                 | High       |
| Memory system   | QMD + daily notes + MEMORY.md, no integration docs              | Medium     |

### 1.2 Documentation Goals

**For Humans:**

- Onboard new developers quickly
- Understand the architecture without reading code
- Debug issues by tracing configuration paths
- Maintain and extend the system confidently

**For Agents:**

- Self-serve context about the system
- Understand boundaries and capabilities
- Access templates and examples
- Know what scripts/RPCs are available

**For Testing:**

- Verify configurations match design
- Validate agent delegation chains
- Test gateway patterns (collocated vs independent)
- Ensure memory systems work correctly

### 1.3 Current Documentation Inventory

| Location                                                 | Contents                  | Status                    |
| -------------------------------------------------------- | ------------------------- | ------------------------- |
| `~/dev/operator1/docs/`                                  | OpenClaw core docs        | Complete                  |
| `~/dev/operator1/Project-tasks/`                         | Implementation guides     | Scattered                 |
| `~/.openclaw/workspace/SOUL.md`                          | Operator1 persona         | Complete                  |
| `~/.openclaw/workspace/AGENTS.md`                        | Operator1 workspace rules | Complete                  |
| `~/.openclaw/workspace/MEMORY.md`                        | Long-term memory          | Complete                  |
| `~/.openclaw/openclaw.json`                              | Active configuration      | Complete but undocumented |
| `Project-tasks/matrix/`                                  | Matrix templates          | Partial                   |
| `Project-tasks/matrix-agent-scripting-implementation.md` | Scripting guide           | Complete                  |

---

## 2. What Needs to be Documented

### 2.1 Architecture

#### 2.1.1 Matrix Multi-Agent Architecture Overview

**Current Implementation:**

```
CEO (User - Human)
   │
   └── Operator1 (COO - main agent)
          │
          ├── Neo (CTO - Engineering)
          │      ├── Tank (Backend Engineer)
          │      ├── Dozer (DevOps Engineer)
          │      ├── Mouse (QA + Research)
          │      ├── Spark (Frontend Engineer)
          │      ├── Cipher (Security Engineer)
          │      ├── Relay (Integration Engineer)
          │      ├── Ghost (Data Engineer)
          │      ├── Binary (Mobile Engineer)
          │      ├── Kernel (Systems Engineer)
          │      └── Prism (AI/ML Engineer)
          │
          ├── Morpheus (CMO - Marketing)
          │      ├── Niobe (Content Strategist)
          │      ├── Switch (Creative Director)
          │      ├── Rex (PR & Communications)
          │      ├── Ink (Copywriter)
          │      ├── Vibe (Social Media Manager)
          │      ├── Lens (Video Producer)
          │      ├── Echo (Email Marketing)
          │      ├── Nova (SEO Specialist)
          │      ├── Pulse (Community Manager)
          │      └── Blaze (Brand Strategist)
          │
          └── Trinity (CFO - Finance)
                 ├── Oracle (Data Analyst)
                 ├── Seraph (Security & Compliance)
                 ├── Zee (Financial Analyst)
                 ├── Ledger (Bookkeeper)
                 ├── Vault (Investment Analyst)
                 ├── Shield (Insurance & Risk)
                 ├── Trace (Expense Tracker)
                 ├── Quota (Budget Manager)
                 ├── Merit (Procurement)
                 └── Beacon (Tax Specialist)
```

**Key Concepts to Document:**

- Delegation depth limits (`maxSpawnDepth: 4`)
- Shared talent pool (Tier 3 workers available to all department heads)
- Cross-department protocol (when to escalate)
- Session isolation and context passing

#### 2.1.2 Agent Hierarchy Rules

| Rule                 | Description                         | Example                                             |
| -------------------- | ----------------------------------- | --------------------------------------------------- |
| Tier 1 → Tier 2 only | Operator1 delegates to C-suite only | Operator1 → Neo                                     |
| Tier 2 → Tier 3      | C-suite delegates to workers        | Neo → Tank                                          |
| Tier 3 → ACP         | Workers spawn Claude Code via ACP   | Tank → claude (ACP)                                 |
| Cross-department     | Route through Operator1             | Finance task from Engineering → Operator1 → Trinity |

#### 2.1.3 Gateway Patterns

**Pattern 1: Collocated (Current Production)**

```
Single Gateway (port 18789)
   └── All agents share same gateway process
       ├── Operator1 (main)
       ├── Neo
       ├── Morpheus
       ├── Trinity
       └── All workers
```

**Pattern 2: Independent Gateways (Future)**

```
Gateway A (port 18789) - Operator1 + shared services
Gateway B (port 19789) - Neo + Engineering workers
Gateway C (port 20789) - Morpheus + Marketing workers
Gateway D (port 21789) - Trinity + Finance workers
```

**Documentation Needs:**

- When to use which pattern
- Configuration differences
- Cross-gateway communication
- Resource implications

### 2.2 Configuration

#### 2.2.1 JSON Config Files

**Primary Config: `~/.openclaw/openclaw.json`**

Structure overview:

```json
{
  "meta": { "lastTouchedVersion", "lastTouchedAt" },
  "env": { "PATH", "API_KEYS", "WHISPER_MODEL" },
  "wizard": { "lastRunAt", "lastRunVersion", "lastRunCommand", "lastRunMode" },
  "auth": { "profiles": { "provider:mode": { ... } } },
  "acp": { "enabled", "dispatch", "backend", "defaultAgent", "allowedAgents", "maxConcurrentSessions", "stream", "runtime" },
  "models": { "mode", "providers": { ... } },
  "agents": {
    "defaults": { "model", "workspace", "maxConcurrent", "subagents", "timeoutSeconds" },
    "list": [ { "id", "name", "department", "role", "workspace", "agentDir", "identity", "subagents" } ]
  },
  "tools": { "media": { "audio": { "enabled", "models" } } },
  "messages": { "ackReactionScope" },
  "commands": { "native", "nativeSkills", "restart", "ownerDisplay" },
  "hooks": { "internal": { "enabled", "entries": { ... } } },
  "channels": { "telegram": { ... }, "bluebubbles": { ... } },
  "gateway": { "port", "mode", "bind", "auth", "tailscale", "tls", "nodes" },
  "memory": { "backend", "citations", "qmd": { ... } },
  "skills": { "install": { "nodeManager" } },
  "plugins": { "entries": { ... }, "installs": { ... } }
}
```

**Include Directive:**

```json
{
  "$include": ["./matrix-agents.json"],
  ...rest of config
}
```

**Matrix Agents Config: `~/.openclaw/matrix-agents.json`**

- Contains the full agent hierarchy
- Uses template from `Project-tasks/matrix/matrix-agents.template.json`

#### 2.2.2 Agent-Specific Configs

Each agent has:
| File | Location | Purpose |
|------|----------|---------|
| `SOUL.md` | `{workspace}/` | Persona, values, decision framework |
| `AGENTS.md` | `{workspace}/` | Workspace rules, memory structure, delegation |
| `IDENTITY.md` | `{workspace}/` | Name, role, emoji, department |
| `MEMORY.md` | `{workspace}/` | Long-term memory (curated) |
| `TOOLS.md` | `{workspace}/` | Tool-specific notes, credentials references |
| `HEARTBEAT.md` | `{workspace}/` | Periodic task checklist |
| `USER.md` | `{workspace}/` | Human preferences and context |

**Template Locations:**

- `~/dev/operator1/docs/reference/templates/` - Generic templates
- `~/dev/operator1/Project-tasks/matrix/` - Matrix-specific templates (planned)

#### 2.2.3 Memory System

**Three-Layer Memory:**

| Layer       | Files                  | Purpose           | Update Frequency      |
| ----------- | ---------------------- | ----------------- | --------------------- |
| Daily Notes | `memory/YYYY-MM-DD.md` | Raw session logs  | Every session         |
| Long-Term   | `MEMORY.md`            | Curated wisdom    | Periodic distillation |
| Semantic    | QMD index              | Vector searchable | Auto-updated          |

**QMD Configuration:**

```json
{
  "memory": {
    "backend": "qmd",
    "citations": "on",
    "qmd": {
      "command": "/Users/rohits/.bun/bin/qmd",
      "searchMode": "query",
      "update": { "commandTimeoutMs": 60000 },
      "limits": { "timeoutMs": 30000 }
    }
  }
}
```

**Critical PATH Issue:**

- Gateway doesn't inherit `~/.zshrc`
- Must add to `~/.openclaw/.env`:
  ```
  PATH=/Users/rohits/.bun/bin:${PATH}
  ```

#### 2.2.4 Scripts

**Existing Scripts (100+ in `~/dev/operator1/scripts/`):**

Categories:
| Category | Examples | Documentation Status |
|----------|----------|---------------------|
| Build/Package | `package-mac-app.sh`, `bundle-a2ui.sh` | Partial |
| CI/CD | `ci-changed-scope.mjs`, `release-check.ts` | Partial |
| Testing | `test-*.sh`, `test-*.ts` | Scattered |
| Dev Tools | `clawlog.sh`, `install.sh` | Good |
| Matrix-specific | None yet (planned) | Missing |

**Planned Matrix Scripts (from scripting implementation guide):**

| Script                      | Purpose                           | Tier |
| --------------------------- | --------------------------------- | ---- |
| `project-setup.ts`          | Initialize new project            | 1    |
| `agent-bootstrap.ts`        | Bootstrap new agent workspace     | 1    |
| `init-memory.ts`            | Create memory files from template | 1    |
| `register-project.ts`       | Add project to PROJECTS.md        | 1    |
| `gen-gateway-config.ts`     | Generate gateway JSON             | 2    |
| `gen-collocated-config.ts`  | Collocated setup config           | 2    |
| `gen-independent-config.ts` | Independent gateway config        | 2    |
| `gen-spawn-template.ts`     | Generate spawn context            | 2    |
| `consolidate-memory.ts`     | Distill daily → long-term         | 3    |
| `cleanup-sessions.ts`       | Session registry cleanup          | 3    |
| `agent-health.ts`           | Agent workspace health check      | 3    |

### 2.3 RPC Layer

#### 2.3.1 Available RPCs

**Gateway RPCs (WebSocket JSON-RPC):**

| Category     | Methods                                                         | Status        |
| ------------ | --------------------------------------------------------------- | ------------- |
| **Config**   | `config.get`, `config.patch`                                    | Documented    |
| **Models**   | `models.list`                                                   | Documented    |
| **Agents**   | `agents.files.list`, `agents.files.get`, `agents.files.set`     | Documented    |
| **Sessions** | `sessions.list`, `sessions.spawn`, `sessions.history`           | Documented    |
| **Memory**   | `memory.status`, `memory.search`, `memory.reindex`              | New (ui-next) |
| **Health**   | `health`                                                        | Documented    |
| **Wizard**   | `wizard.start`, `wizard.next`, `wizard.cancel`, `wizard.status` | Documented    |
| **Update**   | `update.run`                                                    | Documented    |

**Custom Matrix RPCs (Planned):**
| Method | Purpose | Priority |
|--------|---------|----------|
| `projects.add` | Register new project | High |
| `projects.scaffold` | Create project structure | High |
| `projects.list` | List all projects | Medium |
| `agents.spawn` | Structured agent spawning | Medium |
| `memory.sync` | Force memory consolidation | Low |
| `health.matrix` | Matrix-specific health check | Low |

#### 2.3.2 How to Add New RPCs

**Process:**

1. Define method in `src/gateway/server-methods/`
2. Add TypeScript interface for params/response
3. Register in gateway method map
4. Document in `docs/gateway/rpc.md`
5. Add to ui-next feature if UI needed

**Example (memory.status):**

```typescript
// src/gateway/server-methods/memory-dashboard.ts
export async function memoryStatus(
  deps: MethodDeps,
  params: { agentId?: string },
): Promise<MemoryProviderStatus> {
  const agentId = params.agentId || deps.config.agents.defaults?.defaultAgent || "main";
  const manager = deps.memoryManagers.get(agentId);
  if (!manager) throw new Error(`No memory manager for ${agentId}`);
  return manager.getStatus();
}
```

#### 2.3.3 RPC vs Script Boundaries

| Use RPC When                | Use Script When          |
| --------------------------- | ------------------------ |
| Real-time response needed   | Batch/async processing   |
| UI integration required     | File system operations   |
| Gateway state access needed | External tool invocation |
| Low latency critical        | Long-running operations  |
| Multi-agent coordination    | Local validation only    |

### 2.4 Init & Deployment

#### 2.4.1 Initializing Operator1 on a New Machine

**Prerequisites:**

- Node.js 22+ or Bun
- Git
- (Optional) 1Password CLI for credentials

**Steps:**

1. Clone OpenClaw repo:

   ```bash
   git clone https://github.com/openclaw/openclaw.git ~/dev/operator1
   cd ~/dev/operator1
   pnpm install
   ```

2. Run onboarding wizard:

   ```bash
   pnpm openclaw onboard
   ```

3. Configure Matrix agents:

   ```bash
   cp Project-tasks/matrix/matrix-agents.template.json ~/.openclaw/matrix-agents.json
   # Edit paths to match your home directory
   ```

4. Add include directive to config:

   ```bash
   # Add to ~/.openclaw/openclaw.json:
   # { "$include": ["./matrix-agents.json"], ... }
   ```

5. Bootstrap agent workspaces:

   ```bash
   # Create workspace directories
   mkdir -p ~/.openclaw/workspace-{neo,morpheus,trinity,tank,dozer,mouse,...}

   # Copy templates (when available)
   cp -r docs/reference/templates/matrix/neo/* ~/.openclaw/workspace-neo/
   cp -r docs/reference/templates/matrix/morpheus/* ~/.openclaw/workspace-morpheus/
   cp -r docs/reference/templates/matrix/trinity/* ~/.openclaw/workspace-trinity/
   ```

6. Configure QMD (if using local embeddings):

   ```bash
   bun add -g qmd
   # Add to ~/.openclaw/.env:
   # PATH=/path/to/bun/bin:${PATH}
   ```

7. Start gateway:
   ```bash
   pnpm openclaw gateway start
   ```

#### 2.4.2 Deploying Matrix Agents

**Collocated Deployment:**

- All agents in single `openclaw.json`
- Single gateway process
- Simpler management, shared resources

**Independent Deployment:**

1. Create separate config per gateway
2. Each gateway on different port
3. Configure cross-gateway RPC (future)
4. Isolated resources, better scaling

#### 2.4.3 Environment Setup Requirements

| Requirement        | Location                                    | Notes                   |
| ------------------ | ------------------------------------------- | ----------------------- |
| Node.js 22+        | System                                      | Required                |
| Bun (optional)     | System                                      | For QMD, faster scripts |
| QMD models         | `~/.cache/qmd/models/`                      | ~2.2GB for full setup   |
| API keys           | `~/.openclaw/openclaw.json` → auth.profiles | Or via wizard           |
| Telegram bot token | `channels.telegram.botToken`                | Required for Telegram   |
| Gateway auth token | `gateway.auth.token`                        | Auto-generated          |

### 2.5 Integration Points

#### 2.5.1 OpenClaw Gateway Integration

**Gateway Architecture:**

```
┌─────────────────────────────────────────┐
│            Gateway (port 18789)          │
├─────────────────────────────────────────┤
│  WebSocket Server (JSON-RPC)            │
│  ├── Config management                   │
│  ├── Agent spawning                      │
│  ├── Memory operations                   │
│  └── Health monitoring                   │
├─────────────────────────────────────────┤
│  Channel Plugins                        │
│  ├── Telegram                            │
│  ├── BlueBubbles (iMessage)             │
│  └── ...                                 │
├─────────────────────────────────────────┤
│  ACP Backend (acpx)                     │
│  └── Claude Code / Codex / Pi / etc.    │
└─────────────────────────────────────────┘
```

**Agent Process Isolation:**

- Each agent runs in isolated session
- Memory is workspace-scoped
- Delegation via `sessions_spawn`

#### 2.5.2 Channel Integrations

**Telegram (Primary):**

```json
{
  "channels": {
    "telegram": {
      "enabled": true,
      "dmPolicy": "pairing",
      "botToken": "...",
      "groupPolicy": "allowlist",
      "streaming": "partial",
      "groups": {
        "-1003506452238": {
          "enabled": true,
          "groupPolicy": "open",
          "requireMention": false
        }
      }
    }
  }
}
```

**BlueBubbles (iMessage - Disabled):**

```json
{
  "channels": {
    "bluebubbles": {
      "enabled": false,
      "serverUrl": "http://192.168.1.19:1234",
      "password": "...",
      "webhookPath": "/bluebubbles-webhook"
    }
  }
}
```

#### 2.5.3 Sub-Agent Spawning

**Spawning Flow:**

```
Operator1 receives task
   │
   ├── Classifies: Engineering → Neo
   │
   ├── Spawns Neo via sessions_spawn:
   │   {
   │     agentId: "neo",
   │     task: "[Project: subzero | Path: ~/dev/subzero-app]\n[Task]: Add rate limiting",
   │     label: "neo-subzero-ratelimit-1709712060000",
   │     runTimeoutSeconds: 1800
   │   }
   │
   └── Neo receives context:
       ├── Reads workspace/SOUL.md
       ├── Reads workspace/AGENTS.md
       ├── Classifies task (Medium)
       ├── Creates requirements brief
       └── Spawns Tank with ACP...
```

**Context Passing Pattern:**

```
[Project: {project-id} | Path: {project-path}]
[Tagged for this session]
[Task]: {actual task description}

Read the project's .openclaw/AGENTS.md for conventions before starting.
When you spawn sub-agents, pass the project info forward.
For ACP sessions, use cwd: {project-path}.
```

---

## 3. Documentation Structure Proposal

### 3.1 Where Docs Live

**Recommended Structure:**

```
~/dev/operator1/
├── docs/                          # Existing OpenClaw docs (Mintlify)
│   ├── reference/
│   │   └── templates/
│   │       └── matrix/            # Agent templates
│   └── ...
│
├── Project-tasks/
│   ├── operator1-docs-implementation.md  # This guide
│   ├── matrix-agent-scripting-implementation.md
│   ├── matrix/                    # Matrix-specific docs
│   │   ├── README.md
│   │   └── matrix-agents.template.json
│   └── Done/                      # Completed tasks
│
├── docs-matrix/                   # NEW: Matrix documentation hub
│   ├── README.md                  # Index and navigation
│   ├── architecture/
│   │   ├── overview.md            # System architecture
│   │   ├── agent-hierarchy.md     # Agent tree and rules
│   │   ├── delegation.md          # Delegation protocols
│   │   └── gateway-patterns.md    # Collocated vs independent
│   ├── configuration/
│   │   ├── openclaw-json.md       # Config file reference
│   │   ├── agent-configs.md       # Agent workspace files
│   │   ├── memory-system.md       # Memory architecture
│   │   └── scripts/               # Script documentation
│   ├── rpc/
│   │   ├── overview.md            # RPC architecture
│   │   ├── methods.md             # Method reference
│   │   └── adding-rpcs.md         # How to add new RPCs
│   ├── deployment/
│   │   ├── initialization.md      # New machine setup
│   │   ├── collocated.md          # Single gateway setup
│   │   └── independent.md         # Multi-gateway setup
│   ├── integrations/
│   │   ├── gateway.md             # Gateway integration
│   │   ├── channels.md            # Channel integrations
│   │   └── subagents.md           # Sub-agent spawning
│   └── ui/
│       ├── dashboard.md           # UI integration guide
│       └── search.md              # Docs search in UI
```

### 3.2 Organization Principles

**By Audience:**
| Section | Primary Audience | Secondary Audience |
|---------|------------------|-------------------|
| Architecture | Developers, Agents | Users |
| Configuration | Developers | Agents |
| RPC | Developers | UI Engineers |
| Deployment | DevOps | Developers |
| Integrations | Developers | Agents |
| UI | UI Engineers | Users |

**By Update Frequency:**
| Frequency | Content | Owner |
|-----------|---------|-------|
| High (weekly) | Project status, active agents | Operator1 |
| Medium (monthly) | Configuration changes, new RPCs | Neo |
| Low (quarterly) | Architecture decisions, patterns | Human + Neo |

### 3.3 Version Control Approach

**Git-Based:**

- All docs in `~/dev/operator1/docs-matrix/`
- Tracked in main repo
- PRs required for changes
- CHANGELOG entries for significant updates

**Agent-Editable:**

- Memory files (`MEMORY.md`, daily notes) - agents can edit freely
- Configuration reference - agents can suggest updates via PR
- Architecture docs - require human review

**Living Docs vs. Static:**
| Type | Format | Update Mechanism |
|------|--------|------------------|
| Reference | Markdown | Git PR |
| Status | JSON/Markdown | Auto-generated |
| Memory | Markdown | Agent-edited |
| Config | JSON | Config system |

---

## 4. UI Integration Considerations

### 4.1 UI Next Docs Access

**Current UI Next Features (from proposals):**

- Memory Dashboard (implemented)
- Agent management (planned)
- Config editor (planned)
- Plugin toggles (planned)

**Docs Integration Options:**

**Option A: Embedded Docs Tab**

```
Dashboard
├── Agents
├── Memory
├── Config
├── Plugins
└── Docs  ← NEW
    ├── Architecture
    ├── Configuration
    ├── RPC Reference
    └── Search
```

**Option B: Contextual Help**

- Help icons next to config fields
- Links to relevant docs in error messages
- Agent persona docs in agent cards

**Option C: Dedicated Docs Site**

- Separate docs.openclaw.ai/matrix
- Linked from UI Next
- Search via Algolia/Mintlify

**Recommendation:** Start with Option B (contextual), add Option A (tab) later.

### 4.2 Exposing Docs in Dashboard

**Docs API Endpoint (New RPC):**

```typescript
// RPC: docs.list
interface DocsListParams {
  category?: "architecture" | "configuration" | "rpc" | "deployment" | "integrations";
  search?: string;
}

interface DocsListResponse {
  docs: {
    id: string;
    title: string;
    category: string;
    path: string;
    lastModified: string;
  }[];
}

// RPC: docs.get
interface DocsGetParams {
  id: string; // or path
}

interface DocsGetResponse {
  content: string; // Markdown
  metadata: {
    title: string;
    category: string;
    lastModified: string;
  };
}
```

**UI Components:**

- `DocsSidebar` - Category navigation
- `DocsContent` - Markdown renderer
- `DocsSearch` - Full-text search
- `DocsBreadcrumb` - Navigation path

### 4.3 Search/Navigation Requirements

**Search Features:**

1. **Full-text search** across all docs
2. **Category filters** (architecture, config, rpc, etc.)
3. **Recent docs** quick access
4. **Agent context** - show docs relevant to current agent
5. **Cross-reference links** - link related docs

**Navigation:**

1. **Tree view** by category
2. **Breadcrumb** for current location
3. **Prev/Next** within category
4. **Related docs** sidebar

**Agent Access:**

- Agents can query docs via RPC
- Search returns structured results
- Context-aware ranking (agent role → relevant docs)

---

## 5. Maintenance Strategy

### 5.1 Keeping Docs Updated

**Automated Updates:**
| Trigger | Action | Owner |
|---------|--------|-------|
| Config change | Update config reference | System |
| New agent added | Update agent hierarchy | Neo |
| New RPC added | Update RPC reference | Developer |
| Script added | Create script doc | Developer |

**Review Triggers:**
| Trigger | Review Type | Frequency |
|---------|-------------|-----------|
| Weekly heartbeat | Memory consolidation | Weekly |
| Sprint end | Architecture review | Bi-weekly |
| Major release | Full docs audit | Quarterly |
| New team member | Onboarding docs check | As needed |

### 5.2 Documentation Ownership

| Category       | Primary Owner      | Reviewer  |
| -------------- | ------------------ | --------- |
| Architecture   | Neo (CTO)          | Human     |
| Configuration  | Neo (CTO)          | Operator1 |
| RPC Reference  | Developers         | Neo       |
| Deployment     | Dozer (DevOps)     | Neo       |
| Agent Personas | Respective C-suite | Human     |
| Memory Files   | Each agent         | Operator1 |

**Agent Responsibilities:**

- **Operator1:** Maintain PROJECTS.md, session registry
- **Neo:** Maintain technical docs, architecture decisions
- **Morpheus:** Maintain marketing-related docs
- **Trinity:** Maintain finance-related docs

### 5.3 Review Cadence

| Cadence   | Scope                                  | Participants        |
| --------- | -------------------------------------- | ------------------- |
| Daily     | Daily notes                            | Each agent (self)   |
| Weekly    | Memory consolidation, heartbeat checks | Operator1           |
| Bi-weekly | Active projects, tech debt             | Neo + Human         |
| Monthly   | Configuration audit, script inventory  | Neo + Dozer         |
| Quarterly | Architecture review, docs audit        | All C-suite + Human |

**Review Checklist:**

- [ ] Are new features documented?
- [ ] Are deprecated features marked?
- [ ] Are config examples current?
- [ ] Are RPC signatures accurate?
- [ ] Are agent personas consistent?

---

## 6. Implementation Phases

### Phase 1: Core Architecture Docs (Week 1-2)

**Deliverables:**

- [ ] `docs-matrix/README.md` - Index and navigation
- [ ] `docs-matrix/architecture/overview.md` - System architecture
- [ ] `docs-matrix/architecture/agent-hierarchy.md` - Agent tree
- [ ] `docs-matrix/architecture/delegation.md` - Delegation protocols
- [ ] `docs-matrix/architecture/gateway-patterns.md` - Gateway setups

**Acceptance Criteria:**

- New developer can understand the system from architecture docs
- Agents can reference architecture docs for context
- Diagrams are clear and accurate

### Phase 2: Configuration Reference (Week 3-4)

**Deliverables:**

- [ ] `docs-matrix/configuration/openclaw-json.md` - Config reference
- [ ] `docs-matrix/configuration/agent-configs.md` - Workspace files
- [ ] `docs-matrix/configuration/memory-system.md` - Memory architecture
- [ ] `docs-matrix/configuration/scripts/README.md` - Script index
- [ ] `docs-matrix/configuration/scripts/project-setup.md` - Script docs

**Acceptance Criteria:**

- All config keys documented with examples
- All workspace files documented
- Memory system fully explained
- Top 10 scripts documented

### Phase 3: RPC Documentation (Week 5-6)

**Deliverables:**

- [ ] `docs-matrix/rpc/overview.md` - RPC architecture
- [ ] `docs-matrix/rpc/methods.md` - Method reference (all existing)
- [ ] `docs-matrix/rpc/adding-rpcs.md` - How to add new RPCs
- [ ] JSON schema for RPC params/responses

**Acceptance Criteria:**

- All existing RPCs documented
- Clear examples for each method
- Developer can add new RPC following guide

### Phase 4: Deployment Guides (Week 7-8)

**Deliverables:**

- [ ] `docs-matrix/deployment/initialization.md` - New machine setup
- [ ] `docs-matrix/deployment/collocated.md` - Single gateway
- [ ] `docs-matrix/deployment/independent.md` - Multi-gateway
- [ ] Troubleshooting guide

**Acceptance Criteria:**

- New machine can be set up following guide
- Both gateway patterns documented
- Common issues have solutions

### Phase 5: UI Integration (Week 9-12)

**Deliverables:**

- [ ] `docs.list` RPC endpoint
- [ ] `docs.get` RPC endpoint
- [ ] UI Next docs tab
- [ ] Contextual help integration
- [ ] Search functionality

**Acceptance Criteria:**

- Docs accessible from UI Next
- Search returns relevant results
- Contextual help shows relevant docs
- Agent can query docs via RPC

---

## 7. Success Metrics

| Metric           | Target    | Measurement                 |
| ---------------- | --------- | --------------------------- |
| Onboarding time  | < 2 hours | New developer to first task |
| Doc coverage     | > 90%     | All features documented     |
| Search relevance | > 80%     | Users find what they need   |
| Agent self-serve | > 50%     | Agents find answers in docs |
| Update latency   | < 1 week  | New features documented     |
| Stale doc rate   | < 5%      | Docs older than 3 months    |

---

## 8. Open Questions

1. **Wiki vs. Repo Docs:** Should we use a wiki for collaborative editing?
   - Recommendation: Keep in repo for version control, PR review

2. **Auto-generated Docs:** How much can be generated from code?
   - Recommendation: RPC schemas, config schemas - yes. Architecture - no.

3. **Agent Write Access:** Should agents edit docs directly?
   - Recommendation: Memory files - yes. Reference docs - via PR only.

4. **Multi-language:** Do we need translations?
   - Recommendation: English primary. Add translations if needed.

5. **External Access:** Should docs be public?
   - Recommendation: Architecture docs - public. Configuration details - private.

---

## 9. Appendix

### A. File Templates

**Architecture Doc Template:**

```markdown
# [Component Name]

## Overview

Brief description of the component.

## Architecture

Diagram and explanation.

## Key Concepts

- Concept 1: explanation
- Concept 2: explanation

## Configuration

How to configure this component.

## Usage Examples

Common use cases.

## Troubleshooting

Common issues and solutions.

## Related Docs

- Link to related docs
```

**Script Doc Template:**

```markdown
# [script-name.ts]

## Purpose

What this script does.

## Usage

\`\`\`bash
npx tsx scripts/matrix/[script-name].ts [options]
\`\`\`

## Options

| Flag     | Type   | Default | Description |
| -------- | ------ | ------- | ----------- |
| --option | string | -       | Description |

## Examples

\`\`\`bash

# Example 1

npx tsx scripts/matrix/[script-name].ts --name "my-project"

# Example 2

npx tsx scripts/matrix/[script-name].ts --dry-run --json
\`\`\`

## Output

JSON structure on success/error.

## Related

- Related scripts
- Related docs
```

### B. Existing Reference Files

| File              | Location                                                 | Contents              |
| ----------------- | -------------------------------------------------------- | --------------------- |
| Matrix README     | `Project-tasks/matrix/README.md`                         | Matrix setup guide    |
| Matrix Template   | `Project-tasks/matrix/matrix-agents.template.json`       | Agent config template |
| Scripting Guide   | `Project-tasks/matrix-agent-scripting-implementation.md` | Script architecture   |
| Operator1 SOUL    | `~/.openclaw/workspace/SOUL.md`                          | Operator1 persona     |
| Operator1 AGENTS  | `~/.openclaw/workspace/AGENTS.md`                        | Workspace rules       |
| Operator1 MEMORY  | `~/.openclaw/workspace/MEMORY.md`                        | Long-term memory      |
| OpenClaw Config   | `~/.openclaw/openclaw.json`                              | Active configuration  |
| UI Next Proposals | `Project-tasks/ui-next-feature-proposals.md`             | UI feature specs      |

### C. Agent Workspace Inventory

| Agent     | Workspace                         | Status          |
| --------- | --------------------------------- | --------------- |
| Operator1 | `~/.openclaw/workspace/`          | Complete        |
| Neo       | `~/.openclaw/workspace-neo/`      | Complete        |
| Morpheus  | `~/.openclaw/workspace-morpheus/` | Complete        |
| Trinity   | `~/.openclaw/workspace-trinity/`  | Complete        |
| Tank      | `~/.openclaw/workspace-tank/`     | Created         |
| Dozer     | `~/.openclaw/workspace-dozer/`    | Created         |
| Mouse     | `~/.openclaw/workspace-mouse/`    | Created         |
| Niobe     | `~/.openclaw/workspace-niobe/`    | Created         |
| Switch    | `~/.openclaw/workspace-switch/`   | Created         |
| Rex       | `~/.openclaw/workspace-rex/`      | Created         |
| Oracle    | `~/.openclaw/workspace-oracle/`   | Created         |
| Seraph    | `~/.openclaw/workspace-seraph/`   | Created         |
| Zee       | `~/.openclaw/workspace-zee/`      | Created         |
| Ledger    | `~/.openclaw/workspace-ledger/`   | Created         |
| Quota     | `~/.openclaw/workspace-quota/`    | Created         |
| Ink       | `~/.openclaw/workspace-ink/`      | Created         |
| Vibe      | `~/.openclaw/workspace-vibe/`     | Created         |
| Others    | -                                 | Agent dirs only |

---

## Changelog

| Date       | Version | Changes          |
| ---------- | ------- | ---------------- |
| 2026-03-06 | 1.0     | Initial creation |

---

_End of Implementation Guide_
