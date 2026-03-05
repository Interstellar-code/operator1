# n8n Integration Plan for Operator1

**Created:** 2026-03-04
**Author:** Operator1 (COO)
**Status:** Draft — Planning Phase
**Updated:** 2026-03-04 (Deep dive explanation added)

---

## Executive Summary

Integrate n8n workflow automation into Operator1's ecosystem, creating a bidirectional bridge between n8n's visual workflow builder and the Matrix multi-agent system.

### Key Outcomes

- n8n becomes a **trigger layer** for Matrix agents
- Visual workflow builder for agent chains
- Embedded n8n canvas in ui-next (no separate tab)
- Bidirectional: n8n → Agents AND Agents → n8n
- Self-hosted on Mac Mini M4
- Single authentication flow

### The Value Proposition

| Without Integration           | With Integration                          |
| ----------------------------- | ----------------------------------------- |
| n8n makes HTTP calls manually | Single "Spawn Agent" node                 |
| No agent hierarchy            | Full 34-agent Matrix system               |
| No memory/context             | QMD + workspace files                     |
| Separate UI/app               | Embedded in ui-next dashboard             |
| Separate auth                 | Single sign-on                            |
| Fragile API wiring            | Automatic spawn chains (Neo → Tank → ACP) |

---

## 1. What is n8n Integration? (Deep Dive)

### 1.1 What is n8n?

n8n is a **visual workflow automation tool** (like Zapier, but self-hosted).

```
┌─────────────────────────────────────────────────────────┐
│                     n8n Workflow                        │
│                                                         │
│   ┌──────────┐    ┌──────────┐    ┌──────────┐        │
│   │ Trigger  │───►│  Node A  │───►│  Node B  │───► Output
│   │(Webhook) │    │(HTTP)    │    │(Slack)   │        │
│   └──────────┘    └──────────┘    └──────────┘        │
│                                                         │
│   Each node = JavaScript function that:                │
│   1. Receives input data                               │
│   2. Does something (API call, transform, etc.)        │
│   3. Returns output data                               │
└─────────────────────────────────────────────────────────┘
```

**n8n provides:**

- 400+ built-in integrations (GitHub, Slack, Telegram, etc.)
- Visual workflow editor (drag-and-drop)
- Webhook triggers
- Scheduling (cron)
- Error handling and retries
- Self-hosted (runs on your Mac Mini)

### 1.2 What is a Custom n8n Node?

A **custom node** is a TypeScript module that adds new functionality to n8n.

```typescript
// A custom node is just this:
export class OpenClawAgent implements INodeType {
  description = {
    displayName: 'OpenClaw Agent',
    name: 'openClawAgent',
    properties: [
      { name: 'agentId', type: 'options', ... },  // Dropdown
      { name: 'task', type: 'string', ... },      // Text input
    ],
  };

  async execute() {
    // Your code here
    // Calls OpenClaw Gateway, spawns agents, etc.
  }
}
```

**What it does:**

1. Defines UI elements (dropdowns, inputs, toggles)
2. Implements `execute()` function
3. Can call ANY API — including OpenClaw Gateway

**Where it lives:**

- `~/.n8n/custom/nodes/OpenClawAgent/`
- Appears in n8n's node palette like any built-in node

### 1.3 How Does It Connect to Gateway?

The custom node calls Gateway via **HTTP RPC** — the same method Operator1 uses internally.

```
┌─────────────┐                    ┌─────────────┐
│    n8n      │                    │  OpenClaw   │
│   Workflow  │                    │  Gateway    │
│             │                    │             │
│  ┌───────┐  │   HTTP POST        │  ┌───────┐  │
│  │OpenClaw│ │ ─────────────────► │  │  RPC  │  │
│  │ Node  │  │   localhost:18789  │  │ Layer │  │
│  └───────┘  │                    │  └───┬───┘  │
│             │                    │      │      │
└─────────────┘                    └──────┼──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │   Agents    │
                                   │ (Neo, etc.) │
                                   └─────────────┘
```

**The RPC call inside the node:**

```typescript
// Inside n8n node's execute() function:
const response = await this.helpers.request({
  method: "POST",
  url: "http://localhost:18789/rpc",
  body: {
    method: "sessions_spawn",
    params: {
      agentId: "neo",
      task: "Review this code...",
      runTimeoutSeconds: 600,
    },
  },
});

// Response:
// {
//   result: "Code review complete...",
//   tokens: 1234,
//   spawnChain: ['neo', 'tank', 'claude-code'],
// }
```

**Key insight:** This is the **SAME RPC call** that Operator1 makes when you say "Spawn Neo to review this code." n8n is just another client of the Gateway.

### 1.4 How Does It Use the Matrix Agent System?

**Current system (without n8n):**

```
You (Telegram)
      │
      ▼
Operator1 (COO)
      │
      ├──► Neo (CTO) ──► Tank ──► ACP (Claude Code)
      │
      ├──► Morpheus (CMO) ──► Niobe
      │
      └──► Trinity (CFO) ──► Oracle
```

**With n8n (new trigger paths):**

```
┌─────────────────────────────────────────────────────────────┐
│                     TRIGGER SOURCES                          │
│                                                              │
│  Telegram    GitHub      Schedule    Email    Webhook       │
│     │          │           │          │          │          │
└─────┼──────────┼───────────┼──────────┼──────────┼──────────┘
      │          │           │          │          │
      ▼          ▼           ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────┐
│                         n8n                                  │
│                                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ GitHub   │───►│Condition │───►│ OpenClaw │              │
│  │ Trigger  │    │  Node    │    │  Node    │              │
│  └──────────┘    └──────────┘    └────┬─────┘              │
│                                       │                     │
└───────────────────────────────────────┼─────────────────────┘
                                        │
                                        │ RPC: sessions_spawn
                                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Same Matrix Agent System You Already Have           │   │
│  │                                                       │   │
│  │  Operator1 → Neo → Tank → ACP                        │   │
│  │             Morpheus → Niobe                         │   │
│  │             Trinity → Oracle                         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**The Matrix agent system remains unchanged.** n8n just becomes another way to trigger it.

---

## 2. Bidirectional Integration

### 2.1 Direction 1: n8n → Agents (Trigger Agents)

The primary use case: n8n triggers agents to do work.

```
GitHub Webhook
      │
      ▼
    n8n
      │
      │  OpenClaw Node: { agentId: 'neo', task: 'Review PR' }
      │
      ▼
  Gateway RPC: sessions_spawn
      │
      ▼
    Neo ──► Tank ──► ACP ──► Review complete
      │
      ▼
    n8n receives result
      │
      ▼
  Post comment on GitHub
```

**Example Workflow: Code Review Pipeline**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   GitHub    │───►│  OpenClaw   │───►│   Parse     │───►│   GitHub    │
│   Webhook   │    │    Neo      │    │   Result    │    │  (Comment)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

### 2.2 Direction 2: Agents → n8n (Trigger Workflows)

Agents can trigger n8n workflows when events happen.

**Requires: Gateway Webhook Configuration**

```
Agent completes task
      │
      ▼
Gateway fires webhook
      │
      │  POST to n8n webhook URL
      │
      ▼
n8n Webhook Trigger
      │
      ▼
n8n workflow runs
      │
      ▼
Send notification / Log / etc.
```

**Gateway config:**

```json
{
  "webhooks": {
    "onAgentComplete": "http://localhost:5678/webhook/agent-complete",
    "onAgentFailed": "http://localhost:5678/webhook/agent-failed",
    "onSubagentSpawn": "http://localhost:5678/webhook/subagent-spawn"
  }
}
```

**Example Workflow: Agent Completion Notification**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Webhook    │───►│   Format    │───►│  Telegram   │
│  (Agent     │    │   Message   │    │  (Notify)   │
│   Complete) │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘
```

### 2.3 Direction 3: Agent Calls n8n Workflow

Agents can execute n8n workflows programmatically.

```
Operator1
      │
      │  "Run the daily standup workflow"
      │
      ▼
Gateway calls n8n REST API: POST /api/v1/workflows/123/execute
      │
      ▼
n8n runs workflow
      │
      ├──► Neo (collect engineering status)
      ├──► Morpheus (collect marketing status)
      └──► Trinity (collect finance status)
      │
      ▼
Compile summary
      │
      ▼
Return to Operator1
```

### 2.4 Integration Points Summary

| Integration Point      | Direction     | Method               | Phase   |
| ---------------------- | ------------- | -------------------- | ------- |
| **Custom Node**        | n8n → Agents  | RPC `sessions_spawn` | Phase 1 |
| **Webhook Trigger**    | Agents → n8n  | Gateway POST to n8n  | Phase 2 |
| **Workflow Execution** | Agents → n8n  | n8n REST API         | Phase 2 |
| **UI Embedding**       | Display       | iframe + JWT auth    | Phase 3 |
| **Shared State**       | Bidirectional | Redis / SQLite       | Phase 4 |

---

## 3. Architecture

### 3.1 System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        ui-next                                │
│                    (React 19 + Vite)                          │
│                                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │  Sidebar    │    │   Header    │    │  Workflow Page  │  │
│  │  Navigation │    │  (Auth)     │    │  (n8n iframe)   │  │
│  └─────────────┘    └─────────────┘    └────────┬────────┘  │
└──────────────────────────────────────────────────┼───────────┘
                                                   │
                                                   │ iframe
                                                   ▼
┌──────────────────────────────────────────────────────────────┐
│                         n8n                                   │
│                    (port 5678)                                │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                    n8n Editor                            │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────────┐ │ │
│  │  │Workflow │  │  Node   │  │   OpenClaw Node         │ │ │
│  │  │Canvas   │  │ Palette │  │   (Custom)              │ │ │
│  │  └─────────┘  └─────────┘  └─────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           │ HTTP/WebSocket
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                   OpenClaw Gateway                            │
│                      (port 18789)                             │
│                                                               │
│  RPC Methods:                                                │
│  • sessions_spawn — Spawn agent                              │
│  • sessions_send — Send message to agent                     │
│  • subagents_list — List active subagents                    │
│  • agents_list — List available agents                       │
│  • config_get — Get configuration                            │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                     Agent Pool                                │
│                                                               │
│  Operator1 → Neo → Tank/Spark → ACP (Claude Code)           │
│  Operator1 → Morpheus → Niobe/Switch/Rex                     │
│  Operator1 → Trinity → Oracle/Seraph/Zee                     │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Component Breakdown

| Component       | Technology      | Port  | Purpose             |
| --------------- | --------------- | ----- | ------------------- |
| **ui-next**     | React 19 + Vite | 3000  | Main dashboard      |
| **n8n**         | Node.js         | 5678  | Workflow engine     |
| **Gateway**     | OpenClaw        | 18789 | Agent orchestration |
| **Shared Auth** | JWT/OAuth2      | —     | Single sign-on      |

---

## 4. Custom n8n Node Implementation

### 4.1 Node Structure

```
n8n-nodes-openclaw/
├── nodes/
│   ├── OpenClawAgent/
│   │   ├── OpenClawAgent.node.ts    # Main node logic
│   │   └── openclaw.svg             # Icon
│   └── OpenClawTrigger/
│       ├── OpenClawTrigger.node.ts  # Trigger node
│       └── openclaw.svg
├── credentials/
│   └── OpenClawApi.credentials.ts   # API key config
├── package.json
└── README.md
```

### 4.2 OpenClaw Agent Node (Core)

```typescript
// nodes/OpenClawAgent/OpenClawAgent.node.ts
import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionTypes,
} from "n8n-workflow";

export class OpenClawAgent implements INodeType {
  description: INodeTypeDescription = {
    displayName: "OpenClaw Agent",
    name: "openClawAgent",
    icon: "file:openclaw.svg",
    group: ["transform"],
    version: 1,
    description: "Spawn an OpenClaw agent to execute a task",
    defaults: {
      name: "OpenClaw Agent",
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: "openClawApi",
        required: true,
      },
    ],
    properties: [
      // Agent Selection
      {
        displayName: "Agent",
        name: "agentId",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getAgents",
        },
        default: "",
        description: "Select the agent to spawn",
      },

      // Task Input
      {
        displayName: "Task",
        name: "task",
        type: "string",
        typeOptions: {
          rows: 8,
        },
        default: "",
        description: "Task description for the agent",
        placeholder: "Review this code and suggest improvements...",
      },

      // Workspace (Optional)
      {
        displayName: "Workspace Path",
        name: "workspace",
        type: "string",
        default: "",
        description: "Project workspace path (optional)",
        placeholder: "~/dev/my-project",
      },

      // Timeout
      {
        displayName: "Timeout (seconds)",
        name: "timeout",
        type: "number",
        default: 600,
        description: "Maximum runtime for the agent",
      },

      // Model Override (Optional)
      {
        displayName: "Model Override",
        name: "model",
        type: "options",
        typeOptions: {
          loadOptionsMethod: "getModels",
        },
        default: "",
        description: "Override default model (optional)",
      },
    ],
  };

  methods = {
    loadOptions: {
      // Load agents from Gateway
      async getAgents(this: any) {
        const credentials = await this.getCredentials("openClawApi");

        const response = await this.helpers.request({
          method: "POST",
          url: `${credentials.host}/rpc`,
          headers: {
            Authorization: `Bearer ${credentials.apiKey}`,
            "Content-Type": "application/json",
          },
          body: {
            method: "agents_list",
            params: {},
          },
          json: true,
        });

        const agents = response.agents || [];

        // Group by department
        return agents.map((agent: any) => ({
          name: `${agent.name} (${agent.department || "General"})`,
          value: agent.id,
        }));
      },

      // Load models from Gateway
      async getModels(this: any) {
        const credentials = await this.getCredentials("openClawApi");

        const response = await this.helpers.request({
          method: "POST",
          url: `${credentials.host}/rpc`,
          headers: {
            Authorization: `Bearer ${credentials.apiKey}`,
          },
          body: {
            method: "models_list",
            params: {},
          },
          json: true,
        });

        const models = response.models || [];

        return models.map((model: any) => ({
          name: model.name,
          value: model.id,
        }));
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials("openClawApi");

    const items = this.getInputData();
    const results: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const agentId = this.getNodeParameter("agentId", i) as string;
      const task = this.getNodeParameter("task", i) as string;
      const workspace = this.getNodeParameter("workspace", i, "") as string;
      const timeout = this.getNodeParameter("timeout", i, 600) as number;
      const model = this.getNodeParameter("model", i, "") as string;

      // Call Gateway RPC
      const response = await this.helpers.request({
        method: "POST",
        url: `${credentials.host}/rpc`,
        headers: {
          Authorization: `Bearer ${credentials.apiKey}`,
          "Content-Type": "application/json",
        },
        body: {
          method: "sessions_spawn",
          params: {
            agentId,
            task,
            workspace: workspace || undefined,
            runTimeoutSeconds: timeout,
            model: model || undefined,
            mode: "run",
            runtime: "subagent",
          },
        },
        json: true,
      });

      results.push({
        json: {
          result: response.result || "",
          tokens: response.tokens || 0,
          duration: response.duration || 0,
          spawnChain: response.spawnChain || [],
          status: response.status || "unknown",
          sessionId: response.sessionId,
          runId: response.runId,
        },
        pairedItem: { item: i },
      });
    }

    return [results];
  }
}
```

### 4.3 Credentials Configuration

```typescript
// credentials/OpenClawApi.credentials.ts
import { ICredentialType, INodeProperties } from "n8n-workflow";

export class OpenClawApi implements ICredentialType {
  name = "openClawApi";
  displayName = "OpenClaw API";
  documentationUrl = "https://docs.openclaw.ai";
  properties: INodeProperties[] = [
    {
      displayName: "Host",
      name: "host",
      type: "string",
      default: "http://localhost:18789",
      description: "OpenClaw Gateway host URL",
    },
    {
      displayName: "API Key",
      name: "apiKey",
      type: "string",
      typeOptions: { password: true },
      description: "API key for Gateway authentication",
    },
  ];
}
```

---

## 5. Example Workflows

### 5.1 Code Review Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   GitHub    │───►│  OpenClaw   │───►│   Parse     │───►│   GitHub    │
│   Webhook   │    │    Neo      │    │   Result    │    │  (Comment)  │
│             │    │             │    │             │    │             │
│ PR opened   │    │ Review code │    │ Extract     │    │ Post review │
└─────────────┘    └─────────────┘    │ summary     │    └─────────────┘
                                      └─────────────┘
```

**Trigger:** GitHub PR opened
**Flow:**

1. GitHub webhook triggers n8n
2. Neo reviews code changes (may spawn Tank → ACP)
3. Parse response for summary
4. Comment posted back to PR

### 5.2 Daily Standup

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Cron      │───►│    Neo      │───►│  Morpheus   │───►│  Telegram   │
│  (9 AM)     │    │ (Eng Status)│    │ (Mkt Status)│    │  (Summary)  │
│             │    │             │    │             │    │             │
│ Schedule    │    │ What's done │    │ Campaigns   │    │ Daily recap │
└─────────────┘    │ blockers    │    │ metrics     │    └─────────────┘
                   └─────────────┘    └─────────────┘
                          │
                          ▼
                   ┌─────────────┐
                   │   Trinity   │
                   │ (Fin Status)│
                   │             │
                   │ Budget/costs│
                   └─────────────┘
```

**Trigger:** Daily schedule at 9 AM
**Flow:**

1. Cron triggers workflow
2. Spawn Neo, Morpheus, Trinity in parallel
3. Each reports department status
4. Compile into summary
5. Send to Telegram

### 5.3 Error Handling Chain

```
┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────────┐
│   Error     │───►│  Operator1  │───►│         Condition               │
│   Webhook   │    │  (Analyze)  │    │                                 │
│             │    │             │    │  ┌───────────┬───────────────┐ │
│ Error event │    │ Categorize  │    │  │ Code?     │ Config?       │ │
└─────────────┘    │ error type  │    │  ▼           ▼               │ │
                   └─────────────┘    │ Neo         Trinity          │ │
                                      │ (Fix code)  (Fix config)     │ │
                                      └─────────────────────────────────┘
```

**Trigger:** Error from monitoring system
**Flow:**

1. Error webhook received
2. Operator1 analyzes and categorizes
3. Route to appropriate agent:
   - Code error → Neo
   - Config error → Trinity
   - Content error → Morpheus
4. Agent fixes or escalates
5. Notify CEO if critical

---

## 6. UI Integration (Phase 3)

### 6.1 Embedded Canvas

```tsx
// ui-next/src/pages/workflows.tsx
export function WorkflowsPage() {
  const [n8nReady, setN8nReady] = useState(false);
  const n8nUrl = useConfig((s) => s.n8nUrl) || "http://localhost:5678";
  const token = useAuth((s) => s.token);

  return (
    <div className="flex h-full flex-col">
      {/* Optional: Custom header */}
      <div className="flex items-center justify-between border-b p-4">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Play className="mr-2 h-4 w-4" />
            Run All
          </Button>
          <Button variant="outline" size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* n8n iframe */}
      <div className="flex-1">
        {!n8nReady && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="ml-2">Loading workflow editor...</span>
          </div>
        )}
        <iframe
          src={`${n8nUrl}?token=${token}&embed=true`}
          className="h-full w-full border-0"
          title="n8n Workflows"
          onLoad={() => setN8nReady(true)}
          style={{ display: n8nReady ? "block" : "none" }}
        />
      </div>
    </div>
  );
}
```

### 6.2 Authentication Bridge

```
User logs into ui-next
        │
        ▼
ui-next generates JWT token
        │
        ▼
Pass token to n8n via iframe URL
        │
        │  http://localhost:5678?token=xxx&embed=true
        │
        ▼
n8n validates token with Gateway
        │
        ▼
n8n sets session cookie
        │
        ▼
User authenticated in n8n (no separate login)
```

### 6.3 Theme Integration

**Goal:** Make n8n look like Operator1 (Matrix theme)

**Approach: CSS Injection**

```typescript
// Inject custom CSS into n8n iframe
const injectMatrixTheme = (iframe: HTMLIFrameElement) => {
  const doc = iframe.contentDocument;
  if (!doc) return;

  const style = doc.createElement("style");
  style.textContent = `
    /* Matrix theme overrides */
    :root {
      --color-primary: #22c55e;
      --color-background: #000000;
      --color-foreground: #ffffff;
    }
    
    /* Hide n8n header when embedded */
    .embed-mode .el-header { display: none; }
    
    /* Custom scrollbars */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: #1a1a1a; }
    ::-webkit-scrollbar-thumb { background: #22c55e; }
  `;
  doc.head.appendChild(style);
};
```

---

## 7. Phased Implementation Roadmap

### Phase 1: Custom Node (Week 1)

**Goal:** n8n can trigger agents

| Day | Task                        | Deliverable                  |
| --- | --------------------------- | ---------------------------- |
| 1   | Deploy n8n locally (Docker) | n8n running on port 5678     |
| 2   | Create OpenClaw Agent node  | Node appears in palette      |
| 3   | Implement RPC calls         | Node can spawn agents        |
| 4   | Add agent/model dropdowns   | Dynamic loading from Gateway |
| 5   | Build first workflow        | Code Review Pipeline working |

**Deliverables:**

- ✅ n8n running locally
- ✅ Custom node installed
- ✅ Can spawn any of 34 agents
- ✅ 1 working workflow (Code Review)

**Effort:** 5 days
**Dependencies:** None

---

### Phase 2: Bidirectional Webhooks (Week 2)

**Goal:** Agents can trigger workflows

| Day | Task                               | Deliverable                   |
| --- | ---------------------------------- | ----------------------------- |
| 1   | Add webhook config to Gateway      | Gateway can POST on events    |
| 2   | Create OpenClaw Trigger node       | Node receives agent events    |
| 3   | Build agent completion workflow    | Auto-notify on completion     |
| 4   | Add workflow execution from agents | Agents can call n8n API       |
| 5   | Build 2 more workflows             | Daily Standup, Error Handling |

**Deliverables:**

- ✅ Gateway → n8n webhooks
- ✅ OpenClaw Trigger node
- ✅ Agents can execute workflows
- ✅ 3 total workflows

**Effort:** 5 days
**Dependencies:** Phase 1 complete

---

### Phase 3: UI Integration (Week 3)

**Goal:** n8n embedded in ui-next

| Day | Task                         | Deliverable              |
| --- | ---------------------------- | ------------------------ |
| 1   | Add iframe to Workflows page | n8n loads in ui-next     |
| 2   | Implement auth bridge        | Single sign-on working   |
| 3   | Inject Matrix theme          | n8n looks like Operator1 |
| 4   | Add sidebar navigation       | Workflows entry in menu  |
| 5   | Polish and test              | Full integration working |

**Deliverables:**

- ✅ n8n embedded in ui-next
- ✅ Single sign-on
- ✅ Matrix theme applied
- ✅ Seamless navigation

**Effort:** 5 days
**Dependencies:** Phase 2 complete

---

### Phase 4: Deep Integration (Optional, Week 4+)

**Goal:** Shared state and advanced features

| Task               | Description                             |
| ------------------ | --------------------------------------- |
| Shared memory      | Agents read/write n8n workflow state    |
| Workflow templates | Pre-built templates for common patterns |
| Execution history  | Unified view of agent + workflow runs   |
| Metrics dashboard  | Combined analytics                      |

**Deliverables:**

- ✅ Redis/SQLite bridge for state
- ✅ Template library
- ✅ Unified history view
- ✅ Combined metrics

**Effort:** 5+ days
**Dependencies:** Phase 3 complete
**Status:** Optional

---

## 8. Deployment

### 8.1 Local Development

```bash
# Install n8n
npm install -g n8n

# Start with environment
export N8N_HOST=localhost
export N8N_PORT=5678
export N8N_PROTOCOL=http
export WEBHOOK_URL=http://localhost:5678/

# Start
n8n start
```

### 8.2 Production (Docker)

```yaml
# docker-compose.yml
version: "3.8"

services:
  n8n:
    image: n8nio/n8n:latest
    container_name: operator1-n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=Asia/Kolkata
      - TZ=Asia/Kolkata
      - N8N_CUSTOM_EXTENSIONS=/root/.n8n/custom
    volumes:
      - n8n_data:/home/node/.n8n
      - ./n8n-nodes-openclaw:/root/.n8n/custom

volumes:
  n8n_data:
```

### 8.3 Install Custom Node

```bash
# Option 1: npm link (development)
cd n8n-nodes-openclaw
npm link
cd ~/.n8n/custom
npm link n8n-nodes-openclaw

# Option 2: Copy to custom folder
cp -r n8n-nodes-openclaw ~/.n8n/custom/

# Restart n8n
n8n restart
```

---

## 9. Security

### 9.1 Network Security

| Layer          | Configuration                           |
| -------------- | --------------------------------------- |
| **Gateway**    | Only accept localhost connections       |
| **n8n**        | Only accept localhost connections       |
| **ui-next**    | Proxy n8n through Vite dev server (dev) |
| **Production** | Reverse proxy with SSL (nginx/Caddy)    |

### 9.2 API Key Management

- API key stored in n8n credentials (encrypted)
- Key has limited scope (only RPC methods needed)
- Key can be rotated without affecting users

### 9.3 Authentication Flow

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   ui-next   │         │   Gateway   │         │    n8n      │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  1. Login             │                       │
       │──────────────────────►│                       │
       │                       │                       │
       │  2. JWT Token         │                       │
       │◄──────────────────────│                       │
       │                       │                       │
       │  3. Load iframe with token                    │
       │──────────────────────────────────────────────►│
       │                       │                       │
       │                       │  4. Validate token    │
       │                       │◄──────────────────────│
       │                       │                       │
       │                       │  5. Token valid       │
       │                       │──────────────────────►│
       │                       │                       │
       │  6. n8n session cookie                        │
       │◄──────────────────────────────────────────────│
```

---

## 10. Similar Projects & Feasibility

### 10.1 n8n + AI Integrations

| Project                | Description                   | Relevance                           |
| ---------------------- | ----------------------------- | ----------------------------------- |
| **n8n + LangChain**    | Community nodes for LangChain | Similar pattern — calls external AI |
| **n8n + OpenAI**       | Built-in OpenAI node          | Same approach, different API        |
| **n8n + Hugging Face** | Community node for HF         | Same approach                       |
| **Flowise**            | LangChain visual builder      | Alternative (but not as flexible)   |

### 10.2 Feasibility Assessment

| Aspect                     | Feasibility  | Evidence                          |
| -------------------------- | ------------ | --------------------------------- |
| **Custom node**            | ✅ Proven    | n8n docs + 400+ community nodes   |
| **Gateway RPC calls**      | ✅ Trivial   | Just HTTP POST                    |
| **Bidirectional webhooks** | ✅ Easy      | Both support webhooks natively    |
| **UI embedding**           | ✅ Supported | n8n designed for iframe embedding |
| **Shared auth**            | ⚠️ Medium    | Requires JWT bridge (documented)  |
| **Theme integration**      | ⚠️ Medium    | CSS injection works               |
| **Deep state sharing**     | ⚠️ Complex   | Would need Redis/DB bridge        |

### 10.3 Risk Assessment

| Risk                         | Likelihood | Impact | Mitigation                         |
| ---------------------------- | ---------- | ------ | ---------------------------------- |
| n8n API changes              | Low        | Medium | Pin n8n version                    |
| Gateway RPC changes          | Low        | High   | Version RPC methods                |
| Auth bridge complexity       | Medium     | Medium | Start with API keys, evolve to JWT |
| Performance (many workflows) | Low        | Medium | Queue mode for scaling             |

---

## 11. Success Metrics

| Metric                        | Target                      | Measurement  |
| ----------------------------- | --------------------------- | ------------ |
| **Workflow creation time**    | < 5 min for simple chain    | User testing |
| **Node response time**        | < 2 sec to spawn agent      | Logs         |
| **Uptime**                    | 99%                         | Monitoring   |
| **User adoption**             | 3+ workflows in first month | Usage stats  |
| **Agent utilization via n8n** | 20% of agent calls via n8n  | RPC logs     |

---

## 12. Decision Summary

### The Core Decision

**n8n becomes a trigger layer for your existing Matrix agent system.**

You're not rebuilding agents in n8n. You're giving n8n access to your agents via the same Gateway RPC that Operator1 uses.

### What You Get

| Before                                  | After                                                            |
| --------------------------------------- | ---------------------------------------------------------------- |
| Agents triggered only by Operator1 chat | Agents triggered by anything (GitHub, email, schedule, webhooks) |
| Manual workflow coordination            | Visual workflow builder                                          |
| No external integrations                | 400+ integrations via n8n                                        |
| Separate monitoring                     | Unified view in ui-next                                          |

### The Investment

| Phase                      | Effort  | Value                              |
| -------------------------- | ------- | ---------------------------------- |
| Phase 1 (Custom Node)      | 5 days  | Immediate: Trigger agents from n8n |
| Phase 2 (Webhooks)         | 5 days  | High: Bidirectional automation     |
| Phase 3 (UI Integration)   | 5 days  | High: Seamless experience          |
| Phase 4 (Deep Integration) | 5+ days | Medium: Advanced features          |

**Total: 15 days for full integration (Phases 1-3)**

---

## 13. Open Questions

| #   | Question                  | Options                      | Recommendation                     |
| --- | ------------------------- | ---------------------------- | ---------------------------------- |
| 1   | Start with Docker or npm? | Docker / npm                 | **Docker** — cleaner isolation     |
| 2   | Auth method for Phase 1?  | API key / JWT                | **API key** (simpler), JWT later   |
| 3   | Theme approach?           | CSS injection / custom build | **CSS injection first**            |
| 4   | Node distribution?        | npm package / local          | **Local first**, npm later         |
| 5   | Phase 4 needed?           | Yes / No                     | **Defer** — evaluate after Phase 3 |

---

## 14. Next Steps

1. **Review this document** — Confirm approach
2. **Decide on open questions** — Lock in choices
3. **Start Phase 1** — Deploy n8n, create custom node
4. **Build first workflow** — Code Review Pipeline
5. **Iterate** — Add more workflows based on needs

---

## 15. References

- n8n Docs: https://docs.n8n.io
- n8n Custom Nodes: https://docs.n8n.io/integrations/creating-nodes/
- n8n Node Starter: https://github.com/n8n-io/n8n-nodes-starter
- OpenClaw Gateway RPC: `/docs/reference/gateway/rpc.md`
- Matrix Agent System: `/Project-tasks/matrix-project-context-plan.md`

---

## Appendix A: n8n Environment Variables

```bash
# Required
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http
WEBHOOK_URL=http://localhost:5678/

# Optional
GENERIC_TIMEZONE=Asia/Kolkata
TZ=Asia/Kolkata
N8N_LOG_LEVEL=info
N8N_METRICS=true

# Custom nodes
N8N_CUSTOM_EXTENSIONS=/root/.n8n/custom

# Security (production)
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
```

---

## Appendix B: Gateway RPC Methods for n8n

| Method           | Purpose               | n8n Usage             |
| ---------------- | --------------------- | --------------------- |
| `sessions_spawn` | Spawn agent           | Agent node (primary)  |
| `sessions_send`  | Send message to agent | Interactive workflows |
| `sessions_list`  | List sessions         | Dashboard             |
| `subagents_list` | List subagents        | Monitoring            |
| `agents_list`    | List agents           | Dropdown population   |
| `models_list`    | List models           | Dropdown population   |
| `config_get`     | Get config            | Settings              |
| `memory_search`  | Search memory         | Data lookup           |

---

_Document created by Operator1 (COO) — OpenClaw Matrix_
