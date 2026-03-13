---
# -- Dart AI metadata ----------------------------------------------------------
title: "Agent Personas & Skills Marketplace"
description: "Adapt agency-agents templates into operator1 skills, subagent personas, and a curated marketplace"
dartboard: "Operator1/Tasks"
type: Project
status: "To-do"
priority: medium
assignee: "rohit sharma"
tags: [feature, agents, skills, marketplace]
startAt:
dueAt:
dart_project_id:
# -------------------------------------------------------------------------------
---

# Agent Personas & Skills Marketplace

**Created:** 2026-03-13
**Status:** Planning — superseded by `Project-tasks/operator1hub.md`
**Depends on:** Slash commands infrastructure (done), Skills system (done)
**Source repo:** https://github.com/msitarzewski/agency-agents (MIT, 38.9k stars)

> **Note:** Persona content and marketplace delivery are now tracked under
> [Operator1Hub](operator1hub.md). This doc remains as reference for the
> persona format design and agency-agents source mapping.

---

## 1. Overview

Leverage the open-source agency-agents repository (130+ specialized AI agent
personality templates) to enrich operator1's skills and subagent system. The
goal is to give users ready-made, domain-specific agent personas they can
activate via skills, SOUL.md templates, or a future marketplace UI — turning
operator1 from a generic assistant into a team of specialists.

---

## 2. Goals

- Provide ready-made agent personas users can activate without writing prompts
- Expand the skills library with domain-expert workflows (security, code review, DevOps, etc.)
- Enable specialized subagents that inherit role-specific knowledge
- Lay groundwork for a skills/agents marketplace in the UI

## 3. Out of Scope

- Non-engineering personas (marketing, sales, paid media) — defer unless user demand
- Upstream contributions back to agency-agents
- Paid/premium marketplace tier
- Multi-agent orchestration redesign (current subagent system is sufficient)

---

## 4. Design Decisions

| Decision           | Options Considered                                             | Chosen                                    | Reason                                                                                                     |
| ------------------ | -------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Persona format     | Raw markdown drop-in / SKILL.md conversion / SOUL.md templates | SKILL.md conversion + SOUL.md templates   | Skills integrate with existing `skills.list`/`skills.invoke`; SOUL.md gives project-level persona override |
| Persona storage    | Bundled in repo / User-installed / Gateway seeds               | Gateway seeds + user-installable          | Seeds ship defaults; users can add/override in workspace                                                   |
| Subagent injection | System prompt append / Tool context / Dedicated persona field  | System prompt append via persona fragment | Minimal change — `buildAgentSystemPrompt()` already supports workspace context injection                   |
| Marketplace UI     | Separate page / Integrated in skills page / CLI only           | Skills page with "Install" action         | Builds on existing `ui-next/src/pages/skills.tsx`                                                          |

---

## 5. Technical Spec

### 5.1 Persona File Format

Adapt agency-agents markdown structure into operator1's SKILL.md convention:

```markdown
# Security Engineer

> Specialized agent persona for security-focused code review and threat analysis.

## Identity

- Role: Application Security Engineer
- Focus: OWASP Top 10, dependency auditing, secrets detection
- Communication: Direct, evidence-based, cites CWE/CVE IDs

## Critical Rules

- Never approve code with unvalidated user input in SQL/shell/eval
- Flag all hardcoded secrets, even in tests
- Require CSP headers on all web responses

## Workflow

1. Scan changed files for security patterns
2. Check dependencies against known CVEs
3. Review auth/authz boundaries
4. Report findings with severity + remediation

## Deliverables

- Security review summary (pass/fail + findings)
- Remediation suggestions with code examples
```

### 5.2 Subagent Persona Injection

In `buildAgentSystemPrompt()`, when a subagent is spawned with a `persona` parameter,
append the persona content to the `"minimal"` system prompt. This lets callers do:

```
sessions_spawn(runtime="subagent", persona="security-engineer")
```

### 5.3 Seed Personas (Priority List)

From agency-agents engineering division, adapt these first:

| Persona             | Source File                          | Use Case                           |
| ------------------- | ------------------------------------ | ---------------------------------- |
| Code Reviewer       | `engineering/code-reviewer.md`       | PR review, code quality            |
| Security Engineer   | `engineering/security-engineer.md`   | Security audit, vuln scan          |
| Database Optimizer  | `engineering/database-optimizer.md`  | Query optimization, schema review  |
| DevOps Automator    | `engineering/devops-automator.md`    | CI/CD, infra automation            |
| Software Architect  | `engineering/software-architect.md`  | System design, architecture review |
| SRE                 | `engineering/sre.md`                 | Reliability, incident response     |
| Technical Writer    | `engineering/technical-writer.md`    | Docs, API documentation            |
| Git Workflow Master | `engineering/git-workflow-master.md` | Git strategy, branch management    |

### 5.4 Marketplace UI (Future)

Extend `ui-next/src/pages/skills.tsx` with:

- Browse available personas (bundled + community)
- Install/uninstall to workspace
- Preview persona details before installing
- "Active persona" indicator in chat header

---

## 6. Implementation Plan

### Task 1: Phase 1 — Persona Format & Conversion

**Status:** To-do | **Priority:** High | **Assignee:** rohit sharma | **Est:** 4h

Define the operator1 persona file format and convert the top 8 agency-agents
templates into operator1 skills. See §5.1 and §5.3.

- [ ] 1.1 Define persona SKILL.md format — standardize frontmatter, sections (identity, rules, workflow, deliverables)
- [ ] 1.2 Convert 8 seed personas — adapt from agency-agents engineering division into operator1 format
- [ ] 1.3 Add persona files to gateway seeds — store in `src/gateway/seeds/personas/` for default availability
- [ ] 1.4 Register personas in skills.list — ensure they appear in `/skills` and autocomplete

### Task 2: Phase 2 — SOUL.md Templates & Subagent Personas

**Status:** To-do | **Priority:** High | **Assignee:** rohit sharma | **Est:** 3h

Enable personas as SOUL.md workspace templates and as subagent specialization.
See §5.2.

- [ ] 2.1 SOUL.md template system — let users drop a persona file as SOUL.md to set project-wide agent behavior
- [ ] 2.2 Subagent persona parameter — extend `sessions_spawn` to accept `persona` and inject into minimal system prompt
- [ ] 2.3 Persona resolution — resolve persona by name from seeds or workspace, with workspace overriding seeds
- [ ] 2.4 Test persona injection — verify subagent inherits persona context and behaves according to role

### Task 3: Phase 3 — Skills Page Marketplace

**Status:** To-do | **Priority:** Medium | **Assignee:** rohit sharma | **Est:** 5h

Add a browsable personas section to the skills UI page. See §5.4.

- [ ] 3.1 Personas listing API — add `personas.list` RPC returning available personas with metadata
- [ ] 3.2 Persona install/uninstall — API + UI to activate/deactivate personas in current workspace
- [ ] 3.3 Skills page UI update — add "Agent Personas" section to skills page with cards, preview, install button
- [ ] 3.4 Active persona indicator — show current persona in chat header when one is active

### Task 4: Phase 4 — Community Personas & Expansion

**Status:** To-do | **Priority:** Low | **Assignee:** rohit sharma | **Est:** 3h

Enable user-contributed personas and expand beyond engineering.

- [ ] 4.1 User persona authoring — docs + CLI command to create custom persona from template
- [ ] 4.2 Persona sharing format — define exportable persona format for community sharing
- [ ] 4.3 Expand to design/testing — convert agency-agents design + testing division personas if demand exists

---

## 7. References

- Source repo: https://github.com/msitarzewski/agency-agents
- Key source files:
  - `src/agents/system-prompt.ts` — system prompt builder, persona injection point
  - `src/agents/tools/memory-tool.ts` — memory tools (personas may reference memory)
  - `src/auto-reply/reply/commands-core.ts` — command/skill handler pipeline
  - `src/gateway/seeds/` — seed data directory
  - `ui-next/src/pages/skills.tsx` — skills UI page (marketplace target)
- Dart project: _(filled after first sync)_

---

_Template version: 1.0_
