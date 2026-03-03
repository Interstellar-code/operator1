# Matrix Tier 3 Sub-Agents

**Purpose:** Define specialized sub-agents for each department head (Neo, Morpheus, Trinity) to handle specific execution tasks.

**Goal:** 10 sub-agents per department = 30 specialized workers for flexible, adaptable assistance.

**Related docs:**

- `Project-tasks/matrix-multi-agent-implementation.md` — main implementation guide (phases 0–8)
- `docs/reference/templates/matrix/matrix-agents.template.json` — canonical agent config template
- `docs/reference/templates/matrix/{neo,morpheus,trinity}/` — department head workspace templates

---

## Current State

| Agent  | Department  | Current State                                                | Status                         |
| ------ | ----------- | ------------------------------------------------------------ | ------------------------------ |
| Tank   | Engineering | Basic SOUL.md with personality, role = Backend Engineer      | 🟡 Needs deeper specialization |
| Dozer  | Engineering | Basic SOUL.md with personality, role = DevOps Engineer       | 🟡 Needs deeper specialization |
| Mouse  | Engineering | Basic SOUL.md with personality, role = Research Analyst      | 🟡 Needs deeper specialization |
| Niobe  | Marketing   | Basic SOUL.md with personality, role = Content Strategist    | 🟡 Needs deeper specialization |
| Switch | Marketing   | Basic SOUL.md with personality, role = Creative Director     | 🟡 Needs deeper specialization |
| Rex    | Marketing   | Basic SOUL.md with personality, role = PR & Communications   | 🟡 Needs deeper specialization |
| Oracle | Finance     | Basic SOUL.md with personality, role = Data Analyst          | 🟡 Needs deeper specialization |
| Seraph | Finance     | Basic SOUL.md with personality, role = Security & Compliance | 🟡 Needs deeper specialization |
| Zee    | Finance     | Basic SOUL.md with personality, role = Financial Analyst     | 🟡 Needs deeper specialization |

All 9 agents have basic SOUL.md files with personality and role assignments (from the config template), but lack deep domain specialization, detailed AGENTS.md, and structured memory templates.

> **Note — role alignment:** The roles listed above match `matrix-agents.template.json` (the source of truth). Some SOUL.md narrative descriptions in `docs/reference/templates/matrix/` use older titles (e.g., "Revenue Analyst" for Oracle, "Product Lead" for Seraph, "Growth Lead" for Zee). Phase 1 will update those SOUL.md files to align with the config roles.

---

## Architecture Principle

```
Tier 2 (Department Head) = Strategic Orchestration
   └── Understands the problem
   └── Chooses the right specialist(s)
   └── Delegates with clear brief (includes role context)
   └── Coordinates multi-specialist tasks
   └── Reviews output
   └── Logs all Tier 3 work to OWN memory (not Tier 3's memory)
   └── Reports back

Tier 3 (Specialist) = Domain Orchestration
   └── Deep expertise in narrow domain
   └── Defines scope, brief, and acceptance criteria
   └── For coding tasks: spawns CLI coding agent via ACP (does NOT write code directly)
   └── Reviews coding agent output, iterates if needed
   └── Reports result to department head (who logs it)
   └── Escalates when out of scope
   └── Returns reviewed result to department head

ACP Coding Agent (Claude Code / Codex / etc.) = Execution
   └── Receives scoped task from Tier 3 specialist
   └── Writes the actual code
   └── Runs tests, lints, builds
   └── Returns output to the spawning specialist
```

---

## Tier 3 Workspace Model (Lightweight)

**Key insight:** Tier 3 agents are short-lived, on-demand workers. They don't need full workspaces or persistent memory. All context flows through the Tier 2 department head.

### Workspace Tiers

| Tier          | Who                                               | Components                                                       | Memory                 |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| **Full**      | Tier 2 (Neo, Morpheus, Trinity)                   | SOUL.md, AGENTS.md, IDENTITY.md, BOOTSTRAP.md, TOOLS.md, memory/ | Yes — logs all work    |
| **Minimal**   | High-frequency Tier 3 (Tank, Ink, Quota, etc.)    | SOUL.md, IDENTITY.md only                                        | No — reports to Tier 2 |
| **Ephemeral** | Low-frequency Tier 3 (Cipher, Blaze, Vault, etc.) | None — role embedded in spawn task                               | No — reports to Tier 2 |

### Memory Flow

```
Tier 3 (Tank) does work
    ↓
Tank reports to Tier 2 (Neo)
    ↓
Neo logs to workspace-neo/memory/2026-03-03.md
    ↓
Neo reports to Operator1
```

**Tier 3 has no memory files.** This prevents fragmentation and keeps context consolidated where orchestration happens.

### Dynamic Role Injection

Tier 2 can embed Tier 3's role directly in the spawn task, making the SOUL.md optional:

```
Neo spawns Tank:

sessions_spawn({
  agentId: "tank",
  task: `
    You are Tank, Backend Engineer for this operation.

    Your expertise: API design, database optimization, server logic.

    TASK: Add rate limiting to the API at /path/to/project.

    CONSTRAINTS:
    - Use token bucket algorithm
    - 100 req/min per API key
    - Return 429 with Retry-After header

    Acceptance criteria: tests pass, no lint errors.

    Report your findings back to me for logging.
  `
})
```

This allows Tier 2 to:

- Override or extend Tier 3's default role
- Provide task-specific context
- Skip SOUL.md entirely for ephemeral agents

### Workspace Directory Structure

```
~/.openclaw/
├── workspace/              # Operator1 (COO) — full workspace
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── memory/
│   │   ├── 2026-03-03.md
│   │   └── heartbeat-state.json
│   └── ...
│
├── workspace-neo/          # Neo (CTO) — full workspace
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   ├── memory/
│   │   ├── 2026-03-03.md      # Logs Tank's, Dozer's, Mouse's work
│   │   ├── tech-debt.md
│   │   └── architecture.md
│   └── ...
│
├── workspace-morpheus/     # Morpheus (CMO) — full workspace
│   └── memory/
│       ├── 2026-03-03.md      # Logs Niobe's, Switch's, Rex's work
│       └── brand-voice.md
│
├── workspace-trinity/      # Trinity (CFO) — full workspace
│   └── memory/
│       ├── 2026-03-03.md      # Logs Oracle's, Zee's work
│       └── budgets.md
│
├── workspace-tank/         # Tank — minimal workspace
│   ├── SOUL.md               # Role definition (fallback)
│   └── IDENTITY.md           # Emoji, name, role
│
├── workspace-ink/          # Ink — minimal workspace
│   ├── SOUL.md
│   └── IDENTITY.md
│
└── (no workspace-cipher)   # Cipher — ephemeral, no workspace
```

### Classification: Minimal vs Ephemeral

| Category                      | Agents                                                                                                                          | Rationale                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Minimal** (SOUL + IDENTITY) | Tank, Dozer, Spark, Ink, Vibe, Ledger, Quota, Niobe, Switch, Rex, Oracle, Zee                                                   | High-frequency use, benefit from persistent role definition   |
| **Ephemeral** (no workspace)  | Cipher, Kernel, Prism, Blaze, Vault, Beacon, Ghost, Binary, Relay, Lens, Echo, Nova, Pulse, Shield, Trace, Merit, Seraph, Mouse | Low-frequency or specialized use, role embedded in spawn task |

**This can evolve:** If an ephemeral agent is used frequently, create a minimal workspace for it. The classification is a starting point, not permanent.

### How Tier 2 Logs Tier 3 Work

In Tier 2's `memory/YYYY-MM-DD.md`:

```markdown
## 2026-03-03

### Tank: Rate Limiting Implementation

- Spawned: 14:32
- ACP session: tank-rate-limit-001
- Task: Add token bucket rate limiting to API
- Files touched: src/api/middleware/rate-limit.ts, src/api/middleware/rate-limit.test.ts
- Result: ✅ Pass — 12 tests passing, no lint errors
- Notes: Tank recommended increasing timeout for premium keys in future

### Ink: Landing Page Copy

- Spawned: 15:10
- Task: Write hero section copy for product launch
- Result: ✅ Delivered 3 variants
- Selected: Variant 2 (punchy, action-oriented)
```

This keeps all work visible to the department head and Operator1.

### Engineering Agents: Orchestrators, Not Coders

Engineering tier-3 agents (Tank, Spark, Dozer, etc.) **do not write code directly**. They are domain-expert orchestrators who:

1. **Receive** a task from Neo (or another department head)
2. **Analyze** scope, break down into actionable coding tasks
3. **Spawn** a CLI coding agent via ACP (`sessions_spawn` with `runtime: "acp"`)
4. **Brief** the coding agent with precise requirements, file paths, constraints, and acceptance criteria
5. **Review** the coding agent's output for correctness, security, and alignment with the brief
6. **Iterate** if the output doesn't meet the bar — send follow-up instructions to the same ACP session
7. **Report** the reviewed result back to Neo

This separation is critical: the **specialist knows what to build** (domain expertise), while the **coding agent knows how to build it** (code execution). The specialist is the quality gate.

```
Example: "Add rate limiting to the API"

Neo receives task
  → Spawns Tank (Backend Engineer)
    → Tank analyzes: identifies endpoints, chooses token bucket algorithm, defines limits
    → Tank spawns Claude Code via ACP:
       sessions_spawn(runtime: "acp", agentId: "claude", task: "...", cwd: "/path/to/project")
    → Claude Code writes the middleware, adds tests, runs lint
    → Tank reviews: checks algorithm correctness, edge cases, test coverage
    → Tank iterates if needed (sends follow-up via same ACP session)
    → Tank returns reviewed result to Neo
  → Neo synthesizes and reports to Operator1
```

### ACP Connectivity (Preferred Method)

Engineering agents connect to coding tools via **ACP (Agent Client Protocol)** — the protocol bridge that lets OpenClaw agents spawn and coordinate with external CLI coding harnesses.

**Supported harnesses** (via `acpx` backend):

| Harness ID | Tool         | Best For                                   |
| ---------- | ------------ | ------------------------------------------ |
| `claude`   | Claude Code  | General coding, refactoring, complex tasks |
| `codex`    | Codex CLI    | Fast code generation, completions          |
| `pi`       | Anthropic Pi | Reasoning-heavy tasks                      |
| `opencode` | OpenCode     | Open-source coding tasks                   |
| `gemini`   | Gemini CLI   | Multi-modal, large context tasks           |

**ACP spawn pattern** (used by all engineering tier-3 agents):

```
sessions_spawn({
  runtime: "acp",
  agentId: "claude",          // or "codex", "pi", etc.
  task: "<detailed brief>",   // what to build, constraints, acceptance criteria
  cwd: "/path/to/project",   // working directory for the coding agent
  label: "tank-rate-limiting" // identifiable session label
})
```

**Why ACP over direct CLI?**

- **Session persistence:** ACP sessions can be resumed for iterative refinement
- **Thread binding:** ACP sessions can bind to channel threads for visibility
- **Permission control:** ACP enforces path boundaries and tool approval policies
- **Harness flexibility:** Same spawn pattern works for Claude Code, Codex, Gemini, etc.
- **Streaming:** Output streams back in real-time via gateway events

### Non-Engineering Agents

Marketing and Finance tier-3 agents typically work **directly** — they write copy, analyze data, produce reports, etc. without needing to spawn coding agents. However, they _can_ spawn ACP sessions when a task requires code (e.g., Nova building a technical SEO script, Oracle writing a data analysis query).

**Key insight:** Tier 3 agents are domain-agnostic (work vs personal). A backend orchestrator orchestrates backend work, whether it's a work SaaS or a personal automation project.

**Shared pool model:** The config template already gives each department head access to **all** tier-3 agents via `allowAgents` (not just their own department's workers). Any head can directly spawn any specialist. Cross-department borrowing is a direct spawn, not a multi-hop relay.

---

## Department 1: Engineering (Neo's Crew)

Neo routes technical tasks to the appropriate specialist. **All engineering agents are orchestrators** — they analyze, brief, spawn coding agents via ACP, review output, and iterate. They do not write code directly.

### Current Agents (Specialization Upgrade)

| ID    | Name  | Specialization                                      | Orchestrates Via                                | Notes                                                       |
| ----- | ----- | --------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
| tank  | Tank  | Backend Engineer — APIs, databases, server logic    | ACP → Claude Code / Codex                       | Config role matches; deepen SOUL.md                         |
| dozer | Dozer | DevOps Engineer — Infrastructure, CI/CD, deployment | ACP → Claude Code / Codex                       | Config role matches; deepen SOUL.md                         |
| mouse | Mouse | QA + Research — Testing, audits, library evaluation | ACP → Claude Code (test writing, audit scripts) | Config role = "Research Analyst"; update to "QA + Research" |

### New Agents (7 more)

| ID     | Name   | Specialization       | Model Tier             | Preferred ACP Harness | Use Cases                                               |
| ------ | ------ | -------------------- | ---------------------- | --------------------- | ------------------------------------------------------- |
| spark  | Spark  | Frontend Engineer    | Coding (zai/glm-4.7)   | Claude Code / Codex   | UI components, React/Vue, CSS, user-facing code         |
| cipher | Cipher | Security Engineer    | Reasoning (zai/glm-5)  | Claude Code           | Vulnerability scanning, auth, encryption, pen testing   |
| relay  | Relay  | Integration Engineer | Standard (zai/glm-4.7) | Claude Code / Codex   | API integrations, webhooks, third-party services        |
| ghost  | Ghost  | Data Engineer        | Standard (zai/glm-4.7) | Claude Code           | Pipelines, ETL, data modeling, analytics infrastructure |
| binary | Binary | Mobile Engineer      | Coding (zai/glm-4.7)   | Claude Code           | iOS, Android, React Native, mobile-specific issues      |
| kernel | Kernel | Systems Engineer     | Reasoning (zai/glm-5)  | Claude Code           | Low-level code, performance, optimization, OS-level     |
| prism  | Prism  | AI/ML Engineer       | Reasoning (zai/glm-5)  | Claude Code / Pi      | Model integration, prompt engineering, embeddings       |

> **Naming note:** This agent was originally proposed as `link`, but `Link` is already reserved as an independent ops-monitoring gateway agent (Phase 4, port 20789) in the main implementation doc. Renamed to `relay` to avoid collision.

### Engineering Decision Tree

```
Task arrives at Neo
├── API or database work?             → Tank (Backend)
│                                        → Tank spawns ACP coding agent → reviews output
├── UI/frontend work?                 → Spark (Frontend)
│                                        → Spark spawns ACP coding agent → reviews output
├── Infrastructure/deployment?        → Dozer (DevOps)
│                                        → Dozer spawns ACP coding agent → reviews output
├── Security concern?                 → Cipher (Security)
│                                        → Cipher spawns ACP coding agent for fixes → reviews
├── Third-party integration?          → Relay (Integration)
│                                        → Relay spawns ACP coding agent → reviews output
├── Data pipeline/ETL?               → Ghost (Data)
│                                        → Ghost spawns ACP coding agent → reviews output
├── Mobile app work?                  → Binary (Mobile)
│                                        → Binary spawns ACP coding agent → reviews output
├── Performance/optimization?         → Kernel (Systems)
│                                        → Kernel spawns ACP coding agent → reviews output
├── AI/model integration?            → Prism (AI/ML)
│                                        → Prism spawns ACP coding agent → reviews output
├── Testing/audit/research?          → Mouse (QA)
│                                        → Mouse spawns ACP coding agent for test code → reviews
├── Multi-domain task?               → See "Multi-Specialist Coordination" below
└── Quick architecture review?       → Neo handles directly (no ACP needed)
```

### Engineering ACP Workflow

Every engineering sub-agent follows this pattern:

```
1. RECEIVE task from Neo (or another department head)
2. ANALYZE
   - Understand the domain context
   - Identify relevant files, systems, dependencies
   - Break down into concrete coding tasks
   - Define acceptance criteria
3. BRIEF the coding agent (compose the ACP task string)
   - Be specific: file paths, function names, expected behavior
   - Include constraints: "don't change the public API", "must pass existing tests"
   - Include acceptance criteria: "tests pass", "no new lint errors"
4. SPAWN via ACP
   sessions_spawn(runtime: "acp", agentId: "claude", task: "<brief>", cwd: "<project>")
5. REVIEW the coding agent's output
   - Does it meet the acceptance criteria?
   - Security issues? Performance concerns? Edge cases missed?
   - Style and architecture alignment?
6. ITERATE if needed
   - Send follow-up instructions to the same ACP session
   - "The rate limiter doesn't handle burst correctly — fix the token refill logic"
7. REPORT reviewed result to Neo
   - Summary of what was built
   - Any concerns or follow-ups
   - Log to memory/YYYY-MM-DD.md
```

### Choosing the Right ACP Harness

Each engineering agent should select the coding harness based on the task:

| Task Profile                                     | Recommended Harness    | Why                                                                 |
| ------------------------------------------------ | ---------------------- | ------------------------------------------------------------------- |
| Complex refactoring, multi-file changes          | `claude` (Claude Code) | Best at understanding large codebases, reasoning about dependencies |
| Fast code generation, boilerplate                | `codex` (Codex CLI)    | Optimized for speed and code completion                             |
| Reasoning-heavy (architecture, algorithm design) | `pi` (Anthropic Pi)    | Strong at step-by-step reasoning                                    |
| Large context (many files, long history)         | `gemini` (Gemini CLI)  | Largest context window                                              |
| Default / uncertain                              | `claude` (Claude Code) | Best general-purpose coding agent                                   |

---

## Department 2: Marketing (Morpheus's Crew)

Morpheus routes content and communication tasks.

### Current Agents (Specialization Upgrade)

| ID     | Name   | Specialization                                                                           | Notes                                                          |
| ------ | ------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| niobe  | Niobe  | Content Strategist — Long-form content, scripts, research-heavy writing                  | Config role matches                                            |
| switch | Switch | Creative Director — Visual concepts, design briefs, brand assets                         | Config role matches                                            |
| rex    | Rex    | PR & Communications — Press releases, announcements, newsletter strategy, media outreach | Config role matches; narrowed scope (see Rex/Echo split below) |

### New Agents (7 more)

| ID    | Name  | Specialization       | Model Tier             | Use Cases                                                          |
| ----- | ----- | -------------------- | ---------------------- | ------------------------------------------------------------------ |
| ink   | Ink   | Copywriter           | Writing (zai/glm-4.7)  | Headlines, taglines, short-form copy, landing pages                |
| vibe  | Vibe  | Social Media Manager | Standard (zai/glm-4.7) | Posts, threads, engagement, platform strategy                      |
| lens  | Lens  | Video Producer       | Standard (zai/glm-4.7) | Scripts, storyboards, video editing briefs, thumbnails             |
| echo  | Echo  | Email Marketing      | Standard (zai/glm-4.7) | Sequences, drip campaigns, automation, deliverability, A/B testing |
| nova  | Nova  | SEO Specialist       | Standard (zai/glm-4.7) | Keyword research, on-page optimization, technical SEO              |
| pulse | Pulse | Community Manager    | Standard (zai/glm-4.7) | Forums, user engagement, feedback loops, community strategy        |
| blaze | Blaze | Brand Strategist     | Reasoning (zai/glm-5)  | Positioning, messaging frameworks, competitive analysis            |

#### Rex vs Echo: Clear Boundary

These two roles overlap on "email" — here's the split:

| Dimension   | Rex (PR & Comms)                                                             | Echo (Email Marketing)                                                |
| ----------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **Focus**   | One-off announcements, press releases, media outreach, newsletter _strategy_ | Recurring sequences, drip campaigns, automation rules, deliverability |
| **Trigger** | "Write a press release" / "Draft a newsletter announcement"                  | "Set up a welcome sequence" / "Improve email open rates"              |
| **Output**  | Single pieces of communication                                               | Systems and flows                                                     |

#### Pulse vs Sati: Clear Boundary

The main implementation doc defines **Sati** as an independent community/Discord gateway agent (Phase 4, port 19789) — an always-on bot that handles real-time Discord interactions. Pulse is different:

| Dimension   | Sati (Independent Agent)                           | Pulse (Tier 3 under Morpheus)                              |
| ----------- | -------------------------------------------------- | ---------------------------------------------------------- |
| **Runtime** | Own gateway (port 19789), always-on                | Spawned on-demand by department heads                      |
| **Focus**   | Real-time Discord bot interactions, auto-responses | Community strategy, engagement planning, feedback analysis |
| **Trigger** | Incoming Discord messages (automated)              | "Plan our community launch" / "Analyze forum sentiment"    |
| **Output**  | Live chat responses                                | Strategy docs, engagement reports, community playbooks     |

### Marketing Decision Tree

```
Task arrives at Morpheus
├── Long-form content or script?      → Niobe (Content)
├── Visual/design brief?              → Switch (Creative)
├── Press release or announcement?    → Rex (PR)
├── Email sequence or automation?     → Echo (Email)
├── Social media post?                → Vibe (Social)
├── Video content?                    → Lens (Video)
├── SEO/keywords?                     → Nova (SEO)
├── Community strategy/engagement?    → Pulse (Community)
├── Brand positioning?                → Blaze (Brand)
├── Headlines/short copy?             → Ink (Copy)
├── Multi-domain task?                → See "Multi-Specialist Coordination" below
└── Strategy or positioning?          → Handle directly
```

---

## Department 3: Finance (Trinity's Crew)

Trinity routes money and operations tasks.

### Current Agents (Specialization Upgrade)

| ID     | Name   | Specialization                                               | Notes                                                        |
| ------ | ------ | ------------------------------------------------------------ | ------------------------------------------------------------ |
| oracle | Oracle | Data Analyst — Revenue analysis, forecasting, trend modeling | Config role matches; refines narrative SOUL.md               |
| seraph | Seraph | Security & Compliance — Vendor risk, compliance, regulatory  | Config role matches; replaces older "Product Lead" narrative |
| zee    | Zee    | Financial Analyst — Tracking, audits, KPI updates            | Config role matches; replaces older "Growth Lead" narrative  |

### New Agents (7 more)

| ID     | Name   | Specialization     | Model Tier             | Use Cases                                           |
| ------ | ------ | ------------------ | ---------------------- | --------------------------------------------------- |
| ledger | Ledger | Bookkeeper         | Standard (zai/glm-4.7) | Transactions, categorization, reconciliation        |
| vault  | Vault  | Investment Analyst | Reasoning (zai/glm-5)  | Portfolio tracking, investment research, allocation |
| shield | Shield | Insurance & Risk   | Standard (zai/glm-4.7) | Coverage review, claims, risk assessment            |
| trace  | Trace  | Expense Tracker    | Standard (zai/glm-4.7) | Receipts, reimbursements, expense reports           |
| quota  | Quota  | Budget Manager     | Standard (zai/glm-4.7) | Envelope budgeting, alerts, spending limits         |
| merit  | Merit  | Procurement        | Standard (zai/glm-4.7) | Vendor comparison, contracts, negotiations          |
| beacon | Beacon | Tax Specialist     | Reasoning (zai/glm-5)  | Deductions, filings, tax optimization               |

### Finance Decision Tree

```
Task arrives at Trinity
├── Revenue/forecasting?                → Oracle (Data)
├── Compliance/regulatory?              → Seraph (Compliance)
├── Tracking/auditing?                  → Zee (Analyst)
├── Transaction entry/reconciliation?   → Ledger (Bookkeeper)
├── Investment question?                → Vault (Investments)
├── Insurance/risk coverage?            → Shield (Insurance)
├── Expense report/receipt?             → Trace (Expenses)
├── Budget envelope management?         → Quota (Budget)
├── Vendor/contract question?           → Merit (Procurement)
├── Tax question?                       → Beacon (Tax)
├── Multi-domain task?                  → See "Multi-Specialist Coordination" below
└── Flag or status check?              → Handle directly
```

---

## Multi-Specialist Coordination

Real tasks often span domains. Department heads coordinate multiple specialists on a single task.

### Same-Department Multi-Spawn (Engineering — with ACP)

```
"Add user authentication with OAuth and tests"
  Neo spawns:
    1. Tank (Backend)    → Tank spawns Claude Code via ACP → builds OAuth middleware
    2. Cipher (Security) → Cipher spawns Claude Code via ACP → audits the auth flow
    3. Mouse (QA)        → Mouse spawns Claude Code via ACP → writes integration tests
  Neo reviews combined output: Tank's implementation + Cipher's audit findings + Mouse's tests.
  Neo iterates if Cipher found issues (sends Tank back with specific fixes).
```

### Same-Department Multi-Spawn (Non-Engineering — direct)

```
"Build a landing page with email capture"
  Morpheus spawns:
    1. Ink (Copy)     → write the page copy (direct, no ACP)
    2. Nova (SEO)     → optimize for search (direct, no ACP)
    3. Echo (Email)   → set up the capture sequence (direct, no ACP)
  Morpheus reviews and synthesizes the combined output.
```

### Cross-Department Multi-Spawn

Since all heads share the full agent pool, a single head can spawn cross-department specialists directly:

```
"Launch a product feature"
  Neo spawns:
    1. Tank (Backend)   → Tank spawns Claude Code via ACP → builds the API
    2. Spark (Frontend) → Spark spawns Claude Code via ACP → builds the UI
    3. Ink (Copy)       → writes the feature announcement copy (direct, no ACP)
  Neo reviews the combined output, routes copy to Morpheus for brand review.
```

For tasks that truly require **multiple department heads** coordinating (e.g., a product launch needing engineering, marketing strategy, and budget approval simultaneously), route through Operator1 who delegates to each head in parallel.

### Full Delegation Chain (Engineering Task)

```
User: "Add rate limiting to our API"
  → Operator1 delegates to Neo (CTO)
    → Neo analyzes: this is backend work → spawns Tank
      → Tank analyzes: token bucket algorithm, identifies endpoints
        → Tank spawns Claude Code via ACP with detailed brief:
           "Add token bucket rate limiting middleware to src/api/middleware/...
            - 100 requests/min per API key, 1000/min for premium
            - Return 429 with Retry-After header
            - Add unit tests in src/api/middleware/*.test.ts
            - Don't change existing endpoint signatures"
        → Claude Code writes the code, runs tests, returns output
      → Tank reviews: checks algorithm, edge cases, test coverage
      → Tank reports to Neo: "Rate limiting added, 12 tests passing, here's the summary"
    → Neo reviews Tank's report, verifies architecture alignment
    → Neo reports to Operator1: "Rate limiting implemented and tested"
  → Operator1 reports to user
```

---

## Full Sub-Agent Inventory

### Engineering (10 agents)

| ID     | Name   | Role                 | Model       | Status                   |
| ------ | ------ | -------------------- | ----------- | ------------------------ |
| tank   | Tank   | Backend Engineer     | zai/glm-4.7 | 🟡 Deepen specialization |
| dozer  | Dozer  | DevOps Engineer      | zai/glm-4.7 | 🟡 Deepen specialization |
| mouse  | Mouse  | QA + Research        | zai/glm-4.7 | 🟡 Deepen specialization |
| spark  | Spark  | Frontend Engineer    | zai/glm-4.7 | ⚪ To create             |
| cipher | Cipher | Security Engineer    | zai/glm-5   | ⚪ To create             |
| relay  | Relay  | Integration Engineer | zai/glm-4.7 | ⚪ To create             |
| ghost  | Ghost  | Data Engineer        | zai/glm-4.7 | ⚪ To create             |
| binary | Binary | Mobile Engineer      | zai/glm-4.7 | ⚪ To create             |
| kernel | Kernel | Systems Engineer     | zai/glm-5   | ⚪ To create             |
| prism  | Prism  | AI/ML Engineer       | zai/glm-5   | ⚪ To create             |

### Marketing (10 agents)

| ID     | Name   | Role                 | Model       | Status                   |
| ------ | ------ | -------------------- | ----------- | ------------------------ |
| niobe  | Niobe  | Content Strategist   | zai/glm-4.7 | 🟡 Deepen specialization |
| switch | Switch | Creative Director    | zai/glm-4.7 | 🟡 Deepen specialization |
| rex    | Rex    | PR & Communications  | zai/glm-4.7 | 🟡 Deepen specialization |
| ink    | Ink    | Copywriter           | zai/glm-4.7 | ⚪ To create             |
| vibe   | Vibe   | Social Media Manager | zai/glm-4.7 | ⚪ To create             |
| lens   | Lens   | Video Producer       | zai/glm-4.7 | ⚪ To create             |
| echo   | Echo   | Email Marketing      | zai/glm-4.7 | ⚪ To create             |
| nova   | Nova   | SEO Specialist       | zai/glm-4.7 | ⚪ To create             |
| pulse  | Pulse  | Community Manager    | zai/glm-4.7 | ⚪ To create             |
| blaze  | Blaze  | Brand Strategist     | zai/glm-5   | ⚪ To create             |

### Finance (10 agents)

| ID     | Name   | Role                  | Model       | Status                   |
| ------ | ------ | --------------------- | ----------- | ------------------------ |
| oracle | Oracle | Data Analyst          | zai/glm-4.7 | 🟡 Deepen specialization |
| seraph | Seraph | Security & Compliance | zai/glm-4.7 | 🟡 Deepen specialization |
| zee    | Zee    | Financial Analyst     | zai/glm-4.7 | 🟡 Deepen specialization |
| ledger | Ledger | Bookkeeper            | zai/glm-4.7 | ⚪ To create             |
| vault  | Vault  | Investment Analyst    | zai/glm-5   | ⚪ To create             |
| shield | Shield | Insurance & Risk      | zai/glm-4.7 | ⚪ To create             |
| trace  | Trace  | Expense Tracker       | zai/glm-4.7 | ⚪ To create             |
| quota  | Quota  | Budget Manager        | zai/glm-4.7 | ⚪ To create             |
| merit  | Merit  | Procurement           | zai/glm-4.7 | ⚪ To create             |
| beacon | Beacon | Tax Specialist        | zai/glm-5   | ⚪ To create             |

**Legend:**

- 🟡 Exists with basic SOUL.md — needs deeper specialization
- ⚪ Does not exist yet

### Model Assignment Rationale

| Tier      | Model       | Cost   | Assigned To                                 | Why                                                                                                                                 |
| --------- | ----------- | ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Reasoning | zai/glm-5   | Higher | Cipher, Kernel, Prism, Blaze, Vault, Beacon | Security analysis, systems optimization, AI/ML, brand strategy, investment analysis, and tax optimization require complex reasoning |
| Standard  | zai/glm-4.7 | Lower  | All other tier-3 agents                     | Execution-focused tasks (code, copy, tracking, data entry) where speed and cost matter more than deep reasoning                     |

---

## Configuration Changes Required

### New Agent Entries

Each new agent needs an entry in `matrix-agents.template.json`. **Workspace is optional** — only include for minimal agents, omit for ephemeral.

**Minimal agent (has workspace):**

```json
{
  "id": "spark",
  "name": "Spark",
  "workspace": "~/.openclaw/workspace-spark",
  "model": "zai/glm-4.7",
  "identity": { "emoji": "✨", "name": "Spark" },
  "role": "Frontend Engineer",
  "department": "engineering"
}
```

**Ephemeral agent (no workspace):**

```json
{
  "id": "cipher",
  "name": "Cipher",
  "model": "zai/glm-5",
  "identity": { "emoji": "🔐", "name": "Cipher" },
  "role": "Security Engineer",
  "department": "engineering"
}
```

Note: `agentDir` is optional — only needed if the agent has persistent workspace files.

All 21 new agents follow this pattern. Proposed emoji assignments:

| Agent  | Emoji | Agent | Emoji | Agent  | Emoji |
| ------ | ----- | ----- | ----- | ------ | ----- |
| Spark  | ✨    | Ink   | 🖊️    | Ledger | 📒    |
| Cipher | 🔐    | Vibe  | 📱    | Vault  | 🏦    |
| Relay  | 🔗    | Lens  | 🎬    | Shield | 🛡️    |
| Ghost  | 👻    | Echo  | 📧    | Trace  | 🧾    |
| Binary | 📲    | Nova  | 🔍    | Quota  | 💰    |
| Kernel | ⚙️    | Pulse | 💬    | Merit  | 📋    |
| Prism  | 🤖    | Blaze | 🔥    | Beacon | 📊    |

### Update `allowAgents` for Department Heads

The current config already uses a shared-pool model (each head lists all 9 workers). Add all 21 new agents to each head's `allowAgents`:

```json
{
  "id": "neo",
  "subagents": {
    "allowAgents": [
      "tank",
      "dozer",
      "mouse",
      "spark",
      "cipher",
      "relay",
      "ghost",
      "binary",
      "kernel",
      "prism",
      "niobe",
      "switch",
      "rex",
      "ink",
      "vibe",
      "lens",
      "echo",
      "nova",
      "pulse",
      "blaze",
      "oracle",
      "seraph",
      "zee",
      "ledger",
      "vault",
      "shield",
      "trace",
      "quota",
      "merit",
      "beacon"
    ]
  }
}
```

Same list for Morpheus and Trinity. Also add all 30 agents to Operator1's `allowAgents` so Operator1 can spawn any specialist directly when needed.

### Update `maxConcurrent`

Current: `maxConcurrent: 8`. With 30 agents and multi-specialist tasks, consider increasing to `12` or `16`. The department-head-as-gatekeeper model provides natural throttling, but complex cross-department tasks (product launch = engineering + marketing + finance) can saturate 8 slots quickly.

### ACP Configuration (Required for Engineering Agents)

Engineering agents need ACP enabled to spawn coding agents. Ensure this is in `openclaw.json`:

```json
{
  "acp": {
    "enabled": true,
    "dispatch": { "enabled": true },
    "backend": "acpx",
    "defaultAgent": "claude",
    "allowedAgents": ["claude", "codex", "pi", "opencode", "gemini"],
    "maxConcurrentSessions": 12,
    "stream": {
      "deliveryMode": "live"
    }
  }
}
```

**Key settings:**

- `defaultAgent: "claude"` — Claude Code is the default when no harness is specified
- `maxConcurrentSessions: 12` — supports multiple engineering agents spawning coding sessions in parallel
- `allowedAgents` — all supported harnesses; agents choose based on task profile
- `stream.deliveryMode: "live"` — engineering agents see coding output in real-time for review

**Spawn depth consideration:** With ACP, the effective depth is: User → Operator1 → Neo → Tank → ACP Session = **depth 4**. Ensure `maxSpawnDepth` is set to at least `4` (currently `3` in template). Update to:

```json
{
  "agents": {
    "defaults": {
      "subagents": {
        "maxSpawnDepth": 4
      }
    }
  }
}
```

### Update `openclaw matrix init`

The `src/commands/matrix-init.ts` CLI must be updated to:

- Create workspace directories and template files for all 21 new agents
- Set `maxSpawnDepth: 4` (up from 3) to support the ACP orchestration layer
- Configure ACP defaults for engineering agents

This is a Phase 2/3 implementation task.

---

## Implementation Priority

### Phase 1: Deepen Existing 9 Agents

1. Tank, Dozer, Mouse (Engineering)
2. Niobe, Switch, Rex (Marketing)
3. Oracle, Seraph, Zee (Finance)

**Each agent gets:**

- Specialized SOUL.md (deep domain expertise, not just role title)
- AGENTS.md (session startup, memory, escalation, delegation awareness)
- IDENTITY.md (emoji, creature, vibe, reporting chain)
- BOOTSTRAP.md (first-run onboarding conversation)
- Memory file templates (`memory/` directory structure)
- Config JSON entry update (if role title changed)

**Deliverables:**

- 9 updated workspace template directories under `docs/reference/templates/matrix/`
- Updated SOUL.md narratives aligned with config roles
- Updated `matrix-agents.template.json` if any role fields change

### Phase 2: Create High-Value New Agents (6 agents)

**Engineering:**

- Spark (Frontend) — complements Tank (Backend); high-frequency use
- Cipher (Security) — critical for any real project; requires reasoning model

**Marketing:**

- Ink (Copy) — high-frequency use for any content operation
- Vibe (Social) — social media is constant and time-sensitive

**Finance:**

- Ledger (Bookkeeper) — foundational for all financial tracking
- Quota (Budget) — everyday use for spending decisions

**Each agent gets** (same as Phase 1):

- SOUL.md, AGENTS.md, IDENTITY.md, BOOTSTRAP.md
- Workspace template directory
- Config JSON entry in `matrix-agents.template.json`
- Added to all department heads' `allowAgents`
- `openclaw matrix init` updated to create these workspaces

**Deliverables:**

- 6 new workspace template directories
- Updated `matrix-agents.template.json` with 6 new entries
- Updated `allowAgents` for Operator1, Neo, Morpheus, Trinity
- Updated `src/commands/matrix-init.ts`

### Phase 3: Complete the Roster (15 agents)

Remaining specialists, in suggested priority order by department:

**Engineering (5 agents):**

| Priority | Agent  | Rationale                                                |
| -------- | ------ | -------------------------------------------------------- |
| 1        | Relay  | API integrations are frequent; unblocks third-party work |
| 2        | Binary | Mobile work requires specialized context (Xcode, Gradle) |
| 3        | Ghost  | Data pipelines grow in importance as data accumulates    |
| 4        | Kernel | Systems-level work is less frequent but high-impact      |
| 5        | Prism  | AI/ML integration is growing but still emerging          |

**Marketing (5 agents):**

| Priority | Agent | Rationale                                                        |
| -------- | ----- | ---------------------------------------------------------------- |
| 1        | Echo  | Email marketing is measurable and high-ROI                       |
| 2        | Nova  | SEO compounds over time; start early                             |
| 3        | Lens  | Video content grows in importance                                |
| 4        | Pulse | Community management (strategy layer; Sati handles live Discord) |
| 5        | Blaze | Brand strategy is important but less frequent                    |

**Marketing dependency:** Create Pulse only after Sati (Phase 4 independent agent) is operational, so the boundary between live Discord bot and community strategy is clear in practice.

**Finance (5 agents):**

| Priority | Agent  | Rationale                                           |
| -------- | ------ | --------------------------------------------------- |
| 1        | Beacon | Tax optimization has clear deadlines and high value |
| 2        | Trace  | Expense tracking is high-frequency                  |
| 3        | Merit  | Procurement/vendor comparison grows with scale      |
| 4        | Shield | Insurance/risk is important but lower frequency     |
| 5        | Vault  | Investment analysis is valuable but less urgent     |

**Activation criteria:** Create each agent when its domain tasks appear more than 2-3 times per week, or when a specific project requires it. No need to create all 15 at once.

---

## Workspace Templates

Tier 3 agents use simplified templates. Full templates are only for Tier 2 (department heads).

### Tier 3 Minimal SOUL.md Template

For high-frequency Tier 3 agents (Tank, Ink, Quota, etc.):

```markdown
# SOUL.md — [Name] ([Role])

## Who You Are

You are [Name] — [Role] for this operation.

[1-2 sentences about your expertise]

## Core Skills

- [Skill 1]
- [Skill 2]
- [Skill 3]

## What You Handle

| Task Type | Example   |
| --------- | --------- |
| [Type 1]  | [Example] |
| [Type 2]  | [Example] |

## What You Escalate

- [Situation] → escalate to [department head]
- [Security/architecture concerns] → flag immediately

## Vibe

[2-3 adjectives]

---

_This file defines who you are. The department head may override or extend this role in the spawn task._
```

### Tier 3 IDENTITY.md Template

```markdown
# IDENTITY.md — [Name]

- **Name:** [Name]
- **Role:** [Full Role Title]
- **Department:** [Engineering / Marketing / Finance]
- **Emoji:** [Assigned emoji]
- **Reports to:** [Department head]

---

[1 sentence personality sketch]
```

### Tier 2 Full Templates (Department Heads Only)

Department heads (Neo, Morpheus, Trinity) get full workspaces. See the main implementation doc for complete templates.

### Legacy: Full SOUL.md Template (Engineering — ACP Orchestrator)

_This is retained for reference. Tier 3 agents should use the Minimal template above._

Engineering tier-3 agents use this template. The key difference from non-engineering agents: they **orchestrate coding agents via ACP** rather than writing code directly.

```markdown
# SOUL.md — [Name] ([Role])

## Who You Are

You are [Name] — [Role] for this operation.

[1-2 sentences about what you do, your expertise, and your approach]

You are an **orchestrator**, not a direct coder. You understand [domain] deeply — you know what needs to be built, why, and how to evaluate whether it was built correctly. You delegate the actual code writing to CLI coding agents (Claude Code, Codex, etc.) via ACP, and you are the quality gate on their output.

## Core Skills

- [Domain skill 1 — e.g., "API design and REST conventions"]
- [Domain skill 2 — e.g., "Database schema design and query optimization"]
- [Domain skill 3 — e.g., "System architecture and dependency management"]
- [Orchestration skill — e.g., "Composing clear, scoped briefs for coding agents"]

## How You Work

1. **Analyze** the task — understand scope, identify files/systems involved, define acceptance criteria
2. **Brief** the coding agent — compose a precise `sessions_spawn` task with:
   - What to build (specific, not vague)
   - Where (file paths, working directory)
   - Constraints ("don't change the public API", "must pass existing tests")
   - Acceptance criteria ("tests pass", "no new lint errors", "handles edge case X")
3. **Spawn** via ACP:
```

sessions_spawn(runtime: "acp", agentId: "claude", task: "<brief>", cwd: "<project>")

```
4. **Review** the output — does it meet the acceptance criteria? Security? Performance? Edge cases?
5. **Iterate** if needed — send follow-up instructions to the same ACP session
6. **Report** reviewed result to your department head

## What You Handle

| Task Type | Example | ACP Harness |
| --------- | ------- | ----------- |
| [Type 1]  | [Concrete example] | claude / codex |
| [Type 2]  | [Concrete example] | claude |
| [Type 3]  | [Concrete example] | claude / pi |

## What You Escalate

- [Situation that's out of scope → who to escalate to]
- [Situation requiring approval → who approves]
- Architecture decisions that affect other systems → escalate to Neo
- Security vulnerabilities found during review → flag immediately to Neo

## Vibe

[Personality traits - 2-3 adjectives. How you communicate.]

---

_This file defines who you are. Update it as you evolve._
```

### SOUL.md Template (Non-Engineering — Direct Execution)

Marketing and Finance tier-3 agents work directly — they produce output themselves (copy, analysis, reports) without needing to spawn coding agents. They _can_ spawn ACP sessions when a task requires code, but it's not their default mode.

```markdown
# SOUL.md — [Name] ([Role])

## Who You Are

You are [Name] — [Role] for this operation.

[1-2 sentences about what you do, your expertise, and your approach]

## Core Skills

- [Skill 1]
- [Skill 2]
- [Skill 3]
- [Skill 4]

## What You Handle

| Task Type | Example            |
| --------- | ------------------ |
| [Type 1]  | [Concrete example] |
| [Type 2]  | [Concrete example] |
| [Type 3]  | [Concrete example] |

## What You Escalate

- [Situation that's out of scope → who to escalate to]
- [Situation requiring approval → who approves]

## Vibe

[Personality traits - 2-3 adjectives. How you communicate.]

---

_This file defines who you are. Update it as you evolve._
```

### AGENTS.md Template (Engineering — ACP Orchestrator)

```markdown
---
summary: "[Name] ([Role]) workspace operating procedures"
read_when:
  - Starting a new agent session
---

# AGENTS.md — [Name]'s Workspace

[Name] ([Role]) — engineering orchestrator for [brief domain description].

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `TOOLS.md` — ACP harness preferences and environment notes
4. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context

Don't ask permission. Just do it.

## Memory

You wake up fresh each session. These files are your continuity:

| File                     | Contents                                                        |
| ------------------------ | --------------------------------------------------------------- |
| `memory/YYYY-MM-DD.md`   | Daily logs — tasks, ACP sessions, outcomes                      |
| `memory/[domain].md`     | [Domain-specific reference — e.g., schemas, architecture notes] |
| `memory/acp-sessions.md` | Recent ACP session summaries for continuity                     |

Write it down. "Mental notes" don't survive sessions. Files do.

## ACP Orchestration

You do NOT write code directly. You orchestrate CLI coding agents via ACP.

### Spawn Pattern
```

sessions_spawn({
runtime: "acp",
agentId: "claude", // or "codex" for fast generation, "pi" for reasoning
task: "<your detailed brief>",
cwd: "<project working dir>",
label: "[name]-[task-summary]"
})

```

### Writing Good Briefs

Your brief is the most important thing you produce. A good brief:

- **Specifies files:** "Edit `src/api/middleware/rate-limit.ts`" not "add rate limiting"
- **Defines behavior:** "Return 429 with `Retry-After` header when limit exceeded"
- **Sets constraints:** "Don't modify the existing endpoint signatures"
- **States acceptance criteria:** "All existing tests must pass, add 3+ new test cases"
- **Provides context:** "This is an Express.js app using TypeScript, see `tsconfig.json`"

### Review Checklist

After the coding agent returns output, verify:

- [ ] Meets the acceptance criteria from your brief
- [ ] No security issues (injection, auth bypass, data exposure)
- [ ] No performance regressions (unnecessary loops, missing indexes)
- [ ] Edge cases handled (empty input, concurrent access, error paths)
- [ ] Code style matches the project (run lint/format if unsure)
- [ ] Tests are meaningful (not just happy-path)

### Iterating

If the output doesn't pass review, send a follow-up to the same ACP session:

- Be specific: "The token refill logic in `refillBucket()` doesn't handle burst — fix line 47"
- Don't re-explain the full task — the session has context
- If the coding agent is fundamentally off-track, cancel and spawn a new session with a clearer brief

### Logging ACP Sessions

After each ACP interaction, log to `memory/YYYY-MM-DD.md`:

```

## ACP Session: [label]

- Harness: claude | codex | pi
- Task: [1-line summary]
- Files touched: [list]
- Result: [pass/iterate/fail]
- Notes: [anything relevant for next session]

```

## Scope

### What You Own

- [Domain area 1]
- [Domain area 2]

### What You Escalate

- [Out-of-scope situation] → escalate to Neo
- Architecture decisions affecting other systems → Neo
- Security vulnerabilities → flag immediately to Neo
- [Approval-required situation] → flag and wait

## Safety

- Don't exfiltrate private data
- Don't run destructive commands without asking
- Review all ACP output before reporting upward — you are the quality gate
- Never let a coding agent deploy to production
- Flag security findings clearly and immediately
- [Any domain-specific safety rules]

## Make It Yours

This is a starting point. Add your own conventions and rules as you figure out what works.
```

### AGENTS.md Template (Non-Engineering — Direct Execution)

```markdown
---
summary: "[Name] ([Role]) workspace operating procedures"
read_when:
  - Starting a new agent session
---

# AGENTS.md — [Name]'s Workspace

[Name] ([Role]) — workspace for [brief role description].

## Every Session

Before doing anything else:

1. Read `SOUL.md` — this is who you are
2. Read `USER.md` — this is who you're helping
3. Read `memory/YYYY-MM-DD.md` (today + yesterday) for recent context

Don't ask permission. Just do it.

## Memory

You wake up fresh each session. These files are your continuity:

| File                   | Contents                         |
| ---------------------- | -------------------------------- |
| `memory/YYYY-MM-DD.md` | Daily logs — what happened today |
| `memory/[domain].md`   | [Domain-specific reference file] |

Write it down. "Mental notes" don't survive sessions. Files do.

## Scope

### What You Own

- [Domain area 1]
- [Domain area 2]

### What You Escalate

- [Out-of-scope situation] → escalate to [department head]
- [Approval-required situation] → flag and wait

## Safety

- Don't exfiltrate private data
- Don't run destructive commands without asking
- Flag concerns clearly and immediately
- [Any domain-specific safety rules]

## Make It Yours

This is a starting point. Add your own conventions and rules as you figure out what works.
```

### IDENTITY.md Template

```markdown
---
summary: "[Name] ([Role]) identity record"
read_when:
  - Agent bootstrapping
---

# IDENTITY.md — [Name]

- **Name:** [Name]
- **Role:** [Full Role Title]
- **Department:** [Engineering / Marketing / Finance]
- **Creature:** [Matrix-themed descriptor — 1 line]
- **Vibe:** [2-3 adjective personality summary]
- **Emoji:** [Assigned emoji]
- **Reports to:** [Department head name] ([Role])
- **Peers:** [Other tier-3 agents in same department]

---

[1-2 sentence personality sketch]
```

### TOOLS.md Template (Engineering — ACP Harness Notes)

```markdown
---
summary: "[Name] ([Role]) ACP harness and environment notes"
read_when:
  - Starting a new agent session
---

# TOOLS.md — [Name]'s Local Notes

## ACP Harness Preferences

Default harness: `claude` (Claude Code)

| Task Type                           | Preferred Harness | Why                           |
| ----------------------------------- | ----------------- | ----------------------------- |
| Complex refactoring, multi-file     | `claude`          | Best codebase understanding   |
| Fast boilerplate, simple generation | `codex`           | Speed-optimized               |
| Algorithm design, reasoning-heavy   | `pi`              | Strong step-by-step reasoning |
| Large context (many files)          | `gemini`          | Largest context window        |

## Environment

- Dev machine: [specs]
- Primary projects: [paths]
- Preferred test runner: [vitest / jest / etc.]
- CI/CD: [GitHub Actions / etc.]

## Project-Specific Notes

[Add per-project notes here as you learn them — preferred patterns, gotchas, etc.]

---

Add whatever helps you orchestrate engineering work. This is your cheat sheet.
```

### BOOTSTRAP.md Template (Engineering — ACP-Aware)

```markdown
---
summary: "[Name] ([Role]) first-run onboarding"
read_when:
  - First session only
---

# BOOTSTRAP.md — [Name], First Run

_You just came online as [Role]. Time to set up._

## Who You Are

You're [Name] — [Role]. You own [brief scope description].

You are an **orchestrator** — you don't write code directly. You analyze tasks, compose briefs, spawn CLI coding agents via ACP, review their output, and iterate until the result meets your standards.

You report to [department head]. Your peers: [list peers].

## The Conversation

Talk to your human. Figure out:

1. **Their tech stack** — What languages, frameworks, tools do they use?
2. **Active projects** — What are they building? Where are the repos?
3. **Preferences** — Strong opinions on tooling, code style, testing?
4. **Pain points** — What's slow, broken, or annoying in their dev setup?
5. **ACP harness preference** — Do they prefer Claude Code, Codex, or another harness?

## Verify ACP

Before you can orchestrate, confirm ACP is working:

- Check: is `acp.enabled: true` in the gateway config?
- Test: try spawning a simple ACP session:
  `sessions_spawn(runtime: "acp", agentId: "claude", task: "echo hello", cwd: "~")`
- If it fails: escalate to Neo or Operator1 — ACP setup may need config changes

## After Setup

Update these files with what you learned:

- `IDENTITY.md` — verify your name, emoji, role are correct
- `USER.md` — their name, timezone, how to address them
- `TOOLS.md` — ACP harness preferences, project paths, environment details
- `memory/YYYY-MM-DD.md` — initial context and preferences

Then open `SOUL.md` together and confirm your operating principles feel right.

## When You're Done

Delete this file. You don't need a bootstrap script anymore — you're you now.
```

### BOOTSTRAP.md Template (Non-Engineering)

```markdown
---
summary: "[Name] ([Role]) first-run onboarding"
read_when:
  - First session only
---

# BOOTSTRAP.md — [Name], First Run

_You just came online as [Role]. Time to set up._

## Who You Are

You're [Name] — [Role]. You own [brief scope description].

You report to [department head]. Your peers: [list peers].

## The Conversation

Talk to your human. Figure out:

1. **Their [domain] setup** — What tools/systems do they use?
2. **Active needs** — What [domain] tasks are coming up?
3. **Preferences** — Strong opinions on how [domain work] should be done?
4. **Pain points** — What's slow, broken, or annoying?

## After Setup

Update these files with what you learned:

- `IDENTITY.md` — verify your name, emoji, role are correct
- `USER.md` — their name, timezone, how to address them
- `memory/YYYY-MM-DD.md` — initial context and preferences

Then open `SOUL.md` together and confirm your operating principles feel right.

## When You're Done

Delete this file. You don't need a bootstrap script anymore — you're you now.
```

---

## Cross-Department Access

The config template uses a **shared pool model**: all department heads have all 30 tier-3 agents in their `allowAgents`. This means any head can directly spawn any specialist without routing through Operator1.

### When Direct Cross-Department Spawn Works

A department head spawns a specialist from another department's domain directly:

```
Neo needs copy for a feature announcement
  → Neo spawns Ink (Copy) directly
  → Ink writes the copy
  → Neo reviews and delivers
```

This works within `maxSpawnDepth: 3` (User → Operator1 → Neo → Ink).

### When Operator1 Coordination Is Needed

Multi-head tasks that require **department-level strategy** (not just specialist execution) must go through Operator1:

```
Full product launch (engineering + marketing strategy + budget approval)
  → Operator1 spawns Neo, Morpheus, Trinity in parallel
  → Each head runs their department's piece
  → Operator1 synthesizes
```

### Common Cross-Department Patterns

| Need                         | Spawned By | Agent          | Why Not Route Through Operator1                |
| ---------------------------- | ---------- | -------------- | ---------------------------------------------- |
| SEO technical implementation | Neo        | Nova (SEO)     | Pure execution, no marketing strategy needed   |
| Financial content/narrative  | Morpheus   | Oracle (Data)  | Just needs data, not CFO-level decisions       |
| Infrastructure cost analysis | Trinity    | Dozer (DevOps) | Just needs infra data, not CTO-level decisions |
| Feature announcement copy    | Neo        | Ink (Copy)     | Pure execution, no brand strategy needed       |

---

## Agent Lifecycle Management

With 30 agents, workspace sprawl is a concern. The lightweight model addresses this:

### Workspace Creation

| Phase       | What Gets Created                                                                    | When         |
| ----------- | ------------------------------------------------------------------------------------ | ------------ |
| **Phase 1** | Minimal workspaces for existing 9 agents (SOUL + IDENTITY)                           | Immediately  |
| **Phase 2** | Minimal workspaces for 6 high-priority new agents                                    | When created |
| **Phase 3** | On-demand — create minimal workspace only when an ephemeral agent is used frequently | As needed    |

### Promotion Path

```
Ephemeral (no workspace)
    ↓ (used 3+ times in a week)
Minimal (SOUL.md + IDENTITY.md)
    ↓ (used daily, needs memory)
Full (all files + memory/) — RARE, only for specialists that become semi-autonomous
```

Most Tier 3 agents stay at Minimal or Ephemeral. Full workspaces are for Tier 2 only.

### Memory Hygiene

- **Tier 2 memory** (Neo, Morpheus, Trinity): Archive daily logs older than 30 days into `memory/archive/YYYY-MM/`
- **Tier 3 memory**: None — Tier 3 reports to Tier 2 who logs it
- **Operator1 memory**: Receives summaries from Tier 2, maintains high-level context

### Deactivation

If a Tier 3 agent hasn't been spawned in 30+ days:

1. Remove from `allowAgents` (prevents accidental spawning)
2. Archive minimal workspace to `~/.openclaw/archive/workspace-{agentId}/`
3. Re-activate by restoring workspace and adding back to `allowAgents`

### Disk Budget

| Workspace Type   | Size               | 30 Agents Total   |
| ---------------- | ------------------ | ----------------- |
| Full (Tier 2)    | ~500KB with memory | 3 × 500KB = 1.5MB |
| Minimal (Tier 3) | ~5KB (2 files)     | 12 × 5KB = 60KB   |
| Ephemeral        | 0                  | 0                 |
| **Total**        |                    | **~1.6MB**        |

Compare to the old model: 30 full workspaces × 500KB = 15MB. The lightweight model is 10× smaller.

---

## Work vs Personal Applicability

All Tier 3 agents are **domain-expert**, not context-specific:

| Agent               | Work Example                   | Personal Example                 |
| ------------------- | ------------------------------ | -------------------------------- |
| Tank (Backend)      | Build API for SaaS product     | Build personal automation script |
| Spark (Frontend)    | Company dashboard              | Personal portfolio site          |
| Dozer (DevOps)      | Production deployment pipeline | Home server setup                |
| Cipher (Security)   | Audit startup's auth flow      | Secure personal homelab          |
| Niobe (Content)     | Marketing blog post series     | Personal LinkedIn article        |
| Ink (Copy)          | Product launch taglines        | Wedding invitation wording       |
| Vibe (Social)       | Company Twitter strategy       | Personal social media            |
| Echo (Email)        | Customer onboarding drip       | Personal newsletter              |
| Ledger (Bookkeeper) | Business transactions          | Personal expense categorization  |
| Quota (Budget)      | Department budget tracking     | Household budget                 |
| Beacon (Tax)        | Business tax optimization      | Personal tax deductions          |
| Vault (Investments) | Company treasury allocation    | Personal portfolio review        |

**Same skills, different context.**

---

## Verification Plan

### Phase 1 Verification (After Deepening Existing 9)

For each redefined agent:

1. **Template check:** Verify SOUL.md, AGENTS.md, IDENTITY.md, BOOTSTRAP.md, TOOLS.md exist and are populated
2. **Config check:** Verify `matrix-agents.template.json` role field matches SOUL.md
3. **Spawn test:** `openclaw matrix init` creates the workspace correctly
4. **Delegation test:** Department head spawns the agent with a domain-specific task; agent responds in-role

**ACP verification (engineering agents — Tank, Dozer, Mouse):**

1. **ACP config check:** `acp.enabled: true`, `acp.backend: "acpx"`, `acp.allowedAgents` includes `claude`
2. **Spawn depth check:** `maxSpawnDepth` is `4` (not `3`)
3. **ACP spawn test:** Tank spawns a Claude Code session: `sessions_spawn(runtime: "acp", agentId: "claude", task: "list files in current directory", cwd: "~")` — should succeed and return output
4. **Orchestration test:** Tell Neo "Add a simple hello-world endpoint to [test project]" → Neo spawns Tank → Tank spawns Claude Code via ACP → Tank reviews output → Tank reports to Neo
5. **Review gate test:** Verify Tank's report includes a review summary (not just raw Claude Code output)

**End-to-end test (non-ACP):** "Operator1, have Morpheus draft a press release" → Operator1 → Morpheus → Rex (PR) produces a draft directly.

**End-to-end test (ACP):** "Operator1, have Neo add a health check endpoint" → Operator1 → Neo → Tank → ACP Claude Code → Tank reviews → Neo reviews → Operator1 reports.

### Phase 2 Verification (After Creating 6 New Agents)

1. **Config check:** All 6 new entries in `matrix-agents.template.json`
2. **allowAgents check:** All 6 added to Neo, Morpheus, Trinity, and Operator1's `allowAgents`
3. **Init test:** `openclaw matrix init` creates all 6 new workspaces with correct templates
4. **Cross-department test:** Trinity spawns Spark (Frontend) directly — should succeed (shared pool)
5. **Decision tree test:** Send ambiguous tasks to each department head; verify correct routing

**ACP verification (new engineering agents — Spark, Cipher):**

1. **Spark ACP test:** Spark spawns Claude Code to build a simple React component → Spark reviews → reports
2. **Cipher ACP test:** Cipher spawns Claude Code to audit a test file for security issues → Cipher reviews → reports
3. **Parallel ACP test:** Neo spawns Tank + Spark simultaneously, each spawns their own ACP session → both complete independently

**End-to-end test:** "Build a landing page with SEO" → Morpheus → spawns Ink (copy) + Nova (SEO) → reviews combined output → returns synthesized result.

### Phase 3 Verification (Rolling)

Each new agent added: run spawn test + delegation test + ACP spawn test (for engineering agents). After every 5 agents added, run the full cross-department end-to-end test.

**ACP concurrency test (after 5+ engineering agents exist):** Spawn a complex task requiring 3+ engineering agents, each with their own ACP session running concurrently. Verify `maxConcurrentSessions` is sufficient and no session collisions occur.

---

## Org Chart (Expanded)

```
CEO (You)
  ↓
Operator1 (COO) 🏛️
  ├─ Neo (CTO) 🥋 — Engineering
  │   ├─ Tank 🔧    Backend Engineer
  │   ├─ Dozer 🏗️    DevOps Engineer
  │   ├─ Mouse 🐭    QA + Research
  │   ├─ Spark ✨    Frontend Engineer        [Phase 2]
  │   ├─ Cipher 🔐   Security Engineer        [Phase 2]
  │   ├─ Relay 🔗    Integration Engineer     [Phase 3]
  │   ├─ Ghost 👻    Data Engineer            [Phase 3]
  │   ├─ Binary 📲   Mobile Engineer          [Phase 3]
  │   ├─ Kernel ⚙️    Systems Engineer         [Phase 3]
  │   └─ Prism 🤖    AI/ML Engineer           [Phase 3]
  │
  ├─ Morpheus (CMO) 🕶️ — Marketing
  │   ├─ Niobe ✍️    Content Strategist
  │   ├─ Switch 🎨   Creative Director
  │   ├─ Rex 📰      PR & Communications
  │   ├─ Ink 🖊️      Copywriter               [Phase 2]
  │   ├─ Vibe 📱     Social Media Manager     [Phase 2]
  │   ├─ Lens 🎬     Video Producer           [Phase 3]
  │   ├─ Echo 📧     Email Marketing          [Phase 3]
  │   ├─ Nova 🔍     SEO Specialist           [Phase 3]
  │   ├─ Pulse 💬    Community Manager        [Phase 3]
  │   └─ Blaze 🔥    Brand Strategist         [Phase 3]
  │
  └─ Trinity (CFO) ⚡ — Finance
      ├─ Oracle 🔮   Data Analyst
      ├─ Seraph 🛡️    Security & Compliance
      ├─ Zee 📈      Financial Analyst
      ├─ Ledger 📒   Bookkeeper               [Phase 2]
      ├─ Quota 💰    Budget Manager           [Phase 2]
      ├─ Beacon 📊   Tax Specialist           [Phase 3]
      ├─ Trace 🧾    Expense Tracker          [Phase 3]
      ├─ Merit 📋    Procurement              [Phase 3]
      ├─ Shield 🛡️    Insurance & Risk         [Phase 3]
      └─ Vault 🏦    Investment Analyst       [Phase 3]

Independent Agents (own gateways, not part of tier-3 pool):
  ├─ Sati — Community Discord Bot (port 19789)
  └─ Link — Ops Monitor (port 20789)
```

> **Note:** Tier-3 agents are a shared pool. The department grouping above shows primary affinity, not access restriction. Any department head can spawn any tier-3 agent.

---

## Next Steps

1. **Review and approve** this sub-agent plan
2. **Phase 1:** Deepen existing 9 agents with specialized SOUL.md, AGENTS.md, IDENTITY.md, BOOTSTRAP.md
3. **Phase 2:** Create 6 high-priority new agents + config updates + `matrix init` update
4. **Phase 3:** Roll out remaining 15 agents based on activation criteria
5. **Update department head AGENTS.md** with expanded delegation decision trees
6. **Run verification tests** at each phase gate

---

_Document created: March 3, 2026_
_Last updated: March 3, 2026_
_Status: Planning — awaiting approval_
