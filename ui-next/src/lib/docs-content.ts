import { loader } from "fumadocs-core/source";
import type { MetaData, PageData } from "fumadocs-core/source";

// Build-time import of all operator1 docs as raw markdown strings
const rawDocs = import.meta.glob("../../../docs/operator1/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

// ── Custom page data (extends fumadocs PageData with raw content) ────────────
export interface DocsPageData extends PageData {
  content: string;
}

// ── Category / ordering definition ──────────────────────────────────────────
// Each entry maps a virtual folder name → { label, ordered page slugs }
const CATEGORY_ORDER: { id: string; label: string; pages: string[] }[] = [
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
  {
    id: "operations",
    label: "Operations",
    pages: ["rpc", "deployment", "channels", "spawning"],
  },
  {
    id: "interface",
    label: "Interface",
    pages: ["agents", "visualize", "memory", "chat"],
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractTitle(content: string): string {
  const fmMatch = content.match(/^---\s*\n[\s\S]*?title:\s*"?([^"\n]+)"?\s*\n[\s\S]*?---/);
  if (fmMatch) {
    return fmMatch[1].trim();
  }
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  return "Untitled";
}

function extractDescription(content: string): string | undefined {
  const fmMatch = content.match(/^---\s*\n[\s\S]*?description:\s*"?([^"\n]+)"?\s*\n[\s\S]*?---/);
  return fmMatch ? fmMatch[1].trim() : undefined;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
}

// slug → raw content string (frontmatter stripped)
const rawBySlug: Record<string, string> = {};
for (const [path, raw] of Object.entries(rawDocs)) {
  const slug = path.split("/").pop()?.replace(/\.md$/, "");
  if (slug) {
    rawBySlug[slug] = raw;
  }
}

// ── Build VirtualFile[] for fumadocs-core loader ─────────────────────────────
// The virtual path determines the URL slug, not the real filesystem path.
// index.md → path='index.md'  → url='/docs'
// architecture.md → path='architecture/overview.md' → url='/docs/architecture/overview'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const files: any[] = [];

// Root meta — defines top-level sections in sidebar order
files.push({
  type: "meta",
  path: "meta.json",
  data: {
    title: "Operator1 Docs",
    pages: ["index", "architecture", "configuration", "operations", "interface"],
  } satisfies MetaData,
});

for (const cat of CATEGORY_ORDER) {
  if (cat.id === "overview") {
    // index page lives at root (no subfolder)
    const raw = rawBySlug["index"] ?? "";
    files.push({
      type: "page",
      path: "index.md",
      data: {
        title: extractTitle(raw) || "Overview",
        description: extractDescription(raw),
        content: stripFrontmatter(raw),
      } satisfies DocsPageData,
    });
  } else {
    // Folder meta — defines page order within this section
    files.push({
      type: "meta",
      path: `${cat.id}/meta.json`,
      data: {
        title: cat.label,
        pages: cat.pages.map((slug) => {
          // The first page in architecture is named 'architecture' in the
          // filesystem but we map it to 'overview' inside the folder.
          if (slug === cat.id) {
            return "overview";
          }
          return slug;
        }),
      } satisfies MetaData,
    });

    for (const slug of cat.pages) {
      const raw = rawBySlug[slug] ?? "";
      // Map e.g. 'architecture' → 'architecture/overview.md'
      const virtualName = slug === cat.id ? "overview" : slug;
      files.push({
        type: "page",
        path: `${cat.id}/${virtualName}.md`,
        data: {
          title: extractTitle(raw) || virtualName,
          description: extractDescription(raw),
          content: stripFrontmatter(raw),
        } satisfies DocsPageData,
      });
    }
  }
}

// ── Source loader ─────────────────────────────────────────────────────────────
export const docsSource = loader({
  baseUrl: "/docs",
  source: { files },
});

// ── Convenience re-exports for the docs page ─────────────────────────────────

/** Flat ordered list of all pages (for prev/next navigation) */
export function getAllPages() {
  return docsSource.getPages();
}

/** Look up a page by its slug array, e.g. [] → index, ['architecture','overview'] */
export function getDocPage(slugs?: string[]) {
  return docsSource.getPage(slugs);
}

/** The page tree for the sidebar */
export const docsPageTree = docsSource.pageTree;
