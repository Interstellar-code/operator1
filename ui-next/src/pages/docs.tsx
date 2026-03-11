import type { Folder as TreeFolder, Node as TreeNode } from "fumadocs-core/page-tree";
import type { FuseResultMatch } from "fuse.js";
import Fuse from "fuse.js";
import { BookOpen, ChevronRight, Menu, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { DocsPagination } from "@/components/docs/docs-pagination";
import { DocsToc, parseTocItems } from "@/components/docs/docs-toc";
import { Markdown } from "@/components/ui/custom/prompt/markdown";
import { Input } from "@/components/ui/input";
import { getAllPages, getDocPage, docsPageTree, type DocsPageData } from "@/lib/docs-content";
import { cn } from "@/lib/utils";

// ── Fuse full-text search index (built once at module load) ─────────────────
const allPages = getAllPages();

const fuse = new Fuse(allPages, {
  keys: [
    { name: "data.title", weight: 3 },
    { name: "data.content", weight: 1 },
  ],
  threshold: 0.6,
  includeScore: true,
  includeMatches: true,
  findAllMatches: true,
  minMatchCharLength: 2,
  ignoreLocation: true,
});

// ── T1: section numbers for sidebar (computed once from page tree) ────────────
function buildSectionNumbers() {
  const pageNums = new Map<string, string>(); // page url -> "1.1"
  const folderNums = new Map<string, string>(); // folder name -> "1"
  let sectionIdx = 0;
  for (const node of docsPageTree.children) {
    if (node.type !== "folder") {
      continue;
    }
    sectionIdx++;
    folderNums.set((node.name as string) ?? "", String(sectionIdx));
    let pageIdx = 0;
    for (const child of node.children) {
      if (child.type === "page") {
        pageIdx++;
        pageNums.set(child.url, `${sectionIdx}.${pageIdx}`);
      }
    }
  }
  return { pageNums, folderNums };
}
const { pageNums, folderNums } = buildSectionNumbers();

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSnippet(
  content: string,
  matches: ReadonlyArray<FuseResultMatch> | undefined,
  term: string,
): string {
  const contentMatch = matches?.find((m) => m.key === "data.content");
  const idx = contentMatch?.indices?.[0]?.[0] ?? content.toLowerCase().indexOf(term.toLowerCase());
  if (idx !== -1 && idx !== undefined) {
    const start = Math.max(0, idx - 30);
    const end = Math.min(content.length, idx + 110);
    return (
      (start > 0 ? "…" : "") +
      content.slice(start, end).replace(/\n+/g, " ") +
      (end < content.length ? "…" : "")
    );
  }
  return content.slice(0, 120).replace(/\n+/g, " ") + (content.length > 120 ? "…" : "");
}

function HighlightText({ text, term }: { text: string; term: string }) {
  if (!term.trim()) {
    return <>{text}</>;
  }
  const re = new RegExp(`(${escapeRegex(term)})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="bg-primary/25 text-primary rounded-sm px-0.5 not-italic">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** DOM-based text highlight applied after Markdown renders */
function useContentHighlight(
  containerRef: React.RefObject<HTMLElement | null>,
  term: string,
  pageUrl: string,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Remove previous marks
    container.querySelectorAll("mark.docs-hl").forEach((m) => {
      const p = m.parentNode;
      if (p) {
        p.replaceChild(document.createTextNode(m.textContent ?? ""), m);
        p.normalize();
      }
    });

    if (!term.trim()) {
      return;
    }

    const SKIP = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "MARK", "TEXTAREA"]);
    const regex = new RegExp(escapeRegex(term), "gi");

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el && el !== container) {
          if (SKIP.has(el.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          el = el.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) {
      textNodes.push(n as Text);
    }

    for (const textNode of textNodes) {
      const text = textNode.textContent ?? "";
      if (!regex.test(text)) {
        regex.lastIndex = 0;
        continue;
      }
      regex.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        if (m.index > last) {
          frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        }
        const mark = document.createElement("mark");
        mark.className = "docs-hl bg-primary/25 text-primary rounded-sm";
        mark.textContent = m[0];
        frag.appendChild(mark);
        last = m.index + m[0].length;
      }
      if (last < text.length) {
        frag.appendChild(document.createTextNode(text.slice(last)));
      }
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    container
      .querySelector<HTMLElement>("mark.docs-hl")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [term, pageUrl]);
}

// ── T4: Cmd+K search modal ────────────────────────────────────────────────────

function DocsSearchModal({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (url: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!query.trim()) {
      return allPages.slice(0, 6).map((p) => ({ item: p, matches: undefined }));
    }
    return fuse.search(query).slice(0, 8);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [results]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && results[selectedIdx]) {
      onNavigate(results[selectedIdx].item.url);
      onClose();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documentation…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="py-1.5 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-muted-foreground">No results</p>
          ) : (
            results.map((r, i) => {
              const content = (r.item.data as DocsPageData).content ?? "";
              const snippet = query.trim()
                ? extractSnippet(content, r.matches, query)
                : content.slice(0, 100).replace(/\n+/g, " ") + "…";
              return (
                <button
                  key={r.item.url}
                  onClick={() => {
                    onNavigate(r.item.url);
                    onClose();
                  }}
                  className={cn(
                    "w-full text-left px-4 py-2.5 flex flex-col gap-0.5 transition-colors",
                    i === selectedIdx ? "bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <span className="text-sm font-medium text-foreground">
                    <HighlightText text={r.item.data.title ?? ""} term={query} />
                  </span>
                  <span className="text-[11px] text-muted-foreground line-clamp-1">
                    <HighlightText text={snippet} term={query} />
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-[10px] text-muted-foreground">
          <span>
            <kbd className="border border-border rounded px-1 font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="border border-border rounded px-1 font-mono">↵</kbd> open
          </span>
          <span className="ml-auto">⌘K to close</span>
        </div>
      </div>
    </div>
  );
}

// ── T11: "Was this helpful?" feedback widget ──────────────────────────────────

function FeedbackWidget({ pageUrl }: { pageUrl: string }) {
  const key = `docs-feedback:${pageUrl}`;
  const [vote, setVote] = useState<"up" | "down" | null>(
    () => localStorage.getItem(key) as "up" | "down" | null,
  );

  // Reset when page changes
  useEffect(() => {
    setVote(localStorage.getItem(key) as "up" | "down" | null);
  }, [key]);

  const handleVote = (v: "up" | "down") => {
    localStorage.setItem(key, v);
    setVote(v);
  };

  return (
    <div className="flex items-center gap-3 mt-8 pt-5 border-t border-border text-xs text-muted-foreground">
      <span>Was this helpful?</span>
      <button
        onClick={() => handleVote("up")}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded-md border border-border transition-colors hover:bg-muted",
          vote === "up" && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        👍 Yes
      </button>
      <button
        onClick={() => handleVote("down")}
        className={cn(
          "flex items-center gap-1 px-2.5 py-1 rounded-md border border-border transition-colors hover:bg-muted",
          vote === "down" && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        👎 No
      </button>
      {vote && <span className="text-primary text-xs ml-1">Thanks for your feedback!</span>}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function renderTreeNode(node: TreeNode, activeUrl: string, search: string): React.ReactNode {
  if (node.type === "separator") {
    return (
      <div
        key={node.$id ?? (node.name as string) ?? ""}
        className="px-2 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
      >
        {node.name}
      </div>
    );
  }

  if (node.type === "folder") {
    return (
      <FolderNode
        key={node.$id ?? (node.name as string) ?? ""}
        node={node}
        activeUrl={activeUrl}
        search={search}
      />
    );
  }

  // page node — show section number prefix (T1)
  const num = pageNums.get(node.url);
  return (
    <NavLink
      key={node.url}
      to={node.url}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 text-xs rounded-md transition-colors",
        activeUrl === node.url
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted",
      )}
    >
      {num && (
        <span className="font-mono text-[10px] tabular-nums shrink-0 w-6 text-primary/40">
          {num}
        </span>
      )}
      <span className="truncate">{node.name}</span>
    </NavLink>
  );
}

function FolderNode({
  node,
  activeUrl,
  search,
}: {
  node: TreeFolder;
  activeUrl: string;
  search: string;
}) {
  const hasActiveChild = useMemo(
    () => flattenFolder(node).some((n) => n.type === "page" && n.url === activeUrl),
    [node, activeUrl],
  );
  const [open, setOpen] = useState(hasActiveChild || search.trim().length > 0);

  const prevSearch = useRef(search);
  if (prevSearch.current !== search) {
    prevSearch.current = search;
    if (search.trim().length > 0 && !open) {
      setOpen(true);
    }
  }

  // T1: section number for this folder
  const sectionNum = folderNums.get((node.name as string) ?? "");

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-md"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 transition-transform duration-200", open && "rotate-90")}
        />
        {sectionNum && (
          <span className="font-mono text-[10px] text-primary/40 tabular-nums shrink-0">
            {sectionNum}.
          </span>
        )}
        {node.name}
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 ml-4">
          {node.children.map((child) => renderTreeNode(child, activeUrl, search))}
        </div>
      )}
    </div>
  );
}

function flattenFolder(node: TreeFolder): TreeNode[] {
  const result: TreeNode[] = [];
  for (const child of node.children) {
    result.push(child);
    if (child.type === "folder") {
      result.push(...flattenFolder(child));
    }
  }
  return result;
}

function DocsSidebar({
  activeUrl,
  search,
  onSearchChange,
  onResultClick,
}: {
  activeUrl: string;
  search: string;
  onSearchChange: (v: string) => void;
  onResultClick: (term: string) => void;
}) {
  const searchResults = useMemo(() => {
    if (!search.trim()) {
      return null;
    }
    return fuse.search(search);
  }, [search]);

  return (
    <div className="flex flex-col gap-2 w-56 shrink-0 border-r border-border pr-4">
      <Input
        placeholder="Search docs…"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="h-8 text-xs"
      />
      <nav className="flex flex-col gap-0.5 mt-1">
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">No results</p>
          ) : (
            searchResults.map((result) => {
              const page = result.item;
              const content = (page.data as DocsPageData).content ?? "";
              const snippet = extractSnippet(content, result.matches, search);
              return (
                <NavLink
                  key={page.url}
                  to={page.url}
                  onClick={() => {
                    onResultClick(search);
                    onSearchChange("");
                  }}
                  className={cn(
                    "flex flex-col px-2 py-1.5 text-xs rounded-md transition-colors gap-0.5",
                    activeUrl === page.url
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  <span className="font-medium text-foreground">
                    <HighlightText text={page.data.title ?? ""} term={search} />
                  </span>
                  <span className="text-[0.7rem] leading-relaxed text-muted-foreground line-clamp-2">
                    <HighlightText text={snippet} term={search} />
                  </span>
                </NavLink>
              );
            })
          )
        ) : (
          docsPageTree.children.map((node) => renderTreeNode(node, activeUrl, search))
        )}
      </nav>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function DocsPage() {
  const params = useParams<{ "*": string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [highlightTerm, setHighlightTerm] = useState("");
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [readProgress, setReadProgress] = useState(0);
  const articleRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const slug = params["*"];
  const slugParts = slug ? slug.split("/").filter(Boolean) : [];
  const page = getDocPage(slugParts.length === 0 ? undefined : slugParts);

  const handleResultClick = useCallback((term: string) => {
    setHighlightTerm(term);
  }, []);

  // T4: global Cmd+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchModalOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // T5: reading progress
  useEffect(() => {
    const el = contentRef.current;
    if (!el) {
      return;
    }
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const total = scrollHeight - clientHeight;
      setReadProgress(total > 0 ? (scrollTop / total) * 100 : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [page?.url]);

  // T7: DOM content highlight
  useContentHighlight(articleRef, highlightTerm, page?.url ?? "");

  if (!page) {
    return <Navigate to="/docs" replace />;
  }

  const data = page.data as DocsPageData;
  const tocItems = useMemo(() => parseTocItems(data.content ?? ""), [data.content]);

  // T8: reading time
  const wordCount = (data.content ?? "").trim().split(/\s+/).filter(Boolean).length;
  const readMinutes = Math.max(1, Math.ceil(wordCount / 200));

  // T9: breadcrumbs with clickable folder segments
  interface Crumb {
    label: string;
    url?: string;
  }
  const breadcrumbs: Crumb[] = [];
  if (slugParts.length > 0) {
    const folderNode = docsPageTree.children.find((n): n is TreeFolder => {
      if (n.type !== "folder") {
        return false;
      }
      return n.children.some((c) => c.type === "page" && c.url.includes(`/${slugParts[0]}/`));
    });
    if (folderNode) {
      const firstPage = folderNode.children.find((c) => c.type === "page");
      breadcrumbs.push({ label: folderNode.name as string, url: firstPage?.url });
    }
  }
  breadcrumbs.push({ label: data.title ?? page.slugs?.join("/") ?? "", url: undefined });

  const idx = allPages.findIndex((p) => p.url === page.url);
  const prevPage = idx > 0 ? allPages[idx - 1] : undefined;
  const nextPage = idx < allPages.length - 1 ? allPages[idx + 1] : undefined;

  return (
    <>
      {/* T4: Cmd+K search modal */}
      <DocsSearchModal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        onNavigate={(url) => {
          void navigate(url);
        }}
      />

      {/* T10: mobile sidebar overlay */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-background border-r border-border overflow-y-auto p-4 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Docs
              </span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <DocsSidebar
              activeUrl={page.url}
              search={search}
              onSearchChange={setSearch}
              onResultClick={handleResultClick}
            />
          </div>
        </div>
      )}

      <div className="flex h-full">
        {/* Left sidebar — hidden on mobile (T10) */}
        <div className="hidden lg:block">
          <DocsSidebar
            activeUrl={page.url}
            search={search}
            onSearchChange={setSearch}
            onResultClick={handleResultClick}
          />
        </div>

        {/* Main content */}
        <div ref={contentRef} className="flex-1 min-w-0 overflow-y-auto">
          {/* T5: reading progress bar */}
          <div className="h-0.5 bg-transparent sticky top-0 z-10">
            <div
              className="h-full bg-primary/60 transition-all duration-75 ease-out"
              style={{ width: `${readProgress}%` }}
            />
          </div>

          <div className="px-6 py-4">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
              {/* T10: mobile hamburger */}
              <button
                className="lg:hidden mr-1 text-muted-foreground hover:text-foreground"
                onClick={() => setMobileSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>
              <BookOpen className="h-3.5 w-3.5" />
              <span>Docs</span>
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <ChevronRight className="h-3 w-3" />
                  {/* T9: folder segment is a clickable Link */}
                  {crumb.url ? (
                    <Link to={crumb.url} className="hover:text-foreground transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={i === breadcrumbs.length - 1 ? "text-foreground" : ""}>
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </div>

            {/* T8: reading time */}
            <p className="text-[11px] text-muted-foreground/60 mb-4 -mt-1">
              ~{readMinutes} min read · {wordCount.toLocaleString()} words
            </p>

            {/* Highlight indicator pill */}
            {highlightTerm && (
              <div className="flex items-center gap-1.5 mb-3 text-xs">
                <span className="text-muted-foreground">Highlighting:</span>
                <span className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2 py-0.5 font-mono">
                  {highlightTerm}
                  <button
                    onClick={() => setHighlightTerm("")}
                    className="hover:text-primary/60 transition-colors"
                    title="Clear highlight"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )}

            {/* Article */}
            <article ref={articleRef} className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown>{data.content ?? ""}</Markdown>
            </article>

            {/* T11: feedback */}
            <FeedbackWidget pageUrl={page.url} />

            <DocsPagination
              prev={
                prevPage
                  ? { title: (prevPage.data as DocsPageData).title ?? "", url: prevPage.url }
                  : undefined
              }
              next={
                nextPage
                  ? { title: (nextPage.data as DocsPageData).title ?? "", url: nextPage.url }
                  : undefined
              }
            />
          </div>
        </div>

        {/* TOC */}
        <DocsToc items={tocItems} />
      </div>
    </>
  );
}
