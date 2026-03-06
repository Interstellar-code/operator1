# Agentic Framework Research Report

## For: Legal Platform (India-focused SaaS + AI)

**Date:** 2026-03-06
**Purpose:** Research lightweight agentic frameworks similar to OpenClaw for legal platform integration

---

## Executive Summary

Researched 15+ agentic frameworks and OpenClaw forks. Found **3 high-relevance categories**:

1. **OpenClaw-native extensions** — Best fit, minimal learning curve
2. **Lightweight multi-agent frameworks** — Good alternatives
3. **Enterprise frameworks** — Overkill but feature-rich

**Top Recommendations:**

1. **Edict (三省六部)** — OpenClaw-native multi-agent with dashboard
2. **PraisonAI** — Python, low-code, multi-agent
3. **AgentKit (Inngest)** — TypeScript, MCP support, deterministic routing

---

## Category 1: OpenClaw-Native Extensions

### 1. Edict (三省六部) ⭐ TOP PICK

**GitHub:** https://github.com/cft0808/edict

| Aspect           | Details                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------- |
| **What**         | OpenClaw Multi-Agent Orchestration System based on ancient Chinese government structure |
| **Agents**       | 12 specialized AI agents (11 business + 1 compatibility)                                |
| **Architecture** | 太子分拣 → 中书省规划 → 门下省审核 → 尚书省派发 → 六部执行                              |
| **Tech**         | Python, React 18, OpenClaw Gateway                                                      |
| **Key Feature**  | Real-time dashboard with Kanban, audit trails, model config per agent                   |

**Why it fits:**

- ✅ Built specifically for OpenClaw
- ✅ Has real-time dashboard (exactly what you need for legal platform)
- ✅ Audit trails (critical for legal work)
- ✅ Per-agent model configuration
- ✅ Docker one-line install: `docker run -p 7891:7891 cft0808/edict`

**Unique value:** "门下省审核" (quality checkpoint) — every task goes through mandatory review before execution. Perfect for legal accuracy.

---

### 2. ZeroClaw-Android

**GitHub:** https://github.com/Natfii/ZeroClaw-Android

| Aspect          | Details                                              |
| --------------- | ---------------------------------------------------- |
| **What**        | Run AI agents 24/7 on Android phone                  |
| **Tech**        | Kotlin, Rust core                                    |
| **Providers**   | 25+ (OpenAI, Claude, Gemini, Groq, DeepSeek, Ollama) |
| **Key Feature** | Self-hosted alternative to Mac Mini setups           |

**Why consider:** If you want mobile-first legal assistant capability

---

### 3. TinyClaw

**GitHub:** https://github.com/warengonzaga/tinyclaw

| Aspect          | Details                         |
| --------------- | ------------------------------- |
| **What**        | Minimal autonomous AI companion |
| **Tech**        | TypeScript                      |
| **Key Feature** | Lightweight, personal AI        |

---

## Category 2: Lightweight Multi-Agent Frameworks

### 4. PraisonAI ⭐ RECOMMENDED

**GitHub:** https://github.com/MervinPraison/PraisonAI

| Aspect           | Details                                              |
| ---------------- | ---------------------------------------------------- |
| **What**         | Production-ready Multi AI Agents framework           |
| **Tech**         | Python                                               |
| **Approach**     | Low-code solution for multi-agent LLM systems        |
| **Key Features** | Simplicity, customization, human-agent collaboration |

**Why it fits:**

- ✅ Low-code = faster development
- ✅ Production-ready
- ✅ Multi-agent collaboration
- ✅ Easy customization

---

### 5. AgentKit (Inngest) ⭐ RECOMMENDED

**GitHub:** https://github.com/inngest/agent-kit

| Aspect           | Details                                          |
| ---------------- | ------------------------------------------------ |
| **What**         | Multi-agent networks with deterministic routing  |
| **Tech**         | TypeScript                                       |
| **Key Features** | MCP support, state-based routing, fault-tolerant |

**Why it fits:**

- ✅ TypeScript (matches your SaaS stack)
- ✅ MCP support for rich tooling
- ✅ Deterministic routing = predictable behavior
- ✅ Built-in tracing for debugging

**Code example:**

```typescript
import { createAgent, createNetwork } from "@inngest/agent-kit";

const legalAgent = createAgent({
  name: "legal-advisor",
  system: "You are an Indian legal expert...",
  mcpServers: [{ name: "legal-db", ... }]
});
```

---

### 6. IntentKit

**GitHub:** https://github.com/crestalnetwork/intentkit

| Aspect                  | Details                                                      |
| ----------------------- | ------------------------------------------------------------ |
| **What**                | Self-hosted cloud agent cluster                              |
| **Tech**                | Python                                                       |
| **Explicit comparison** | "Local-First (e.g., OpenClaw)" vs "Cloud-Native (IntentKit)" |

**Key insight:** They explicitly position themselves as cloud-native alternative to OpenClaw.

**Features:**

- ☁️ Cloud-native (no local hardware)
- 🤖 Collaborative multi-agent
- 🔗 Crypto/Web3 friendly
- 🐦 Social media integration

---

### 7. DeerFlow (ByteDance) ⭐ FEATURE-RICH

**GitHub:** https://github.com/bytedance/deer-flow

| Aspect           | Details                                                    |
| ---------------- | ---------------------------------------------------------- |
| **What**         | SuperAgent harness with sandboxes, memories, tools, skills |
| **Tech**         | Python, LangGraph, LangChain                               |
| **Key Features** | Sub-agent spawning, progressive skill loading, MCP support |

**Why consider:**

- ✅ Mature (ByteDance backing)
- ✅ Skills system (like OpenClaw)
- ✅ Sandbox execution
- ✅ Long-term memory

---

### 8. AG2 (formerly AutoGen)

**GitHub:** https://github.com/ag2ai/ag2

| Aspect           | Details                                              |
| ---------------- | ---------------------------------------------------- |
| **What**         | Open-Source AgentOS                                  |
| **Tech**         | Python                                               |
| **Key Features** | Conversable agents, group chats, swarm orchestration |

**Why consider:**

- ✅ Mature, widely adopted
- ✅ Rich documentation
- ✅ Microsoft ecosystem (originally)

---

### 9. Ruflo

**GitHub:** https://github.com/ruvnet/ruflo

| Aspect           | Details                                                      |
| ---------------- | ------------------------------------------------------------ |
| **What**         | Agent orchestration platform for Claude                      |
| **Tech**         | TypeScript                                                   |
| **Key Features** | Multi-agent swarms, RAG integration, Claude Code integration |

---

## Category 3: Enterprise Frameworks (Overkill but Powerful)

### 10. MetaGPT

**GitHub:** https://github.com/FoundationAgents/MetaGPT

| Aspect           | Details                                           |
| ---------------- | ------------------------------------------------- |
| **What**         | "First AI Software Company"                       |
| **Tech**         | Python                                            |
| **Key Features** | Product managers, architects, engineers as agents |

**Why it's overkill:** Designed to build software companies, not domain-specific assistants

---

### 11. Microsoft Agent Framework

**GitHub:** https://github.com/microsoft/agent-framework

| Aspect           | Details                               |
| ---------------- | ------------------------------------- |
| **What**         | Enterprise multi-language framework   |
| **Tech**         | Python + .NET                         |
| **Key Features** | Graph workflows, OpenTelemetry, DevUI |

**Why it's overkill:** Enterprise-focused, complex setup

---

## Comparison Matrix

| Framework     | Language     | Multi-Agent  | Skills | Config-Driven | Dashboard | Best For         |
| ------------- | ------------ | ------------ | ------ | ------------- | --------- | ---------------- |
| **Edict**     | Python+React | ✅ 12 agents | ✅     | ✅            | ✅ Full   | OpenClaw users   |
| **PraisonAI** | Python       | ✅           | ✅     | ✅            | ⚠️ Basic  | Low-code dev     |
| **AgentKit**  | TypeScript   | ✅           | ✅ MCP | ✅            | ❌        | TypeScript shops |
| **IntentKit** | Python       | ✅           | ✅     | ✅            | ❌        | Cloud-native     |
| **DeerFlow**  | Python       | ✅           | ✅     | ✅            | ⚠️        | Heavy tasks      |
| **AG2**       | Python       | ✅           | ⚠️     | ✅            | ❌        | Research         |

---

## Recommendations for Legal Platform

### Option A: Edict (OpenClaw-native) ⭐ BEST FIT

**Why:**

1. Already built for OpenClaw ecosystem
2. Has real-time dashboard (critical for legal SaaS)
3. Audit trails built-in (legal compliance)
4. Quality checkpoint (门下省) = accuracy for legal advice
5. Per-agent model config (different agents for different legal domains)

**Approach:**

1. Fork Edict
2. Replace "government" roles with legal roles:
   - 太子 → Intake Agent (triage)
   - 中书省 → Case Research Agent
   - 门下省 → Legal Review Agent (quality check)
   - 尚书省 → Dispatch Agent
   - 六部 → Specialized legal domains (Corporate, Criminal, Civil, IP, etc.)
3. Add Indian legal system skills
4. Integrate with SaaS frontend

---

### Option B: AgentKit + Custom Dashboard

**Why:**

1. TypeScript matches modern SaaS stack
2. MCP support for legal tools integration
3. Deterministic routing = reliable legal workflows
4. Build custom dashboard

**Approach:**

1. Use AgentKit for agent orchestration
2. Build legal-specific agents
3. Create custom React dashboard
4. Integrate with SaaS backend

---

### Option C: PraisonAI (Fastest to Start)

**Why:**

1. Low-code = fastest prototyping
2. Production-ready
3. Python ecosystem

---

## Implementation Considerations

### For Legal Platform

| Requirement    | Edict          | AgentKit  | PraisonAI   |
| -------------- | -------------- | --------- | ----------- |
| Quick start    | ✅ Docker      | ⚠️ Setup  | ✅ Low-code |
| Custom roles   | ✅ Config      | ✅ Code   | ✅ Config   |
| Dashboard      | ✅ Built-in    | ❌ Build  | ⚠️ Basic    |
| Audit trails   | ✅ Built-in    | ⚠️ Custom | ⚠️ Custom   |
| Legal accuracy | ✅ Review step | ⚠️ Custom | ⚠️ Custom   |
| India-specific | ⚠️ Skills      | ⚠️ Skills | ⚠️ Skills   |

---

## Skills to Build for Legal Platform

Regardless of framework choice, you'll need:

1. **Indian Legal Database** — IPC, CrPC, CPC, company law, case law
2. **Document Templates** — Legal notices, contracts, petitions
3. **Case Management** — Client intake, case tracking, deadlines
4. **Research Agent** — Case law search, precedent analysis
5. **Compliance Checker** — Regulatory requirements

---

## Next Steps

1. **Evaluate Edict** — Run `docker run -p 7891:7891 cft0808/edict`
2. **Define legal agent roles** — Map to your business model
3. **Identify skill gaps** — What legal capabilities need custom development
4. **Choose integration approach** — Fork Edict vs build fresh with AgentKit

---

## References

- Edict: https://github.com/cft0808/edict
- PraisonAI: https://github.com/MervinPraison/PraisonAI
- AgentKit: https://github.com/inngest/agent-kit
- IntentKit: https://github.com/crestalnetwork/intentkit
- DeerFlow: https://github.com/bytedance/deer-flow
- AG2: https://github.com/ag2ai/ag2
- MetaGPT: https://github.com/FoundationAgents/MetaGPT
- Microsoft Agent Framework: https://github.com/microsoft/agent-framework
- OpenClaw: https://github.com/openclaw/openclaw

---

_Report compiled by Operator1 | Research completed: 2026-03-06_
