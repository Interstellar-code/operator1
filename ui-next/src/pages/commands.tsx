import {
  Slash,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Download,
  Upload,
  Lock,
  Search,
  LayoutGrid,
  List,
  Clock,
} from "lucide-react";
import { useState, useRef, useCallback, useMemo } from "react";
import { CommandFormDialog } from "@/components/commands/command-form-dialog";
import type { FormMode } from "@/components/commands/command-form-dialog";
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
import { useCommands } from "@/hooks/use-commands";
import { cn } from "@/lib/utils";
import type { CommandEntry, CommandCreateInput, CommandUpdateInput } from "@/types/commands";

// ─── Source badge helpers ───

function SourceBadge({ source }: { source: string }) {
  if (source === "builtin") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-secondary/60 text-muted-foreground border-border/60">
        <Lock className="h-2.5 w-2.5" />
        built-in
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
      user
    </span>
  );
}

// ─── Command Card (grid view) ───

function CommandCard({
  cmd,
  onEdit,
  onDelete,
}: {
  cmd: CommandEntry;
  onEdit: (c: CommandEntry) => void;
  onDelete: (c: CommandEntry) => void;
}) {
  const isReadOnly = cmd.source === "builtin";

  return (
    <div className="rounded-lg border p-4 space-y-3 hover:border-foreground/20 transition-colors bg-card">
      {/* Top row: emoji + name + source badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {cmd.emoji ? (
            <span className="text-xl shrink-0">{cmd.emoji}</span>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground text-sm font-mono shrink-0">
              /
            </span>
          )}
          <div className="min-w-0">
            <span className="font-mono font-semibold text-sm block truncate">/{cmd.name}</span>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              <SourceBadge source={cmd.source} />
              {cmd.longRunning && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/20">
                  <Clock className="h-2.5 w-2.5" />
                  long-running
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => onEdit(cmd)}
            title={isReadOnly ? "View details" : "Edit"}
            className="rounded p-1.5 hover:bg-muted transition-colors"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={() => onDelete(cmd)}
            disabled={isReadOnly}
            title={isReadOnly ? "Cannot delete built-in / skill" : "Delete"}
            className="rounded p-1.5 hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground line-clamp-2">{cmd.description}</p>

      {/* Footer: category */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {cmd.category && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {cmd.category}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Command Row (list view) ───

function CommandRow({
  cmd,
  onEdit,
  onDelete,
}: {
  cmd: CommandEntry;
  onEdit: (c: CommandEntry) => void;
  onDelete: (c: CommandEntry) => void;
}) {
  const isReadOnly = cmd.source === "builtin";

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors">
      {/* Emoji / slash icon */}
      {cmd.emoji ? (
        <span className="text-lg shrink-0 w-7 text-center">{cmd.emoji}</span>
      ) : (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-muted text-muted-foreground text-xs font-mono shrink-0">
          /
        </span>
      )}

      {/* Name + badges */}
      <div className="flex items-center gap-2 w-52 shrink-0 min-w-0">
        <span className="font-mono font-medium text-sm truncate">/{cmd.name}</span>
        <SourceBadge source={cmd.source} />
        {cmd.longRunning && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-600 border-amber-500/20 shrink-0">
            <Clock className="h-2.5 w-2.5" />
            long
          </span>
        )}
      </div>

      {/* Description */}
      <span className="flex-1 text-sm text-muted-foreground truncate">{cmd.description}</span>

      {/* Category */}
      <span className="text-xs font-mono text-muted-foreground w-24 shrink-0 text-right">
        {cmd.category ?? "—"}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => onEdit(cmd)}
          title={isReadOnly ? "View details" : "Edit"}
          className="rounded p-1.5 hover:bg-muted transition-colors"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button
          onClick={() => onDelete(cmd)}
          disabled={isReadOnly}
          title={isReadOnly ? "Cannot delete built-in / skill" : "Delete"}
          className="rounded p-1.5 hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───

type ViewMode = "grid" | "list";

export function CommandsPage() {
  const {
    commands: allCommands,
    loading,
    error,
    refresh,
    createCommand,
    updateCommand,
    deleteCommand,
  } = useCommands("all");
  // Exclude skill-backed commands — those are surfaced on the Skills page instead
  const commands = allCommands.filter((c) => c.source !== "skill");
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editTarget, setEditTarget] = useState<CommandEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommandEntry | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const existingNames = useMemo(
    () => new Set(commands.map((c) => c.name.toLowerCase())),
    [commands],
  );

  // Derive category list
  const categories = useMemo(() => {
    const cats = new Set(commands.map((c) => c.category ?? "general"));
    return ["all", ...Array.from(cats).toSorted()];
  }, [commands]);

  // Filtered commands
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return commands.filter((c) => {
      const matchSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        (c.category ?? "").toLowerCase().includes(q);
      const matchCat = filterCategory === "all" || (c.category ?? "general") === filterCategory;
      return matchSearch && matchCat;
    });
  }, [commands, search, filterCategory]);

  const handleCreate = useCallback(
    async (input: CommandCreateInput | CommandUpdateInput) => {
      await createCommand(input as CommandCreateInput);
      toast("Command created", "success");
    },
    [createCommand, toast],
  );

  const handleUpdate = useCallback(
    async (input: CommandCreateInput | CommandUpdateInput) => {
      await updateCommand(input as CommandUpdateInput);
      toast("Command updated", "success");
    },
    [updateCommand, toast],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      await deleteCommand(name);
      setDeleteTarget(null);
      toast("Command deleted", "success");
    },
    [deleteCommand, toast],
  );

  const handleExport = useCallback(() => {
    const userCmds = commands.filter((c) => c.source === "user");
    const blob = new Blob([JSON.stringify(userCmds, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "commands-export.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [commands]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      e.target.value = "";
      try {
        const entries = JSON.parse(await file.text()) as CommandEntry[];
        if (!Array.isArray(entries)) {
          throw new Error("Expected an array");
        }
        let created = 0;
        let skipped = 0;
        for (const entry of entries) {
          if (!entry.name || !entry.description) {
            skipped++;
            continue;
          }
          if (existingNames.has(entry.name.toLowerCase())) {
            skipped++;
            continue;
          }
          try {
            await createCommand({
              name: entry.name,
              description: entry.description,
              body: entry.description,
              emoji: entry.emoji ?? undefined,
              category: entry.category ?? "general",
            });
            created++;
          } catch {
            skipped++;
          }
        }
        toast(
          `Imported ${created} command${created !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped)` : ""}`,
          "success",
        );
        await refresh();
      } catch (err) {
        toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
    [existingNames, createCommand, refresh, toast],
  );

  const openEdit = useCallback((c: CommandEntry) => {
    setEditTarget(c);
    setFormMode(c.source === "builtin" ? "view" : "edit");
  }, []);

  const openDelete = useCallback((c: CommandEntry) => {
    setDeleteTarget(c);
  }, []);

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Slash className="h-5 w-5 text-primary" />
            Commands
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your slash command registry. Type{" "}
            <code className="text-xs bg-muted px-1 rounded">/</code> in chat to invoke. Skill
            commands appear on the Skills page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExport}
            disabled={commands.filter((c) => c.source === "user").length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => importRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => void refresh()}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditTarget(null);
              setFormMode("create");
            }}
          >
            <Plus className="h-4 w-4" />
            New Command
          </Button>
        </div>
      </div>

      {/* ── Search + filter bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search commands…"
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Category filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={cn(
                "text-xs px-2.5 py-1 rounded-full border transition-colors capitalize",
                filterCategory === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-0.5 ml-auto border rounded-md p-0.5">
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "p-1.5 rounded transition-colors",
              viewMode === "grid"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn(
              "p-1.5 rounded transition-colors",
              viewMode === "list"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Count ── */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} command{filtered.length !== 1 ? "s" : ""}
          {filterCategory !== "all" || search ? " matching" : ""} ·{" "}
          {commands.filter((c) => c.source === "builtin").length} built-in ·{" "}
          {commands.filter((c) => c.source === "user").length} user-defined
        </p>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading commands…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Slash className="h-10 w-10 opacity-20" />
          <p className="text-sm">
            {search || filterCategory !== "all"
              ? "No commands match your search."
              : "No user commands yet. Built-in commands are always available in chat."}
          </p>
          {!search && filterCategory === "all" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditTarget(null);
                setFormMode("create");
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Create your first command
            </Button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <CommandCard key={c.commandId} cmd={c} onEdit={openEdit} onDelete={openDelete} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* List header */}
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/40 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <span className="w-7 shrink-0" />
            <span className="w-52 shrink-0">Name</span>
            <span className="flex-1">Description</span>
            <span className="w-24 text-right shrink-0">Category</span>
            <span className="w-16 shrink-0 text-right">Actions</span>
          </div>
          {filtered.map((c) => (
            <CommandRow key={c.commandId} cmd={c} onEdit={openEdit} onDelete={openDelete} />
          ))}
        </div>
      )}

      {/* ── Create / Edit dialog ── */}
      {formMode && (
        <CommandFormDialog
          mode={formMode}
          initial={editTarget ?? undefined}
          existingNames={existingNames}
          onSave={formMode === "create" ? handleCreate : handleUpdate}
          onClose={() => {
            setFormMode(null);
            setEditTarget(null);
          }}
        />
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <Dialog open onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete /{deleteTarget.name}?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              This permanently removes the command and its file. This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => void handleDelete(deleteTarget.name)}>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
