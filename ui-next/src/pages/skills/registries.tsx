import {
  Database,
  RotateCcw,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Globe,
  Lock,
  Package,
  CheckCircle2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/custom/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// ─── Types ───

type SkillRegistryEntry = {
  id: string;
  name: string;
  url: string;
  visibility: "public" | "private";
  enabled: boolean;
  skillCount: number;
  lastSynced?: string;
  bundled?: boolean;
};

type SkillRegistrySyncResult = {
  skills?: { slug: string; displayName: string; version?: string; installed?: boolean }[];
};

// ClawHub is the built-in bundled registry — always present
const CLAWHUB_REGISTRY: SkillRegistryEntry = {
  id: "clawhub",
  name: "ClawHub",
  url: "https://clawhub.openclaw.ai",
  visibility: "public",
  enabled: true,
  skillCount: 0,
  bundled: true,
};

// ─── Main Page ───

export function SkillRegistriesPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const { toast } = useToast();

  const [registries, setRegistries] = useState<SkillRegistryEntry[]>([CLAWHUB_REGISTRY]);
  const [loading, setLoading] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [syncedSkills, setSyncedSkills] = useState<
    Record<string, SkillRegistrySyncResult["skills"]>
  >({});
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SkillRegistryEntry | null>(null);

  const loadRegistries = useCallback(async () => {
    setLoading(true);
    try {
      // Try to fetch registry list from gateway; fall back to bundled ClawHub only
      const result = await sendRpc<{ registries?: SkillRegistryEntry[] }>(
        "skills.registries.list",
        {},
      ).catch(() => null);
      if (result?.registries && result.registries.length > 0) {
        // Ensure ClawHub is always first if present
        const hasClawhub = result.registries.some((r) => r.id === "clawhub");
        setRegistries(hasClawhub ? result.registries : [CLAWHUB_REGISTRY, ...result.registries]);
      }
      // else keep default [CLAWHUB_REGISTRY]
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) loadRegistries();
  }, [isConnected, loadRegistries]);

  const handleSync = useCallback(
    async (registry: SkillRegistryEntry) => {
      setSyncingId(registry.id);
      try {
        const result = await sendRpc<SkillRegistrySyncResult>("clawhub.sync", {}).catch(() =>
          sendRpc<SkillRegistrySyncResult>("skills.registries.sync", { id: registry.id }).catch(
            () => null,
          ),
        );
        if (result) {
          setSyncedSkills((prev) => ({ ...prev, [registry.id]: result.skills ?? [] }));
          setExpandedId(registry.id);
          toast(`Synced ${result.skills?.length ?? 0} skills from ${registry.name}`, "success");
        }
        await loadRegistries();
      } catch {
        toast(`Sync failed for ${registry.name}`, "error");
      } finally {
        setSyncingId(null);
      }
    },
    [sendRpc, loadRegistries, toast],
  );

  const handleRemove = useCallback(
    async (registry: SkillRegistryEntry) => {
      try {
        await sendRpc("skills.registries.remove", { id: registry.id });
        setRegistries((prev) => prev.filter((r) => r.id !== registry.id));
        toast(`Removed registry: ${registry.name}`, "success");
      } catch {
        toast(`Failed to remove registry`, "error");
      } finally {
        setDeleteTarget(null);
      }
    },
    [sendRpc, toast],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Skill Registries
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Sources for discovering and syncing skills. ClawHub is the built-in registry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => void loadRegistries()}
            disabled={loading}
          >
            <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
            Add Registry
          </Button>
        </div>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">
          <Database className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Connect to the gateway to view registries</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-3">
          {registries.map((reg) => (
            <RegistryCard
              key={reg.id}
              registry={reg}
              isExpanded={expandedId === reg.id}
              onExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              isSyncing={syncingId === reg.id}
              onSync={handleSync}
              onRemove={() => setDeleteTarget(reg)}
              syncedSkills={syncedSkills[reg.id]}
            />
          ))}
        </div>
      )}

      {/* Add registry dialog */}
      {showAddDialog && (
        <AddRegistryDialog
          onAdd={async (name, url) => {
            try {
              await sendRpc("skills.registries.add", { name, url });
              await loadRegistries();
              toast(`Added registry: ${name}`, "success");
              setShowAddDialog(false);
            } catch {
              toast("Failed to add registry", "error");
            }
          }}
          onClose={() => setShowAddDialog(false)}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <Dialog open onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Remove {deleteTarget.name}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This removes the registry source. Installed skills from this registry will not be
              uninstalled.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleRemove(deleteTarget)}>
                Remove
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Registry Card ───

function RegistryCard({
  registry,
  isExpanded,
  onExpand,
  isSyncing,
  onSync,
  onRemove,
  syncedSkills,
}: {
  registry: SkillRegistryEntry;
  isExpanded: boolean;
  onExpand: (id: string) => void;
  isSyncing: boolean;
  onSync: (reg: SkillRegistryEntry) => void;
  onRemove: () => void;
  syncedSkills?: SkillRegistrySyncResult["skills"];
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card overflow-hidden",
        isExpanded && "ring-1 ring-primary/20",
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          className="flex-1 flex items-center gap-3 text-left min-w-0"
          onClick={() => onExpand(registry.id)}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{registry.name}</span>
              {registry.bundled && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-secondary/60 text-muted-foreground border-border/60 flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  bundled
                </span>
              )}
              {registry.visibility === "public" ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-600 border-emerald-500/20 flex items-center gap-1">
                  <Globe className="h-2.5 w-2.5" />
                  public
                </span>
              ) : (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/30 flex items-center gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  private
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground font-mono truncate block mt-0.5">
              {registry.url}
            </span>
          </div>
        </button>

        {/* Stats + actions */}
        <div className="flex items-center gap-3 shrink-0">
          {registry.skillCount > 0 && (
            <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {registry.skillCount} skills
            </span>
          )}
          {registry.lastSynced && (
            <span className="text-xs text-muted-foreground hidden md:block">
              Synced {new Date(registry.lastSynced).toLocaleDateString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onSync(registry)}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Sync
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRemove}
            disabled={registry.bundled}
            title={registry.bundled ? "Cannot remove bundled registry" : "Remove registry"}
            className="text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded: synced skills list */}
      {isExpanded && (
        <div className="border-t border-border/50 px-4 py-3 bg-muted/5">
          {!syncedSkills ? (
            <p className="text-xs text-muted-foreground py-2">
              Click <strong>Sync</strong> to fetch the latest skills from this registry.
            </p>
          ) : syncedSkills.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No skills returned from this registry.
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {syncedSkills.length} skills in registry
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {syncedSkills.map((skill) => (
                  <div
                    key={skill.slug}
                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 transition-colors"
                  >
                    {skill.installed ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <Package className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className="text-xs font-medium truncate">
                      {skill.displayName || skill.slug}
                    </span>
                    {skill.version && (
                      <span className="text-[10px] text-muted-foreground font-mono ml-auto shrink-0">
                        v{skill.version}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Registry Dialog ───

function AddRegistryDialog({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, url: string) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && url.trim().length > 0 && !saving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    try {
      await onAdd(name.trim(), url.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            Add Skill Registry
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="reg-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="reg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Private Registry"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reg-url" className="text-sm font-medium">
              URL
            </label>
            <Input
              id="reg-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://registry.example.com"
              type="url"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Registry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
