import { loader } from "fumadocs-core/source";
import type { MetaData } from "fumadocs-core/source";
import type { DocsPageData } from "./docs-content";

// Eager-load all English OpenClaw docs (excluding i18n and operator1)
const rawDocs = import.meta.glob(
  [
    "../../../docs/**/*.md",
    "!../../../docs/zh-CN/**",
    "!../../../docs/ja-JP/**",
    "!../../../docs/operator1/**",
  ],
  { eager: true, query: "?raw", import: "default" },
);

// ── Folder label + sidebar order ──────────────────────────────────────────────
const FOLDER_META: { id: string; label: string }[] = [
  { id: "_root", label: "General" },
  { id: "start", label: "Getting Started" },
  { id: "concepts", label: "Concepts" },
  { id: "install", label: "Installation" },
  { id: "gateway", label: "Gateway" },
  { id: "channels", label: "Channels" },
  { id: "providers", label: "Providers" },
  { id: "tools", label: "Tools" },
  { id: "cli", label: "CLI" },
  { id: "platforms", label: "Platforms" },
  { id: "plugins", label: "Plugins" },
  { id: "automation", label: "Automation" },
  { id: "nodes", label: "Nodes" },
  { id: "help", label: "Help" },
  { id: "web", label: "Web" },
  { id: "security", label: "Security" },
  { id: "reference", label: "Reference" },
  { id: "debug", label: "Debug" },
  { id: "diagnostics", label: "Diagnostics" },
  { id: "design", label: "Design" },
  { id: "refactor", label: "Refactor" },
  { id: "experiments", label: "Experiments" },
];

const FOLDER_LABEL: Record<string, string> = Object.fromEntries(
  FOLDER_META.map((f) => [f.id, f.label]),
);
const FOLDER_ORDER: Record<string, number> = Object.fromEntries(
  FOLDER_META.map((f, i) => [f.id, i]),
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTitle(content: string, fallback: string): string {
  const fmMatch = content.match(/^---\s*\n[\s\S]*?title:\s*"?([^"\n]+)"?\s*\n[\s\S]*?---/);
  if (fmMatch) {
    return fmMatch[1].trim();
  }
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }
  return fallback;
}

function extractDescription(content: string): string | undefined {
  const fmMatch = content.match(/^---\s*\n[\s\S]*?description:\s*"?([^"\n]+)"?\s*\n[\s\S]*?---/);
  return fmMatch ? fmMatch[1].trim() : undefined;
}

function extractUpdated(content: string): string | undefined {
  const fmMatch = content.match(/^---\s*\n[\s\S]*?updated:\s*"?([^"\n]+)"?\s*\n[\s\S]*?---/);
  return fmMatch ? fmMatch[1].trim() : undefined;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
}

function toTitleCase(slug: string): string {
  return slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Parse file paths → folder/slug ───────────────────────────────────────────

interface ParsedFile {
  folder: string; // "channels" | "_root"
  slug: string; // "telegram"
  rawContent: string;
}

const parsedFiles: ParsedFile[] = [];

for (const [importPath, raw] of Object.entries(rawDocs)) {
  // importPath e.g. "../../../docs/channels/telegram.md"
  const docsMatch = importPath.match(/\/docs\/(.+)$/);
  if (!docsMatch) {
    continue;
  }

  const relPath = docsMatch[1]; // "channels/telegram.md"
  const parts = relPath.split("/");

  // Skip deeply nested (> 2 levels) for now
  if (parts.length > 2) {
    continue;
  }

  let folder: string;
  let slug: string;

  if (parts.length === 1) {
    folder = "_root";
    slug = parts[0].replace(/\.md$/, "");
  } else {
    folder = parts[0];
    slug = parts[1].replace(/\.md$/, "");
  }

  parsedFiles.push({ folder, slug, rawContent: raw });
}

// ── Group by folder and sort ──────────────────────────────────────────────────

const byFolder = new Map<string, ParsedFile[]>();
for (const f of parsedFiles) {
  if (!byFolder.has(f.folder)) {
    byFolder.set(f.folder, []);
  }
  byFolder.get(f.folder)!.push(f);
}

const sortedFolders = [...byFolder.keys()].toSorted((a, b) => {
  const oa = FOLDER_ORDER[a] ?? 999;
  const ob = FOLDER_ORDER[b] ?? 999;
  if (oa !== ob) {
    return oa - ob;
  }
  return a.localeCompare(b);
});

for (const files of byFolder.values()) {
  files.sort((a, b) => {
    if (a.slug === "index") {
      return -1;
    }
    if (b.slug === "index") {
      return 1;
    }
    return a.slug.localeCompare(b.slug);
  });
}

// ── Build fumadocs virtual files ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const files: any[] = [];

// Root meta — top-level folder list (exclude _root as a section)
const sectionIds = sortedFolders.filter((f) => f !== "_root");
files.push({
  type: "meta",
  path: "meta.json",
  data: { title: "OpenClaw Docs", pages: sectionIds } satisfies MetaData,
});

// Root-level pages (e.g. docs/index.md, docs/pi.md)
for (const f of byFolder.get("_root") ?? []) {
  const title = extractTitle(f.rawContent, toTitleCase(f.slug));
  files.push({
    type: "page",
    path: `${f.slug}.md`,
    data: {
      title,
      description: extractDescription(f.rawContent),
      content: stripFrontmatter(f.rawContent),
      updated: extractUpdated(f.rawContent),
    } satisfies DocsPageData,
  });
}

// Folder sections
for (const folder of sectionIds) {
  const folderFiles = byFolder.get(folder) ?? [];
  const label = FOLDER_LABEL[folder] ?? toTitleCase(folder);

  files.push({
    type: "meta",
    path: `${folder}/meta.json`,
    data: {
      title: label,
      pages: folderFiles.map((f) => (f.slug === folder ? "index" : f.slug)),
    } satisfies MetaData,
  });

  for (const f of folderFiles) {
    const title = extractTitle(f.rawContent, toTitleCase(f.slug));
    const virtualName = f.slug === folder ? "index" : f.slug;
    files.push({
      type: "page",
      path: `${folder}/${virtualName}.md`,
      data: {
        title,
        description: extractDescription(f.rawContent),
        content: stripFrontmatter(f.rawContent),
        updated: extractUpdated(f.rawContent),
      } satisfies DocsPageData,
    });
  }
}

// ── Source loader ─────────────────────────────────────────────────────────────

export const openclawDocsSource = loader({
  baseUrl: "/openclaw-docs",
  source: { files },
});

export function getAllOpenClawPages() {
  return openclawDocsSource.getPages();
}

export function getOpenClawDocPage(slugs?: string[]) {
  return openclawDocsSource.getPage(slugs);
}

export const openclawDocsPageTree = openclawDocsSource.pageTree;
