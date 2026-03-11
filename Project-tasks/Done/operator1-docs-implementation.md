# Operator1 In-App Docs — Implementation Guide

This document covers the in-app documentation system built inside `ui-next` (the Vite + React control UI). It describes the architecture decisions made, all features implemented, the file inventory, and the optional future path to a standalone Next.js docs site using Fumadocs UI.

---

## Architecture Decision

The docs system uses **fumadocs-core** as a headless library inside the existing Vite + React SPA rather than spinning up a separate Next.js app. This keeps the implementation simple, avoids adding a new runtime, and makes the docs available inside the control UI without leaving it.

| Option                                                       | Decision                                        |
| ------------------------------------------------------------ | ----------------------------------------------- |
| Standalone Next.js docs site (`apps/docs/` with Fumadocs UI) | **Not chosen** — adds runtime, not embedded     |
| Vite-native static site (VitePress / Vocs)                   | **Not chosen** — separate surface               |
| fumadocs-core headless in the existing Vite SPA              | ✅ **Chosen** — docs live inside the control UI |

The public Mintlify docs at `docs.openclaw.ai` (the `docs/` directory) are **untouched** by this implementation.

---

## How It Works

```
docs/operator1/*.md          Raw markdown source (authored here)
         │
         ▼
ui-next/src/lib/docs-content.ts
  import.meta.glob (eager, ?raw)  →  rawBySlug map
  CATEGORY_ORDER config           →  VirtualFile[] array
  fumadocs-core loader()          →  docsSource (getPages, getPage, pageTree)
         │
         ▼
ui-next/src/pages/docs.tsx       Page router + full docs UI
ui-next/src/components/docs/     TOC, search modal
ui-next/src/components/ui/custom/prompt/
  markdown.tsx                   Markdown renderer (headings, links, code)
  code-block.tsx                 Syntax highlighting + Mermaid diagrams
```

### Key packages

| Package            | Role                                             |
| ------------------ | ------------------------------------------------ |
| `fumadocs-core`    | `loader()`, page tree, `getPages()`, `getPage()` |
| `fuse.js`          | Full-text search with fuzzy matching             |
| `shiki`            | Syntax-highlighted code blocks (async, lazy)     |
| `mermaid`          | Mermaid diagram rendering (dynamic import)       |
| `react-router-dom` | Internal SPA navigation from markdown links      |

---

## File Inventory

### Source content

```
docs/operator1/
  index.md              Overview / landing
  architecture.md       System architecture
  agent-hierarchy.md    Agent tier model (T1/T2/T3)
  delegation.md         How tasks flow between tiers
  gateway-patterns.md   Gateway communication patterns
  configuration.md      Config system overview
  agent-configs.md      Per-agent config reference
  memory-system.md      Memory backends and indexing
  rpc.md                Gateway RPC reference
  deployment.md         Deployment and environment setup
  channels.md           Messaging channel setup
  spawning.md           Agent spawning
  agents.md             Agents UI (Browse/Org/Installed/Registries/Health)
  visualize.md          Visualize page (pixel art canvas)
  memory.md             Memory page (index status, files, search, activity log)
  chat.md               Chat page (sessions, input, voice, queue, TTS)
```

### Implementation files

```
ui-next/src/lib/docs-content.ts      Source loader — CATEGORY_ORDER + fumadocs-core loader()
ui-next/src/pages/docs.tsx           Main docs page — search modal, sidebar, content view
ui-next/src/components/docs/
  docs-toc.tsx                       Table of contents with section numbering
ui-next/src/components/ui/custom/prompt/
  markdown.tsx                       Markdown renderer with heading anchors + internal links
  code-block.tsx                     CodeBlock, CodeBlockCode, MermaidBlock, LanguageBadge
```

---

## Category / Sidebar Structure

`CATEGORY_ORDER` in `docs-content.ts` maps virtual folder names to page slugs:

```typescript
const CATEGORY_ORDER = [
  { id: "overview", label: "Overview", pages: ["index"] },
  {
    id: "architecture",
    label: "Architecture",
    pages: ["architecture", "agent-hierarchy", "delegation", "gateway-patterns"],
  },
  {
    id: "configuration",
    label: "Configuration",
    pages: ["configuration", "agent-configs", "memory-system"],
  },
  { id: "operations", label: "Operations", pages: ["rpc", "deployment", "channels", "spawning"] },
  { id: "interface", label: "Interface", pages: ["agents", "visualize", "memory", "chat"] },
];
```

The first page slug in each non-overview category that matches the category ID is mapped to `overview` in the virtual path (e.g., `architecture.md` → `architecture/overview.md`).

**Adding a new page:**

1. Write `docs/operator1/<slug>.md` with a frontmatter `title:` field.
2. Add `'<slug>'` to the appropriate `pages` array in `CATEGORY_ORDER`.

---

## Features Implemented

### 1. Section numbering

Sidebar section folders show a numbered prefix (`1.`, `2.`, …). Pages within sections show two-level numbers (`1.1`, `1.2`, …). Numbers are computed once at module load from the fumadocs page tree in `docs.tsx` (`buildSectionNumbers()`).

TOC items in `docs-toc.tsx` use the same scheme: h2 headings get `N.` and h3 headings get `N.M` via a `useMemo` pass over the heading items.

### 2. Full-text search with highlighting (Cmd+K)

`DocsSearchModal` in `docs.tsx` opens on `Cmd+K` (or `Ctrl+K`). It indexes all docs page content with Fuse.js:

```typescript
new Fuse(allContent, {
  keys: ["title", "content"],
  threshold: 0.6,
  ignoreLocation: true, // critical: without this, matches deep in content score near 0
  includeMatches: true,
  findAllMatches: true,
  minMatchCharLength: 2,
});
```

**Critical config note:** `ignoreLocation: true` is required. The default (`false`) penalizes matches that appear far from the start of the string, causing most content-body matches to return a near-zero score and be filtered out.

Results show a snippet with `<mark>` highlighted matches, extracted via `extractSnippet()` (uses Fuse match indices or `indexOf` fallback). Keyboard navigation: ↑/↓ to move, Enter to navigate, Esc to close.

### 3. Content term highlighting

After navigating to a page, `useContentHighlight` (in `docs.tsx`) uses a DOM `TreeWalker` to walk text nodes in the content div and wrap matched terms in `<mark>` elements. Skips `CODE`, `PRE`, `SCRIPT`, `STYLE`, `MARK` nodes. Previous marks are cleaned up before re-applying. First match scrolls into view.

### 4. Heading deep-link anchors

`AnchorButton` in `markdown.tsx` renders a `#` icon on h2/h3/h4 hover that copies the full deep-link URL to clipboard and flashes `✓` for 1.5 s. Implemented as a `flex items-baseline group/h` wrapper on each heading.

### 5. Internal link routing

The `a` component in `markdown.tsx` checks `href?.startsWith('/')`:

- Internal paths → `<Link>` from `react-router-dom` (SPA navigation, no page reload)
- External URLs → `<a target="_blank" rel="noreferrer">`
- Hash links → plain `<a>` (browser-native scroll)

### 6. Reading progress bar

A 2 px bar at the top of the content column (`scaleX` driven by `readProgress` state). A scroll event listener on `contentRef` computes `scrollTop / (scrollHeight - clientHeight)`.

### 7. Estimated reading time

Word count divided by 200 wpm, shown below the page breadcrumb as `N min read`.

### 8. Breadcrumbs

Computed from the active page's URL segments. Folder segment links back to the section's first page via `<Link>`. Current page name is rendered as plain text.

### 9. Mobile sidebar

A hamburger `Menu` button (visible `< lg`) toggles `mobileSidebarOpen` state. The sidebar renders as a fixed overlay drawer on small screens, closing on navigation or outside click.

### 10. Prev / Next navigation

Links to the previous and next page in the flat `getAllPages()` order appear at the bottom of each page.

### 11. Code block language badge

`LanguageBadge` in `code-block.tsx` renders the language name at `absolute left-3 top-2` in muted monospace. Hidden for `plaintext`, `text`, and empty language strings. Code block top padding increases (`[&>pre]:pt-7`) to clear the badge.

### 12. Mermaid diagrams with dark mode sync

`MermaidBlock` in `code-block.tsx` dynamically imports `mermaid` and re-renders the SVG whenever dark mode changes. A `MutationObserver` on `document.documentElement` detects `class` changes (Tailwind dark mode). Click the diagram to open a zoom modal overlay.

### 13. Feedback widget

A 👍/👎 widget at the bottom of each page persists feedback per page URL in `localStorage`. Does not send data anywhere — purely local.

### 14. Syntax highlighting

`CodeBlockCode` uses `shiki`'s async `codeToHtml()` with the `vitesse-dark` theme. Falls back to a plain `<pre><code>` block until the async highlight resolves.

---

## Search — Troubleshooting

**Symptom:** search returns "No results" for terms that clearly exist in the content.

**Root cause:** two Fuse.js defaults work against content search:

1. `ignoreLocation: false` (default) — scores matches by distance from string start; matches deep in a long doc body score near 0
2. `threshold: 0.35` (too strict) — valid fuzzy matches are filtered out

**Fix already applied:**

```typescript
threshold: 0.6,
ignoreLocation: true,
```

---

## Adding Documentation Pages

1. Create `docs/operator1/<slug>.md` with a YAML frontmatter block:

   ```markdown
   ---
   title: "My Page"
   summary: "One-sentence description."
   ---

   # My Page

   ...
   ```

2. Add `'<slug>'` to the `pages` array of the target category in `CATEGORY_ORDER` inside `ui-next/src/lib/docs-content.ts`.
3. No build step needed — `import.meta.glob` picks up the file automatically in the Vite dev server. For production, rebuild `ui-next`.

---

## Future: Standalone Next.js Docs Site

If a public-facing, SSG-compatible docs site is needed (separate from the control UI), the right approach is a standalone Next.js App Router site using **Fumadocs UI** (not just fumadocs-core). This was the original plan in the fumadocs migration guide.

Key steps at a glance:

```bash
cd apps
pnpm create next-app docs --typescript --tailwind --eslint --app --src-dir
cd docs
pnpm add fumadocs-core fumadocs-mdx fumadocs-ui
```

Required files: `source.config.ts`, `src/lib/source.ts`, `src/app/docs/layout.tsx`, `src/app/docs/[[...slug]]/page.tsx`, `src/app/api/search/route.ts`, `src/mdx-components.tsx`.

> **Do NOT** also install `@mdx-js/loader`, `@mdx-js/react`, or `next-mdx-remote` — they conflict with `fumadocs-mdx`'s own MDX pipeline.

> **Next.js 15+:** `params` in page components is a `Promise` — always `await params` before destructuring.

Content would live in `apps/docs/content/docs/` as `.mdx` files alongside `meta.json` ordering files. The existing `docs/operator1/*.md` source files and `ui-next` in-app viewer would remain unchanged.

---

_Last updated: 2026-03-10_
_Covers: fumadocs-core headless integration, 14 UX enhancements, docs content for Interface section (Agents, Visualize, Memory, Chat)_
