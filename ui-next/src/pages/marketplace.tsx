import {
  Store,
  RefreshCw,
  Search,
  Download,
  Star,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  Trash2,
  AlertTriangle,
  Package,
  EyeOff,
  Eye,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeDate(ts: number | undefined): string | null {
  if (!ts) {
    return null;
  }
  const diff = Date.now() - ts;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  if (days < 30) {
    return `${Math.floor(days / 7)}w ago`;
  }
  if (days < 365) {
    return `${Math.floor(days / 30)}mo ago`;
  }
  return `${Math.floor(days / 365)}y ago`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SkillStats = {
  downloads?: number;
  stars?: number;
  installsCurrent?: number;
  comments?: number;
  versions?: number;
};
type SkillVersion = { version?: string };
type SkillSecurity = { hasWarnings?: boolean; status?: string };
type SkillOwner = { handle?: string; displayName?: string };

type CatalogSkill = {
  slug: string;
  displayName?: string;
  summary?: string;
  category?: string;
  categories?: string[];
  stats?: SkillStats;
  latestVersion?: SkillVersion;
  security?: SkillSecurity;
  owner?: SkillOwner;
  os?: string[];
  installedVersion?: string;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
};

type CatalogResponse = {
  syncedAt: string | null;
  stale: boolean;
  total: number;
  filtered: number;
  skills: CatalogSkill[];
};

type InstalledResponse = { skills: CatalogSkill[] };
type SyncResponse = {
  syncedAt: string;
  totalSkills: number;
  newSkills: number;
  updatedSkills: number;
};
type InspectResponse = { slug: string; version: string; fetchedAt: string; content: string };
type DownloadResponse = { ok: boolean; slug: string; requiresRestart: boolean; message: string };
type UninstallResponse = { ok: boolean; slug: string };

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "development", label: "Development" },
  { id: "productivity", label: "Productivity" },
  { id: "social", label: "Social" },
  { id: "automation", label: "Automation" },
  { id: "media", label: "Media" },
  { id: "utility", label: "Utility" },
  { id: "communication", label: "Communication" },
  { id: "data", label: "Data" },
  { id: "finance", label: "Finance" },
];

const SORT_OPTIONS = [
  { id: "downloads", label: "Popular" },
  { id: "stars", label: "Stars" },
  { id: "newest", label: "Newest" },
  { id: "updated", label: "Updated" },
  { id: "installs", label: "Trending" },
];

// Quick-filter pills that narrow the visible pool
const QUICK_FILTERS = [
  { id: "starred", label: "⭐ Has Stars" },
  { id: "active", label: "🔄 Active" }, // multiple versions published
  { id: "new", label: "🆕 New" }, // created in last 60 days
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export function MarketplacePage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [installed, setInstalled] = useState<CatalogSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("downloads");
  const [search, setSearch] = useState("");
  const [showInstalled, setShowInstalled] = useState(false);
  const [quickFilter, setQuickFilter] = useState<string | null>(null);

  // Detail / install state
  const [selectedSkill, setSelectedSkill] = useState<CatalogSkill | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectContent, setInspectContent] = useState<string | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState<CatalogSkill | null>(null);
  const [confirmInstall, setConfirmInstall] = useState<CatalogSkill | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showIgnored, setShowIgnored] = useState(false);

  // Ignored slugs persisted in localStorage — pure client preference, no server round-trip
  const [ignoredSlugs, setIgnoredSlugs] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("clawhub:ignored");
      return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });

  const toggleIgnore = useCallback((slug: string) => {
    setIgnoredSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      try {
        localStorage.setItem("clawhub:ignored", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const installedSlugs = useMemo(() => new Set(installed.map((s) => s.slug)), [installed]);

  const loadInstalled = useCallback(async () => {
    try {
      const res = await sendRpc<InstalledResponse>("clawhub.installed", {});
      setInstalled(res?.skills ?? []);
    } catch {
      /* ignore */
    }
  }, [sendRpc]);

  // Fetch the full catalog once — no category/sort params (client-side only)
  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendRpc<CatalogResponse>("clawhub.catalog", {});
      setCatalog(res);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) {
      void loadCatalog();
      void loadInstalled();
    }
  }, [isConnected, loadCatalog, loadInstalled]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    setNotFound(false);
    try {
      await sendRpc<SyncResponse>("clawhub.sync", {});
      await loadCatalog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("enoent")) {
        setNotFound(true);
      } else {
        setSyncError(msg);
      }
    } finally {
      setSyncing(false);
    }
  }, [sendRpc, loadCatalog]);

  const handleOpenDetail = useCallback(
    async (skill: CatalogSkill) => {
      setSelectedSkill(skill);
      setInspectContent(null);
      setInstallError(null);
      setInstallSuccess(null);
      setInspecting(true);
      try {
        const res = await sendRpc<InspectResponse>("clawhub.inspect", { slug: skill.slug });
        setInspectContent(res?.content ?? null);
      } catch {
        setInspectContent(null);
      } finally {
        setInspecting(false);
      }
    },
    [sendRpc],
  );

  const handleInstall = useCallback(
    async (skill: CatalogSkill) => {
      setInstalling(skill.slug);
      setInstallError(null);
      setInstallSuccess(null);
      try {
        const res = await sendRpc<DownloadResponse>("clawhub.download", { slug: skill.slug });
        setInstallSuccess(res?.message ?? "Skill installed.");
        await loadInstalled();
      } catch (err: unknown) {
        setInstallError(err instanceof Error ? err.message : String(err));
      } finally {
        setInstalling(null);
        setConfirmInstall(null);
      }
    },
    [sendRpc, loadInstalled],
  );

  const handleUninstall = useCallback(
    async (skill: CatalogSkill) => {
      setUninstalling(skill.slug);
      try {
        await sendRpc<UninstallResponse>("clawhub.uninstall", { slug: skill.slug });
        await loadInstalled();
        if (selectedSkill?.slug === skill.slug) {
          setInstallSuccess(null);
          setInstallError(null);
        }
      } catch {
        /* ignore */
      } finally {
        setUninstalling(null);
        setConfirmUninstall(null);
      }
    },
    [sendRpc, loadInstalled, selectedSkill],
  );

  // Per-category counts — excludes ignored skills so numbers stay accurate
  const categoryCounts = useMemo(() => {
    const visible = (catalog?.skills ?? []).filter((s) => !ignoredSlugs.has(s.slug));
    const counts: Record<string, number> = { all: visible.length };
    for (const s of visible) {
      const cats = Array.isArray(s.categories) ? s.categories : [s.category ?? "other"];
      for (const c of cats) {
        counts[c] = (counts[c] ?? 0) + 1;
      }
    }
    return counts;
  }, [catalog?.skills, ignoredSlugs]);

  // Client-side filter + sort — no server round-trips
  const displaySkills = useMemo(() => {
    const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

    // "Ignored" view: only ignored skills, supports text search
    if (showIgnored) {
      let pool = (catalog?.skills ?? []).filter((s) => ignoredSlugs.has(s.slug));
      if (search.trim()) {
        const term = search.toLowerCase();
        pool = pool.filter(
          (s) =>
            (s.displayName ?? s.slug).toLowerCase().includes(term) ||
            (s.summary ?? "").toLowerCase().includes(term) ||
            s.slug.toLowerCase().includes(term),
        );
      }
      return pool;
    }

    // Normal view: exclude ignored
    let pool = showInstalled
      ? installed
      : (catalog?.skills ?? []).filter((s) => !ignoredSlugs.has(s.slug));

    // Category filter
    if (!showInstalled && category !== "all") {
      pool = pool.filter((s) => {
        const cats = Array.isArray(s.categories) ? s.categories : [s.category ?? "other"];
        return cats.includes(category);
      });
    }

    // Quick filter
    if (!showInstalled && quickFilter) {
      const now = Date.now();
      if (quickFilter === "starred") {
        pool = pool.filter((s) => (s.stats?.stars ?? 0) > 0);
      } else if (quickFilter === "active") {
        // Skills with more than 1 published version — indicates ongoing maintenance
        pool = pool.filter((s) => (s.stats?.versions ?? 0) > 1);
      } else if (quickFilter === "new") {
        pool = pool.filter((s) => s.createdAt && now - s.createdAt < SIXTY_DAYS_MS);
      }
    }

    // Text search
    if (search.trim()) {
      const term = search.toLowerCase();
      pool = pool.filter(
        (s) =>
          (s.displayName ?? s.slug).toLowerCase().includes(term) ||
          (s.summary ?? "").toLowerCase().includes(term) ||
          s.slug.toLowerCase().includes(term),
      );
    }

    // Sort
    if (!showInstalled) {
      pool = [...pool].toSorted((a, b) => {
        const sa = a.stats as Record<string, number> | undefined;
        const sb = b.stats as Record<string, number> | undefined;
        if (sort === "stars") {
          return (sb?.stars ?? 0) - (sa?.stars ?? 0);
        }
        if (sort === "installs") {
          return (sb?.installsCurrent ?? 0) - (sa?.installsCurrent ?? 0);
        }
        if (sort === "newest") {
          return (b.createdAt ?? 0) - (a.createdAt ?? 0);
        }
        if (sort === "updated") {
          return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
        }
        // default: downloads
        return (sb?.downloads ?? 0) - (sa?.downloads ?? 0);
      });
    }

    return pool;
  }, [
    catalog?.skills,
    installed,
    ignoredSlugs,
    search,
    showInstalled,
    showIgnored,
    category,
    sort,
    quickFilter,
  ]);

  // ─── Not-connected state ───────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        <Store className="h-8 w-8 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Connect to the gateway to browse the marketplace</p>
      </div>
    );
  }

  // ─── Detail pane ──────────────────────────────────────────────────────────
  if (selectedSkill) {
    return (
      <SkillDetail
        skill={selectedSkill}
        isInstalled={installedSlugs.has(selectedSkill.slug)}
        installedVersion={installed.find((s) => s.slug === selectedSkill.slug)?.installedVersion}
        inspecting={inspecting}
        inspectContent={inspectContent}
        installing={installing === selectedSkill.slug}
        installError={installError}
        installSuccess={installSuccess}
        uninstalling={uninstalling === selectedSkill.slug}
        onBack={() => {
          setSelectedSkill(null);
          setInstallSuccess(null);
          setInstallError(null);
        }}
        onInstall={(skill) => {
          const hasWarning = skill.security?.hasWarnings || skill.security?.status !== "clean";
          if (hasWarning) {
            setConfirmInstall(skill);
          } else {
            void handleInstall(skill);
          }
        }}
        onUninstall={(skill) => setConfirmUninstall(skill)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Store className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Marketplace</h1>
          {catalog && (
            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {showIgnored
                ? `${ignoredSlugs.size} ignored`
                : displaySkills.length === categoryCounts.all
                  ? `${categoryCounts.all} skills`
                  : `${displaySkills.length} / ${categoryCounts.all}`}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSort(opt.id)}
                className={cn(
                  "px-2.5 py-1 rounded text-xs font-medium transition-colors",
                  sort === opt.id
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync ClawHub"}
          </Button>
        </div>
      </div>

      {/* Stale banner */}
      {catalog?.stale && !syncing && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-amber-700 dark:text-amber-400 flex-1">
            {catalog.syncedAt
              ? `Catalog last synced ${new Date(catalog.syncedAt).toLocaleDateString()} — may be out of date.`
              : "Catalog has never been synced."}
          </span>
          <button
            onClick={handleSync}
            className="text-xs font-medium text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:opacity-80"
          >
            Sync now
          </button>
        </div>
      )}

      {/* clawhub not found */}
      {notFound && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-medium text-destructive mb-1">clawhub CLI not found</p>
          <p className="text-muted-foreground text-xs">
            Install it with:{" "}
            <code className="font-mono bg-muted px-1 py-0.5 rounded">npm i -g clawhub</code> or
            visit{" "}
            <a href="https://clawhub.ai" target="_blank" rel="noreferrer" className="underline">
              clawhub.ai
            </a>
          </p>
        </div>
      )}

      {/* Sync error */}
      {syncError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-xs text-destructive font-mono">
          {syncError}
        </div>
      )}

      {/* Category + installed filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.id] ?? 0;
            const active = !showInstalled && !showIgnored && category === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setCategory(cat.id);
                  setShowInstalled(false);
                  setShowIgnored(false);
                  setQuickFilter(null);
                }}
                className={cn(
                  "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border/80",
                )}
              >
                {cat.label}
                {count > 0 && (
                  <span
                    className={cn("text-[10px] font-normal", active ? "opacity-70" : "opacity-50")}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            setShowInstalled(!showInstalled);
            setShowIgnored(false);
            setQuickFilter(null);
          }}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-medium border transition-colors gap-1.5 flex items-center",
            showInstalled
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <CheckCircle2 className="h-3 w-3" />
          Installed ({installed.length})
        </button>

        {/* Quick filters — starred / active / new */}
        {!showInstalled && !showIgnored && (
          <>
            {QUICK_FILTERS.map((qf) => (
              <button
                key={qf.id}
                onClick={() => setQuickFilter(quickFilter === qf.id ? null : qf.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
                  quickFilter === qf.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {qf.label}
              </button>
            ))}
          </>
        )}

        {/* Ignored pill — only shown when there are ignored skills or the view is active */}
        {(ignoredSlugs.size > 0 || showIgnored) && (
          <button
            onClick={() => {
              setShowIgnored(!showIgnored);
              setShowInstalled(false);
              setQuickFilter(null);
            }}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium border transition-colors gap-1.5 flex items-center",
              showIgnored
                ? "bg-muted-foreground/20 text-foreground border-muted-foreground/30"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <EyeOff className="h-3 w-3" />
            Hidden ({ignoredSlugs.size})
          </button>
        )}

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search skills…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-52 rounded-md border bg-background pl-8 pr-3 py-1.5 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : catalog === null && !showInstalled ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
          <Store className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium mb-1">No catalog yet</p>
          <p className="text-xs mb-4">Sync ClawHub to browse available skills.</p>
          <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            Sync ClawHub
          </Button>
        </div>
      ) : displaySkills.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {showIgnored
            ? "No hidden skills."
            : showInstalled
              ? "No skills installed yet."
              : "No skills match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {displaySkills.map((skill) => (
            <SkillCard
              key={skill.slug}
              skill={skill}
              isInstalled={installedSlugs.has(skill.slug)}
              isIgnored={ignoredSlugs.has(skill.slug)}
              installedVersion={installed.find((s) => s.slug === skill.slug)?.installedVersion}
              uninstalling={uninstalling === skill.slug}
              onOpen={() => void handleOpenDetail(skill)}
              onInstall={() => {
                const hasWarning =
                  skill.security?.hasWarnings || skill.security?.status !== "clean";
                if (hasWarning) {
                  setConfirmInstall(skill);
                } else {
                  void handleInstall(skill);
                }
              }}
              onUninstall={() => setConfirmUninstall(skill)}
              onIgnore={() => toggleIgnore(skill.slug)}
            />
          ))}
        </div>
      )}

      {/* Confirm: Security gate install */}
      {confirmInstall && (
        <ConfirmDialog
          title="Security warning"
          body={`"${confirmInstall.displayName ?? confirmInstall.slug}" has security warnings. Install anyway?`}
          confirmLabel="Install anyway"
          confirmVariant="destructive"
          onConfirm={() => void handleInstall(confirmInstall)}
          onCancel={() => setConfirmInstall(null)}
        />
      )}

      {/* Confirm: Uninstall */}
      {confirmUninstall && (
        <ConfirmDialog
          title="Uninstall skill"
          body={`This will remove skills/${confirmUninstall.slug}/ from disk. The change takes effect after the next session restart.`}
          confirmLabel="Uninstall"
          confirmVariant="destructive"
          onConfirm={() => void handleUninstall(confirmUninstall)}
          onCancel={() => setConfirmUninstall(null)}
        />
      )}
    </div>
  );
}

// ─── Skill Card ───────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  isInstalled,
  isIgnored,
  installedVersion,
  uninstalling,
  onOpen,
  onInstall,
  onUninstall,
  onIgnore,
}: {
  skill: CatalogSkill;
  isInstalled: boolean;
  isIgnored: boolean;
  installedVersion?: string | null;
  uninstalling: boolean;
  onOpen: () => void;
  onInstall: () => void;
  onUninstall: () => void;
  onIgnore: () => void;
}) {
  const catalogVersion = skill.latestVersion?.version;
  const hasUpdate =
    isInstalled && catalogVersion && installedVersion && catalogVersion !== installedVersion;
  const hasWarning =
    skill.security?.hasWarnings || (skill.security?.status && skill.security.status !== "clean");

  return (
    <div
      className={cn(
        "group rounded-xl border bg-card overflow-hidden transition-all cursor-pointer",
        isIgnored ? "opacity-60 border-border/40" : "hover:border-primary/40 hover:shadow-sm",
      )}
      onClick={onOpen}
    >
      <div className="px-4 py-3.5 flex flex-col gap-2.5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span
                className={cn(
                  "text-sm font-semibold truncate transition-colors",
                  isIgnored ? "line-through text-muted-foreground" : "group-hover:text-primary",
                )}
              >
                {skill.displayName ?? skill.slug}
              </span>
              {hasWarning && (
                <ShieldAlert
                  className="h-3.5 w-3.5 text-amber-500 shrink-0"
                  aria-label="Security warning"
                />
              )}
              {isInstalled && !hasUpdate && (
                <CheckCircle2
                  className="h-3.5 w-3.5 text-green-500 shrink-0"
                  aria-label="Installed"
                />
              )}
              {hasUpdate && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium border border-blue-500/20">
                  update
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {skill.summary ?? <span className="italic opacity-50">No description</span>}
            </p>
          </div>

          {/* Ignore / restore button — always visible on ignored cards, hover-only otherwise */}
          <button
            title={isIgnored ? "Restore to marketplace" : "Hide from marketplace"}
            onClick={(e) => {
              e.stopPropagation();
              onIgnore();
            }}
            className={cn(
              "shrink-0 rounded p-1 transition-all",
              isIgnored
                ? "text-muted-foreground hover:text-foreground"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground/50 hover:text-muted-foreground",
            )}
          >
            {isIgnored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Footer: stats + category + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground min-w-0">
            {skill.owner?.handle && (
              <span className="truncate max-w-[80px]">@{skill.owner.handle}</span>
            )}
            {(skill.stats?.downloads ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                <Download className="h-2.5 w-2.5" />
                {skill.stats!.downloads!.toLocaleString()}
              </span>
            )}
            {(skill.stats?.stars ?? 0) > 0 && (
              <span className="flex items-center gap-0.5 shrink-0">
                <Star className="h-2.5 w-2.5" />
                {skill.stats!.stars}
              </span>
            )}
            {skill.category && skill.category !== "other" && (
              <span className="capitalize px-1.5 py-0.5 rounded bg-muted text-[9px] font-medium shrink-0">
                {skill.category}
              </span>
            )}
            {formatRelativeDate(skill.updatedAt) && (
              <span
                className="shrink-0 opacity-60"
                title={skill.updatedAt ? new Date(skill.updatedAt).toLocaleDateString() : ""}
              >
                {formatRelativeDate(skill.updatedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            {isIgnored ? (
              /* In "Hidden" view, show a restore button instead of install */
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onIgnore();
                }}
              >
                Restore
              </Button>
            ) : isInstalled ? (
              <>
                {hasUpdate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={onInstall}
                  >
                    Update
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={onUninstall}
                  disabled={uninstalling}
                  title="Uninstall"
                >
                  {uninstalling ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={onInstall}
              >
                Install
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skill Detail ─────────────────────────────────────────────────────────────

function SkillDetail({
  skill,
  isInstalled,
  installedVersion,
  inspecting,
  inspectContent,
  installing,
  installError,
  installSuccess,
  uninstalling,
  onBack,
  onInstall,
  onUninstall,
}: {
  skill: CatalogSkill;
  isInstalled: boolean;
  installedVersion?: string | null;
  inspecting: boolean;
  inspectContent: string | null;
  installing: boolean;
  installError: string | null;
  installSuccess: string | null;
  uninstalling: boolean;
  onBack: () => void;
  onInstall: (skill: CatalogSkill) => void;
  onUninstall: (skill: CatalogSkill) => void;
}) {
  const catalogVersion = skill.latestVersion?.version;
  const hasUpdate =
    isInstalled && catalogVersion && installedVersion && catalogVersion !== installedVersion;
  const hasWarning =
    skill.security?.hasWarnings || (skill.security?.status && skill.security.status !== "clean");

  return (
    <div className="space-y-5">
      {/* Back nav */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Marketplace
      </button>

      {/* Hero */}
      <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-base font-semibold">{skill.displayName ?? skill.slug}</h2>
              {hasWarning && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                  <ShieldAlert className="h-3 w-3" />
                  Security warning
                </span>
              )}
              {isInstalled && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-2 py-0.5 rounded">
                  <CheckCircle2 className="h-3 w-3" />
                  Installed
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{skill.summary}</p>
          </div>

          {/* Action button */}
          <div className="shrink-0">
            {installing ? (
              <Button disabled className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Installing…
              </Button>
            ) : isInstalled ? (
              <div className="flex items-center gap-2">
                {hasUpdate && (
                  <Button variant="outline" onClick={() => onInstall(skill)} className="gap-1.5">
                    <Download className="h-4 w-4" />
                    Update
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => onUninstall(skill)}
                  disabled={uninstalling}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  {uninstalling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Uninstall
                </Button>
              </div>
            ) : (
              <Button onClick={() => onInstall(skill)} className="gap-1.5">
                <Download className="h-4 w-4" />
                Install
              </Button>
            )}
          </div>
        </div>

        {/* Success/error feedback */}
        {installSuccess && (
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {installSuccess}
          </div>
        )}
        {installError && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
            {installError}
          </div>
        )}

        {/* Metadata chips */}
        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground pt-1 border-t border-border/30">
          {skill.owner?.handle && <span>@{skill.owner.handle}</span>}
          {catalogVersion && <span className="font-mono">v{catalogVersion}</span>}
          {skill.category && (
            <span className="capitalize px-2 py-0.5 rounded bg-muted">{skill.category}</span>
          )}
          {(skill.stats?.downloads ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Download className="h-3 w-3" /> {skill.stats!.downloads!.toLocaleString()}
            </span>
          )}
          {(skill.stats?.stars ?? 0) > 0 && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3" /> {skill.stats!.stars}
            </span>
          )}
          {(skill.stats?.versions ?? 0) > 0 && (
            <span>
              {skill.stats!.versions} version{skill.stats!.versions === 1 ? "" : "s"}
            </span>
          )}
          {skill.createdAt && (
            <span title={new Date(skill.createdAt).toLocaleDateString()}>
              Created {formatRelativeDate(skill.createdAt)}
            </span>
          )}
          {skill.updatedAt && skill.updatedAt !== skill.createdAt && (
            <span title={new Date(skill.updatedAt).toLocaleDateString()}>
              Updated {formatRelativeDate(skill.updatedAt)}
            </span>
          )}
          {Array.isArray(skill.os) && skill.os.length > 0 && <span>{skill.os.join(", ")}</span>}
        </div>
      </div>

      {/* Skill documentation preview */}
      <div className="rounded-lg border bg-card px-5 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Documentation Preview
        </h3>
        {inspecting ? (
          <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading preview…</span>
          </div>
        ) : inspectContent ? (
          <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground/80 max-h-[500px] overflow-y-auto">
            {inspectContent}
          </pre>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Package className="h-6 w-6 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Preview not available</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  confirmVariant,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  confirmVariant: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="rounded-xl border bg-card shadow-xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={confirmVariant} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
