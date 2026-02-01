# Operator UI Rewrite — Project Plan

> **Goal**: Replace the Lit-based control UI with a modern React + shadcn + Tailwind stack, themed with a Matrix aesthetic.

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack Decision](#tech-stack-decision)
3. [Current State Analysis](#current-state-analysis)
4. [Phase 1: Foundation](#phase-1-foundation)
5. [Phase 2: Core Components](#phase-2-core-components)
6. [Phase 3: Pages/Views](#phase-3-pagesviews)
7. [Phase 4: Advanced Features](#phase-4-advanced-features)
8. [Phase 5: Polish & Launch](#phase-5-polish--launch)
9. [Open Questions](#open-questions)

---

## Project Overview

| Aspect | Details |
|--------|---------|
| **Project** | Operator (OpenClaw fork) |
| **Repo** | https://github.com/Interstellar-code/operator |
| **Scope** | Frontend rewrite only (`ui/` folder) |
| **Backend** | Unchanged — Gateway WebSocket API remains the same |
| **Theme** | Matrix-inspired (green on black, terminal aesthetic) |

### Why Rewrite?

- **Lit** → Limited ecosystem, fewer ready-made components
- **shadcn/ui** → Beautiful, customizable, massive community
- **React** → Easier to hire/collaborate, better tooling
- **Tailwind** → Rapid styling, consistent design system

---

## Tech Stack Decision

### Proposed Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Framework** | React 19 | Industry standard, hooks, ecosystem |
| **Bundler** | Vite | Fast, modern, already used in Operator |
| **Styling** | Tailwind CSS | Utility-first, great with shadcn |
| **Components** | shadcn/ui | Copy-paste components, full control |
| **Routing** | React Router 7 | Simple, mature |
| **State** | React Context + hooks | Keep it simple initially |
| **Animations** | Framer Motion | Smooth, declarative |
| **Icons** | Lucide React | Clean, consistent |

### Alternatives Considered

| Option | Verdict |
|--------|---------|
| Next.js | Overkill for SPA dashboard |
| Zustand/Jotai | Maybe later if state gets complex |
| Radix primitives only | shadcn wraps these nicely |

---

## Current State Analysis

### Existing UI Structure (`ui/src/ui/`)

```
ui/src/ui/
├── gateway.ts              # WebSocket client (KEEP/PORT)
├── app.ts                  # Main Lit component
├── views/                  # Page views
│   ├── overview.ts         # Dashboard home
│   ├── chat.ts             # Chat interface
│   ├── sessions.ts         # Session management
│   ├── channels.*.ts       # Channel configs (8+ files)
│   ├── config.ts           # Settings
│   ├── cron.ts             # Scheduled jobs
│   ├── nodes.ts            # Connected devices
│   ├── logs.ts             # Log viewer
│   └── skills.ts           # Skills browser
├── components/             # Reusable components
├── controllers/            # State management
└── types/                  # TypeScript types
```

### Key Integration Points

1. **`gateway.ts`** — WebSocket client to Gateway API
   - Must port this to React hook
   - Handles: connect, auth, events, RPC calls

2. **API Methods** (via WebSocket RPC):
   - `status` — Get gateway status
   - `sessions.list` — List active sessions
   - `sessions.history` — Get chat history
   - `channels.list` — List connected channels
   - `cron.list` — List scheduled jobs
   - `config.get` / `config.set` — Configuration

3. **Events** (pushed from Gateway):
   - `snapshot` — Full state update
   - `session.message` — New chat message
   - `channel.status` — Channel state change

---

## Phase 1: Foundation

### Tasks

- [ ] **1.1** Create new `ui/` folder structure
  - [ ] Initialize Vite + React + TypeScript
  - [ ] Configure Tailwind CSS
  - [ ] Set up path aliases (`@/`)
  - [ ] Configure build output to `dist/control-ui`

- [ ] **1.2** Design System — Matrix Theme
  - [ ] Define color palette (matrix greens, black)
  - [ ] Set up typography (monospace fonts)
  - [ ] Create CSS variables for theming
  - [ ] Add glow effects, animations
  - [ ] Create global styles

- [ ] **1.3** shadcn/ui Setup
  - [ ] Install base dependencies
  - [ ] Create `lib/utils.ts` (cn helper)
  - [ ] Port/create core components:
    - [ ] Button
    - [ ] Input
    - [ ] Card
    - [ ] Dialog
    - [ ] Tabs
    - [ ] ScrollArea
    - [ ] Tooltip

- [ ] **1.4** Gateway Client
  - [ ] Port `gateway.ts` to TypeScript module
  - [ ] Create `useGateway` React hook
  - [ ] Handle reconnection logic
  - [ ] Type all events and responses

### Deliverable
> A working dev environment with Matrix theme, running at `localhost:3000`, connecting to Gateway.

---

## Phase 2: Core Components

### Tasks

- [ ] **2.1** Layout Components
  - [ ] `Shell` — Main app shell with sidebar
  - [ ] `Sidebar` — Navigation menu
  - [ ] `Header` — Top bar with status
  - [ ] `MatrixRain` — Background effect (optional)

- [ ] **2.2** Status Components
  - [ ] `ConnectionStatus` — Online/offline indicator
  - [ ] `StatusCard` — Metric display card
  - [ ] `ChannelBadge` — Channel type indicator

- [ ] **2.3** Data Display
  - [ ] `DataTable` — Sortable, filterable tables
  - [ ] `CodeBlock` — Syntax highlighted code
  - [ ] `JsonViewer` — Collapsible JSON tree
  - [ ] `LogViewer` — Streaming log display

- [ ] **2.4** Form Components
  - [ ] `ConfigForm` — Dynamic form from schema
  - [ ] `SecretInput` — Password with toggle
  - [ ] `Select` — Dropdown with Matrix styling

### Deliverable
> Complete component library, documented with examples.

---

## Phase 3: Pages/Views

### Priority Order

| Priority | Page | Complexity | Notes |
|----------|------|------------|-------|
| P0 | Overview | Medium | Dashboard home, key metrics |
| P0 | Chat | High | Real-time messages, markdown |
| P1 | Sessions | Medium | List, history, status |
| P1 | Channels | High | Multiple channel types |
| P2 | Config | Medium | Dynamic config forms |
| P2 | Cron | Low | Job list, next run |
| P3 | Nodes | Low | Device list |
| P3 | Logs | Medium | Streaming logs |
| P3 | Skills | Low | Skills browser |

### Tasks

- [ ] **3.1** Overview Page
  - [ ] Connection status
  - [ ] Uptime, version info
  - [ ] Session count
  - [ ] Channel statuses
  - [ ] Quick actions

- [ ] **3.2** Chat Page
  - [ ] Message list with virtual scrolling
  - [ ] Markdown rendering
  - [ ] Code block highlighting
  - [ ] Tool call display
  - [ ] Message input

- [ ] **3.3** Sessions Page
  - [ ] Session list with filters
  - [ ] Session details panel
  - [ ] History viewer
  - [ ] Session actions (compact, end)

- [ ] **3.4** Channels Pages
  - [ ] Channel list overview
  - [ ] Per-channel config pages:
    - [ ] WhatsApp
    - [ ] Telegram
    - [ ] Discord
    - [ ] Slack
    - [ ] Signal
    - [ ] iMessage
    - [ ] Google Chat

- [ ] **3.5** Config Page
  - [ ] Config editor
  - [ ] Schema-driven forms
  - [ ] Validation feedback
  - [ ] Save/reset actions

- [ ] **3.6** Cron Page
  - [ ] Job list
  - [ ] Next run times
  - [ ] Job details
  - [ ] Run now action

- [ ] **3.7** Nodes Page
  - [ ] Connected devices list
  - [ ] Device capabilities
  - [ ] Connection status

- [ ] **3.8** Logs Page
  - [ ] Log level filter
  - [ ] Real-time streaming
  - [ ] Search/filter
  - [ ] Clear logs

---

## Phase 4: Advanced Features

### Tasks

- [ ] **4.1** Context Window Display (NEW)
  - [ ] Show token count
  - [ ] Show context window size
  - [ ] Usage percentage bar
  - [ ] Per-session breakdown

- [ ] **4.2** Connection Details (NEW)
  - [ ] WebSocket status
  - [ ] Latency indicator
  - [ ] Reconnection attempts
  - [ ] Last message timestamp

- [ ] **4.3** Model Info Display (NEW)
  - [ ] Current model
  - [ ] Provider status
  - [ ] Token limits
  - [ ] Cost tracking (if available)

- [ ] **4.4** Keyboard Shortcuts
  - [ ] Global shortcuts (Ctrl+K for search)
  - [ ] Page-specific shortcuts
  - [ ] Shortcut help modal

- [ ] **4.5** Responsive Design
  - [ ] Mobile-friendly layout
  - [ ] Collapsible sidebar
  - [ ] Touch-friendly interactions

---

## Phase 5: Polish & Launch

### Tasks

- [ ] **5.1** Performance
  - [ ] Code splitting by route
  - [ ] Lazy load heavy components
  - [ ] Optimize bundle size
  - [ ] Virtual scrolling for long lists

- [ ] **5.2** Testing
  - [ ] Unit tests for components
  - [ ] Integration tests for pages
  - [ ] E2E tests with Playwright

- [ ] **5.3** Documentation
  - [ ] Component storybook (optional)
  - [ ] README for ui folder
  - [ ] Contribution guide

- [ ] **5.4** Build Integration
  - [ ] Update `pnpm ui:build` script
  - [ ] Verify output to `dist/control-ui`
  - [ ] Test with Gateway

- [ ] **5.5** Branding
  - [ ] Update logos/icons
  - [ ] OpenClaw → Operator naming
  - [ ] Favicon
  - [ ] Meta tags

---

## Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Use existing templates or build from scratch? | **TBD** |
| 2 | Keep backward compatibility with old UI? | Probably no |
| 3 | Add authentication UI or rely on tokens? | Check current flow |
| 4 | PWA support needed? | Nice to have |
| 5 | Dark mode only or light mode too? | Matrix = dark only? |
| 6 | Internationalization (i18n)? | Later phase |

---

## Timeline (Rough Estimate)

| Phase | Duration | Notes |
|-------|----------|-------|
| Phase 1 | 2-3 days | Foundation + theme |
| Phase 2 | 3-4 days | Core components |
| Phase 3 | 5-7 days | All pages |
| Phase 4 | 2-3 days | New features |
| Phase 5 | 2-3 days | Polish |
| **Total** | **~2-3 weeks** | With focused effort |

---

## Next Steps

1. **Review this plan** — Add/remove/reprioritize
2. **Answer open questions** — Especially about templates
3. **Start Phase 1** — Foundation setup
4. **Iterate** — Ship incrementally, get feedback

---

*Last updated: 2026-02-01*
