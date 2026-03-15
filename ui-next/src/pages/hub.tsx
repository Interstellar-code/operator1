import {
  Archive,
  CheckCircle2,
  Download,
  Layers,
  Loader2,
  Package,
  RefreshCw,
  Search,
  Store,
  Trash2,
  ArrowUpCircle,
  Bot,
  Terminal,
  Zap,
  FileText,
  ChevronDown,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/custom/prompt/markdown";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// ── Types ─────────────────────────────────────────────────────────────────────

type HubItemType = "skill" | "agent" | "command";

interface HubCatalogItem {
  slug: string;
  name: string;
  type: HubItemType;
  category: string;
  description: string | null;
  version: string;
  tags: string[];
  emoji: string | null;
  bundled: boolean;
}

interface HubInstalledItem extends HubCatalogItem {
  installPath: string;
  agentId: string | null;
  installedAt: number;
  catalogVersion: string | null;
  hasUpdate: string | null; // non-null = available version string
}

interface HubCollectionItem {
  slug: string;
  name: string;
  type: HubItemType | null;
  emoji: string | null;
  bundled: boolean;
  installed: boolean;
}

interface HubCollection {
  slug: string;
  name: string;
  description: string | null;
  emoji: string | null;
  items: HubCollectionItem[];
}

interface CatalogResult {
  syncedAt: string | null;
  stale: boolean;
  total: number;
  filtered: number;
  items: HubCatalogItem[];
}

interface InstalledResult {
  items: HubInstalledItem[];
}

interface CollectionsResult {
  collections: HubCollection[];
}

interface SyncResult {
  syncedAt: string;
  totalItems: number;
  bundledAgents: number;
  collections: number;
}

interface InspectResult {
  slug: string;
  name: string;
  content: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = ["browse", "collections", "installed"] as const;
type Tab = (typeof TABS)[number];

const TYPE_FILTERS: Array<{ value: HubItemType | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "skill", label: "Skills" },
  { value: "agent", label: "Agents" },
  { value: "command", label: "Commands" },
];

function typeIcon(type: HubItemType | null): React.ReactNode {
  if (type === "skill") {
    return <Zap className="h-3 w-3" />;
  }
  if (type === "agent") {
    return <Bot className="h-3 w-3" />;
  }
  if (type === "command") {
    return <Terminal className="h-3 w-3" />;
  }
  return null;
}

function typeLabel(type: HubItemType | null): string {
  if (type === "skill") {
    return "skill";
  }
  if (type === "agent") {
    return "agent";
  }
  if (type === "command") {
    return "command";
  }
  return "";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function HubPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [tab, setTab] = useState<Tab>("browse");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<HubItemType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [catalogResult, setCatalogResult] = useState<CatalogResult | null>(null);
  const [installedResult, setInstalledResult] = useState<InstalledResult | null>(null);
  const [collectionsResult, setCollectionsResult] = useState<CollectionsResult | null>(null);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // README preview cache — Map<slug, content | null>
  const inspectCache = useRef(new Map<string, string | null>());
  const [inspectContent, setInspectContent] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);

  // Load catalog + installed + collections in one pass
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, inst, cols] = await Promise.all([
        sendRpc<CatalogResult>("hub.catalog", {}),
        sendRpc<InstalledResult>("hub.installed", {}),
        sendRpc<CollectionsResult>("hub.collections", {}),
      ]);
      setCatalogResult(cat ?? null);
      setInstalledResult(inst ?? null);
      setCollectionsResult(cols ?? null);
    } catch (err) {
      // Gateway may not yet support hub — silent on initial load
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("unknown method")) {
        setError(`Failed to load hub: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  // U7: on mount, fetch catalog once and sync if stale — no extra prefetch
  const initHub = useCallback(async () => {
    setLoading(true);
    try {
      const [cat, inst, cols] = await Promise.all([
        sendRpc<CatalogResult>("hub.catalog", {}),
        sendRpc<InstalledResult>("hub.installed", {}),
        sendRpc<CollectionsResult>("hub.collections", {}),
      ]);
      setCatalogResult(cat ?? null);
      setInstalledResult(inst ?? null);
      setCollectionsResult(cols ?? null);

      // Sync in background if catalog is stale
      if (!cat || cat.stale) {
        setSyncing(true);
        try {
          await sendRpc<SyncResult>("hub.sync", {});
          // Re-fetch only the catalog after sync — installed/collections unchanged
          const fresh = await sendRpc<CatalogResult>("hub.catalog", {});
          setCatalogResult(fresh ?? null);
        } catch (syncErr) {
          const msg = syncErr instanceof Error ? syncErr.message : String(syncErr);
          setError(`Sync failed: ${msg}`);
        } finally {
          setSyncing(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("unknown method")) {
        setError(`Failed to load hub: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) {
      void initHub();
    }
  }, [isConnected, initHub]);

  // Fetch README content when a card is expanded
  useEffect(() => {
    if (!expandedSlug) {
      setInspectContent(null);
      return;
    }
    if (inspectCache.current.has(expandedSlug)) {
      setInspectContent(inspectCache.current.get(expandedSlug) ?? null);
      return;
    }
    setInspecting(true);
    setInspectContent(null);
    sendRpc<InspectResult>("hub.inspect", { slug: expandedSlug })
      .then((result) => {
        const content = result?.content ?? null;
        inspectCache.current.set(expandedSlug, content);
        setInspectContent(content);
      })
      .catch(() => {
        inspectCache.current.set(expandedSlug, null);
        setInspectContent(null);
      })
      .finally(() => {
        setInspecting(false);
      });
  }, [expandedSlug, sendRpc]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await sendRpc<SyncResult>("hub.sync", {});
      await loadAll();
    } catch (err) {
      setError(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSyncing(false);
    }
  };

  // U4: typed as Promise<void> so callers can await and catch
  const handleInstall = async (slug: string): Promise<void> => {
    setActionLoading(slug);
    setError(null);
    try {
      await sendRpc("hub.install", { slug });
      await loadAll();
    } catch (err) {
      setError(`Install failed for "${slug}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async (slug: string): Promise<void> => {
    setActionLoading(slug);
    setError(null);
    try {
      await sendRpc("hub.remove", { slug });
      await loadAll();
    } catch (err) {
      setError(`Remove failed for "${slug}": ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleInstallCollection = async (collectionSlug: string): Promise<void> => {
    setActionLoading(`collection:${collectionSlug}`);
    setError(null);
    try {
      await sendRpc("hub.installCollection", { slug: collectionSlug });
      await loadAll();
    } catch (err) {
      setError(`Collection install failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Compute installed slug set for quick lookup
  const installedSlugs = new Set((installedResult?.items ?? []).map((i) => i.slug));
  const updateSlugs = new Set(
    (installedResult?.items ?? []).filter((i) => i.hasUpdate).map((i) => i.slug),
  );

  // Derive unique categories from catalog
  const allItems = catalogResult?.items ?? [];
  const categories = Array.from(new Set(allItems.map((i) => i.category))).toSorted();

  // Filter catalog items (client-side for now — U5 deferred)
  const filteredItems = allItems.filter((item) => {
    const matchType = typeFilter === "all" || item.type === typeFilter;
    const matchCategory = categoryFilter === "all" || item.category === categoryFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      (item.description?.toLowerCase().includes(q) ?? false) ||
      item.slug.toLowerCase().includes(q) ||
      item.tags.some((t) => t.toLowerCase().includes(q));
    return matchType && matchCategory && matchSearch;
  });

  const updateCount = installedResult?.items.filter((i) => i.hasUpdate).length ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Store className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Hub</h1>
          {catalogResult && (
            <span className="text-sm text-muted-foreground">
              {catalogResult.total} items
              {updateCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-xs font-medium">
                  <ArrowUpCircle className="h-3 w-3" />
                  {updateCount} update{updateCount !== 1 ? "s" : ""}
                </span>
              )}
            </span>
          )}
          {catalogResult?.stale && !syncing && (
            <span className="text-xs text-muted-foreground/60">(stale)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          {tab === "browse" && (
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search hub..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border bg-background pl-9 pr-3 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {/* Sync */}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing || loading}>
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
            {syncing ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>

      {/* U3: error banner */}
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      )}

      {!isConnected ? (
        <EmptyState icon={Store} message="Connect to the gateway to access the hub" />
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-border/40">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize",
                  t === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
                {t === "installed" && installedResult && installedResult.items.length > 0 && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    ({installedResult.items.length})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Browse tab */}
          {tab === "browse" && (
            <BrowseTab
              items={filteredItems}
              allCount={allItems.length}
              typeFilter={typeFilter}
              onTypeFilter={setTypeFilter}
              categoryFilter={categoryFilter}
              onCategoryFilter={setCategoryFilter}
              categories={categories}
              installedSlugs={installedSlugs}
              updateSlugs={updateSlugs}
              expandedSlug={expandedSlug}
              onExpand={setExpandedSlug}
              inspectContent={inspectContent}
              inspecting={inspecting}
              actionLoading={actionLoading}
              onInstall={handleInstall}
              onRemove={handleRemove}
            />
          )}

          {/* Collections tab */}
          {tab === "collections" && (
            <CollectionsTab
              collections={collectionsResult?.collections ?? []}
              actionLoading={actionLoading}
              onInstallCollection={handleInstallCollection}
              onInstall={handleInstall}
            />
          )}

          {/* Installed tab */}
          {tab === "installed" && (
            <InstalledTab
              items={installedResult?.items ?? []}
              actionLoading={actionLoading}
              onRemove={handleRemove}
              onUpdate={handleInstall}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Browse tab ────────────────────────────────────────────────────────────────

function BrowseTab({
  items,
  allCount,
  typeFilter,
  onTypeFilter,
  categoryFilter,
  onCategoryFilter,
  categories,
  installedSlugs,
  updateSlugs,
  expandedSlug,
  onExpand,
  inspectContent,
  inspecting,
  actionLoading,
  onInstall,
  onRemove,
}: {
  items: HubCatalogItem[];
  allCount: number;
  typeFilter: HubItemType | "all";
  onTypeFilter: (t: HubItemType | "all") => void;
  categoryFilter: string;
  onCategoryFilter: (c: string) => void;
  categories: string[];
  installedSlugs: Set<string>;
  updateSlugs: Set<string>;
  expandedSlug: string | null;
  onExpand: (slug: string | null) => void;
  inspectContent: string | null;
  inspecting: boolean;
  actionLoading: string | null;
  onInstall: (slug: string) => Promise<void>;
  onRemove: (slug: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Type filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {TYPE_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onTypeFilter(value)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                typeFilter === value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 text-muted-foreground border-border hover:border-primary/40 hover:text-foreground",
              )}
            >
              {label}
              {value === "all" && <span className="text-[10px] opacity-70">({allCount})</span>}
            </button>
          ))}
        </div>

        {/* U2: Category filter dropdown */}
        {categories.length > 0 && (
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => onCategoryFilter(e.target.value)}
              className="appearance-none pl-2.5 pr-7 py-1 rounded-md border bg-background text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option value="all">All categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Search} message="No items match your search." />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((item) => (
            <HubItemCard
              key={item.slug}
              item={item}
              installed={installedSlugs.has(item.slug)}
              hasUpdate={updateSlugs.has(item.slug)}
              expanded={expandedSlug === item.slug}
              onExpand={onExpand}
              inspectContent={expandedSlug === item.slug ? inspectContent : null}
              inspecting={expandedSlug === item.slug && inspecting}
              actionLoading={actionLoading}
              onInstall={onInstall}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hub item card ─────────────────────────────────────────────────────────────

function HubItemCard({
  item,
  installed,
  hasUpdate,
  expanded,
  onExpand,
  inspectContent,
  inspecting,
  actionLoading,
  onInstall,
  onRemove,
}: {
  item: HubCatalogItem;
  installed: boolean;
  hasUpdate: boolean;
  expanded: boolean;
  onExpand: (slug: string | null) => void;
  inspectContent: string | null;
  inspecting: boolean;
  actionLoading: string | null;
  onInstall: (slug: string) => Promise<void>; // U4: async
  onRemove: (slug: string) => Promise<void>; // U4: async
}) {
  const isLoading = actionLoading === item.slug;

  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden transition-colors",
        expanded && "ring-1 ring-primary/20",
      )}
    >
      {/* Card header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer"
        onClick={() => onExpand(expanded ? null : item.slug)}
      >
        {/* Emoji */}
        <div className="shrink-0 mt-0.5 text-xl leading-none">{item.emoji ?? "📦"}</div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-medium">{item.name}</span>

            {/* Badges */}
            {item.bundled && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                <CheckCircle2 className="h-2.5 w-2.5" />
                bundled
              </span>
            )}
            {installed && !item.bundled && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <Package className="h-2.5 w-2.5" />
                installed
              </span>
            )}
            {hasUpdate && (
              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                <ArrowUpCircle className="h-2.5 w-2.5" />
                update
              </span>
            )}
          </div>

          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {item.description}
          </p>

          {/* Type + version */}
          <div className="flex items-center gap-2 mt-1.5">
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
              {typeIcon(item.type)}
              {typeLabel(item.type)}
            </span>
            <span className="text-[10px] text-muted-foreground/50">v{item.version}</span>
            <span className="text-[10px] text-muted-foreground/40">{item.category}</span>
          </div>
        </div>
      </div>

      {/* Expanded: README + tags + action */}
      {expanded && (
        <div className="border-t border-border/50 bg-muted/5">
          {/* U1: README preview */}
          {inspecting ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : inspectContent ? (
            <div className="px-4 py-3 max-h-72 overflow-y-auto border-b border-border/40">
              <div className="flex items-center gap-1.5 mb-2 text-[10px] text-muted-foreground/60 uppercase tracking-wide">
                <FileText className="h-3 w-3" />
                README
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                <Markdown>{inspectContent}</Markdown>
              </div>
            </div>
          ) : null}

          <div className="px-4 py-3 space-y-3">
            {/* Tags */}
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Action */}
            <div className="flex items-center gap-2">
              {item.bundled ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  Built-in — no install needed
                </span>
              ) : installed ? (
                <>
                  {hasUpdate && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onInstall(item.slug);
                      }}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <ArrowUpCircle className="h-3 w-3" />
                      )}
                      Update
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRemove(item.slug);
                    }}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Remove
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onInstall(item.slug);
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Install
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Collections tab ───────────────────────────────────────────────────────────

function CollectionsTab({
  collections,
  actionLoading,
  onInstallCollection,
  onInstall,
}: {
  collections: HubCollection[];
  actionLoading: string | null;
  onInstallCollection: (slug: string) => Promise<void>;
  onInstall: (slug: string) => Promise<void>;
}) {
  if (collections.length === 0) {
    return <EmptyState icon={Layers} message="No collections available. Sync the hub first." />;
  }

  return (
    <div className="space-y-4">
      {collections.map((col) => {
        const isLoading = actionLoading === `collection:${col.slug}`;
        const totalItems = col.items.length;
        const installedCount = col.items.filter((i) => i.installed || i.bundled).length;
        const allReady = installedCount === totalItems;

        return (
          <div key={col.slug} className="rounded-lg border bg-card overflow-hidden">
            {/* Collection header */}
            <div className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none mt-0.5">{col.emoji ?? "📦"}</span>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold">{col.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {installedCount}/{totalItems}
                    </span>
                    {allReady && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        complete
                      </span>
                    )}
                  </div>
                  {col.description && (
                    <p className="text-xs text-muted-foreground">{col.description}</p>
                  )}
                </div>
              </div>

              {!allReady && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5 shrink-0"
                  onClick={() => void onInstallCollection(col.slug)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  Install All
                </Button>
              )}
            </div>

            {/* Items grid */}
            <div className="border-t border-border/40 px-4 py-3">
              <div className="grid grid-cols-2 gap-2">
                {col.items.map((item) => (
                  <CollectionItemRow
                    key={item.slug}
                    item={item}
                    actionLoading={actionLoading}
                    onInstall={onInstall}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CollectionItemRow({
  item,
  actionLoading,
  onInstall,
}: {
  item: HubCollectionItem;
  actionLoading: string | null;
  onInstall: (slug: string) => Promise<void>;
}) {
  const isLoading = actionLoading === item.slug;
  const ready = item.installed || item.bundled;

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/30">
      <span className="text-base leading-none shrink-0">{item.emoji ?? "📦"}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{item.name}</span>
          {item.type && (
            <span className="text-[9px] text-muted-foreground/60 shrink-0">
              {typeLabel(item.type)}
            </span>
          )}
        </div>
      </div>
      {ready ? (
        <CheckCircle2
          className={cn("h-3.5 w-3.5 shrink-0", item.bundled ? "text-primary" : "text-emerald-500")}
        />
      ) : (
        <button
          onClick={() => void onInstall(item.slug)}
          disabled={isLoading}
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          title="Install"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

// ── Installed tab ─────────────────────────────────────────────────────────────

function InstalledTab({
  items,
  actionLoading,
  onRemove,
  onUpdate,
}: {
  items: HubInstalledItem[];
  actionLoading: string | null;
  onRemove: (slug: string) => Promise<void>;
  onUpdate: (slug: string) => Promise<void>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        message="Nothing installed yet. Browse the catalog to install items."
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const isLoading = actionLoading === item.slug;

        return (
          <div
            key={item.slug}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card"
          >
            <span className="text-xl leading-none shrink-0">{item.emoji ?? "📦"}</span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium">{item.name}</span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
                  {typeIcon(item.type)}
                  {typeLabel(item.type)}
                </span>
                {item.hasUpdate && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                    <ArrowUpCircle className="h-2.5 w-2.5" />
                    {item.hasUpdate} available
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                <span className="font-mono">v{item.version}</span>
                <span>·</span>
                <span>installed {formatDate(new Date(item.installedAt * 1000).toISOString())}</span>
                {item.agentId && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{item.agentId}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {item.hasUpdate && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  onClick={() => void onUpdate(item.slug)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="h-3 w-3" />
                  )}
                  Update
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                onClick={() => void onRemove(item.slug)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
      <Icon className="h-8 w-8 mx-auto mb-3 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
