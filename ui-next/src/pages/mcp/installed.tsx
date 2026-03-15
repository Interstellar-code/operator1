import {
  Search,
  RefreshCw,
  Loader2,
  Trash2,
  Zap,
  PowerOff,
  Power,
  Plus,
  Pencil,
  ChevronRight,
  X,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/custom/data/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// ── Types ────────────────────────────────────────────────────────────────────

interface McpServerConfig {
  url?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  timeout?: number;
  prefix?: string;
}

interface McpServerState {
  key: string;
  status: string;
  type: string;
  toolCount: number;
  toolNames: string[];
  lastError?: string | null;
  lastCallAt?: string | null;
  avgLatencyMs?: number | null;
  configured?: boolean;
  scope?: string;
  config?: McpServerConfig;
}

type TransportType = "http" | "sse" | "stdio";
type StatusFilter = "All" | "Connected" | "Unavailable" | "Disabled";

interface ServerFormData {
  key: string;
  type: TransportType;
  url: string;
  command: string;
  args: string;
  cwd: string;
  headers: string;
  env: string;
  timeout: string;
  prefix: string;
  scope: "user" | "project" | "local";
}

const EMPTY_FORM: ServerFormData = {
  key: "",
  type: "http",
  url: "",
  command: "",
  args: "",
  cwd: "",
  headers: "",
  env: "",
  timeout: "",
  prefix: "",
  scope: "user",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseKeyValue(text: string): Record<string, string> | undefined {
  if (!text.trim()) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const sep = line.indexOf("=");
    if (sep > 0) {
      result[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function serializeKeyValue(obj: Record<string, string> | undefined): string {
  if (!obj) {
    return "";
  }
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-green-500/10 text-green-600 border-green-500/20"
      : status === "disabled"
        ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
        : "bg-red-500/10 text-red-600 border-red-500/20";
  const dot =
    status === "connected"
      ? "bg-green-500"
      : status === "disabled"
        ? "bg-yellow-500"
        : "bg-red-500";
  const label =
    status === "connected" ? "Connected" : status === "disabled" ? "Disabled" : "Unavailable";
  return (
    <span
      className={cn(
        "text-xs font-medium px-2 py-0.5 rounded-full border inline-flex items-center gap-1",
        color,
      )}
    >
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
}

// ── Server Form Dialog ───────────────────────────────────────────────────────

function ServerFormDialog({
  open,
  onOpenChange,
  title,
  description,
  form,
  setForm,
  onSubmit,
  submitting,
  isEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  form: ServerFormData;
  setForm: (fn: (prev: ServerFormData) => ServerFormData) => void;
  onSubmit: () => void;
  submitting: boolean;
  isEdit: boolean;
}) {
  const isStdio = form.type === "stdio";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          {/* Server Key */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Server Name</label>
            <Input
              value={form.key}
              onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
              placeholder="my-server"
              disabled={isEdit}
            />
          </div>

          {/* Transport Type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Transport</label>
            <div className="flex gap-1">
              {(["http", "sse", "stdio"] as const).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={form.type === t ? "default" : "outline"}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  disabled={isEdit}
                >
                  {t.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>

          {/* Scope (add only) */}
          {!isEdit && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Scope</label>
              <div className="flex gap-1">
                {(["user", "project", "local"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={form.scope === s ? "default" : "outline"}
                    onClick={() => setForm((f) => ({ ...f, scope: s }))}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* URL (http/sse) */}
          {!isStdio && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">URL</label>
              <Input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://api.example.com/mcp"
              />
            </div>
          )}

          {/* Command (stdio) */}
          {isStdio && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Command</label>
                <Input
                  value={form.command}
                  onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
                  placeholder="/usr/local/bin/npx"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Arguments (one per line)
                </label>
                <textarea
                  value={form.args}
                  onChange={(e) => setForm((f) => ({ ...f, args: e.target.value }))}
                  placeholder={"-y\n@z_ai/mcp-server"}
                  rows={3}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Working Directory
                </label>
                <Input
                  value={form.cwd}
                  onChange={(e) => setForm((f) => ({ ...f, cwd: e.target.value }))}
                  placeholder="(optional)"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Environment Variables (KEY=value, one per line)
                </label>
                <textarea
                  value={form.env}
                  onChange={(e) => setForm((f) => ({ ...f, env: e.target.value }))}
                  placeholder={"API_KEY=sk-xxx\nMODE=production"}
                  rows={3}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </>
          )}

          {/* Headers (http/sse) */}
          {!isStdio && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Headers (KEY=value, one per line)
              </label>
              <textarea
                value={form.headers}
                onChange={(e) => setForm((f) => ({ ...f, headers: e.target.value }))}
                placeholder={"Authorization=Bearer sk-xxx"}
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          )}

          {/* Advanced: timeout, prefix */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Timeout (ms)</label>
              <Input
                value={form.timeout}
                onChange={(e) => setForm((f) => ({ ...f, timeout: e.target.value }))}
                placeholder="30000"
                type="number"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Tool Prefix</label>
              <Input
                value={form.prefix}
                onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))}
                placeholder="(server key)"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={submitting || !form.key.trim()}>
            {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
            {isEdit ? "Save Changes" : "Add Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Remove Confirmation Dialog ───────────────────────────────────────────────

function RemoveDialog({
  open,
  onOpenChange,
  serverKey,
  onConfirm,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverKey: string;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Server</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{serverKey}</strong>? This will disconnect the
            server and remove it from your config.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 mr-1 animate-spin" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Server Detail Panel ──────────────────────────────────────────────────────

function ServerDetailPanel({
  server,
  onClose,
  sendRpc,
}: {
  server: McpServerState;
  onClose: () => void;
  sendRpc: ReturnType<typeof useGateway>["sendRpc"];
}) {
  const [tools, setTools] = useState<Array<{ name: string; description: string }>>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  useEffect(() => {
    setLoadingTools(true);
    sendRpc<{ tools: Array<{ name: string; description: string }> }>("mcp.servers.tools", {
      server: server.key,
    })
      .then((res) => setTools(res.tools ?? []))
      .catch(() => setTools([]))
      .finally(() => setLoadingTools(false));
  }, [server.key, sendRpc]);

  return (
    <div className="border border-border rounded-lg bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{server.key}</h3>
          <StatusBadge status={server.status} />
          {server.scope && (
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {server.scope}
            </span>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
        <div>
          <span className="font-medium">Type:</span> {server.type}
        </div>
        <div>
          <span className="font-medium">Tools:</span> {server.toolCount}
        </div>
        <div>
          <span className="font-medium">Latency:</span>{" "}
          {server.avgLatencyMs != null ? `${Math.round(server.avgLatencyMs)}ms` : "-"}
        </div>
      </div>

      {server.lastError && (
        <div className="text-xs text-red-500 bg-red-500/5 border border-red-500/10 rounded p-2 font-mono">
          {server.lastError}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-muted-foreground">
          Discovered Tools ({tools.length})
        </h4>
        {loadingTools ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : tools.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tools discovered.</p>
        ) : (
          <div className="max-h-48 overflow-y-auto border border-border rounded">
            {tools.map((t) => (
              <div
                key={t.name}
                className="flex flex-col gap-0.5 px-3 py-1.5 border-b border-border/50 last:border-b-0"
              >
                <span className="text-xs font-mono font-medium">{t.name}</span>
                {t.description && (
                  <span className="text-[11px] text-muted-foreground leading-tight">
                    {t.description}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function McpInstalledPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [servers, setServers] = useState<McpServerState[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [acting, setActing] = useState<string | null>(null);

  // Dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [addForm, setAddForm] = useState<ServerFormData>(EMPTY_FORM);
  const [editForm, setEditForm] = useState<ServerFormData>(EMPTY_FORM);
  const [removeTarget, setRemoveTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Detail panel
  const [detailServer, setDetailServer] = useState<McpServerState | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendRpc<{ servers: McpServerState[] }>("mcp.servers.list");
      setServers(res.servers ?? []);
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) {
      void loadData();
    }
  }, [isConnected, loadData]);

  const filtered = useMemo(() => {
    let list = servers;
    if (statusFilter === "Connected") {
      list = list.filter((s) => s.status === "connected");
    } else if (statusFilter === "Unavailable") {
      list = list.filter((s) => s.status !== "connected" && s.status !== "disabled");
    } else if (statusFilter === "Disabled") {
      list = list.filter((s) => s.status === "disabled");
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.key.toLowerCase().includes(q));
    }
    return list;
  }, [servers, search, statusFilter]);

  const [actionMessage, setActionMessage] = useState<{
    type: "error" | "success" | "info";
    text: string;
  } | null>(null);

  const act = useCallback(
    async (method: string, server: string) => {
      setActing(server);
      setActionMessage(null);
      try {
        await sendRpc(method, { server });
        await loadData();
      } catch (err) {
        setActionMessage({
          type: "error",
          text: `${method} failed for ${server}: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setActing(null);
      }
    },
    [sendRpc, loadData],
  );

  const testServer = useCallback(
    async (server: string) => {
      setActing(server);
      setActionMessage(null);
      try {
        const res = await sendRpc<{
          results: Array<{
            server: string;
            status: string;
            toolCount: number;
            latencyMs?: number | null;
            avgLatencyMs?: number | null;
            lastError?: string | null;
          }>;
        }>("mcp.servers.test", { server });
        const r = res.results?.[0];
        if (r) {
          const parts = [`${r.server}: ${r.status}`];
          if (r.status === "connected") {
            parts.push(`${r.toolCount} tools`);
            if (r.latencyMs != null) {
              parts.push(`${r.latencyMs}ms`);
            }
          }
          if (r.lastError) {
            parts.push(r.lastError);
          }
          setActionMessage({
            type: r.status === "connected" ? "success" : r.status === "disabled" ? "info" : "error",
            text: parts.join(" — "),
          });
        }
        // Refresh table to show updated latency + tool counts.
        await loadData();
      } catch (err) {
        setActionMessage({
          type: "error",
          text: `Test failed for ${server}: ${err instanceof Error ? err.message : String(err)}`,
        });
      } finally {
        setActing(null);
      }
    },
    [sendRpc, loadData],
  );

  // ── Add server ──
  const handleAdd = useCallback(async () => {
    setSubmitting(true);
    try {
      const params: Record<string, unknown> = {
        server: addForm.key.trim(),
        type: addForm.type,
        scope: addForm.scope,
      };
      if (addForm.type === "stdio") {
        if (addForm.command.trim()) {
          params.command = addForm.command.trim();
        }
        if (addForm.args.trim()) {
          params.args = addForm.args.trim().split("\n").filter(Boolean);
        }
        if (addForm.cwd.trim()) {
          params.cwd = addForm.cwd.trim();
        }
        const env = parseKeyValue(addForm.env);
        if (env) {
          params.env = env;
        }
      } else {
        if (addForm.url.trim()) {
          params.url = addForm.url.trim();
        }
        const headers = parseKeyValue(addForm.headers);
        if (headers) {
          params.headers = headers;
        }
      }
      if (addForm.timeout.trim()) {
        params.timeout = Number(addForm.timeout);
      }
      if (addForm.prefix.trim()) {
        params.prefix = addForm.prefix.trim();
      }

      await sendRpc("mcp.servers.add", params);
      setAddOpen(false);
      setAddForm(EMPTY_FORM);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }, [addForm, sendRpc, loadData]);

  // ── Edit server ──
  const openEdit = useCallback((row: McpServerState) => {
    const cfg = row.config;
    setEditForm({
      key: row.key,
      type: row.type as TransportType,
      url: cfg?.url ?? "",
      command: cfg?.command ?? "",
      args: cfg?.args?.join("\n") ?? "",
      cwd: cfg?.cwd ?? "",
      headers: serializeKeyValue(cfg?.headers),
      env: serializeKeyValue(cfg?.env),
      timeout: cfg?.timeout != null ? String(cfg.timeout) : "",
      prefix: cfg?.prefix ?? "",
      scope: (row.scope as "user" | "project" | "local") ?? "user",
    });
    setEditOpen(true);
  }, []);

  const handleEdit = useCallback(async () => {
    setSubmitting(true);
    try {
      const params: Record<string, unknown> = { server: editForm.key };
      if (editForm.type === "stdio") {
        if (editForm.command.trim()) {
          params.command = editForm.command.trim();
        }
        if (editForm.args.trim()) {
          params.args = editForm.args.trim().split("\n").filter(Boolean);
        }
        if (editForm.cwd.trim()) {
          params.cwd = editForm.cwd.trim();
        }
        const env = parseKeyValue(editForm.env);
        if (env) {
          params.env = env;
        }
      } else {
        if (editForm.url.trim()) {
          params.url = editForm.url.trim();
        }
        const headers = parseKeyValue(editForm.headers);
        if (headers) {
          params.headers = headers;
        }
      }
      if (editForm.timeout.trim()) {
        params.timeout = Number(editForm.timeout);
      }
      if (editForm.prefix.trim()) {
        params.prefix = editForm.prefix.trim();
      }

      await sendRpc("mcp.servers.configure", params);
      setEditOpen(false);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  }, [editForm, sendRpc, loadData]);

  // ── Remove server ──
  const openRemove = useCallback((key: string) => {
    setRemoveTarget(key);
    setRemoveOpen(true);
  }, []);

  const handleRemove = useCallback(async () => {
    setSubmitting(true);
    try {
      await sendRpc("mcp.servers.remove", { server: removeTarget });
      setRemoveOpen(false);
      setRemoveTarget("");
      if (detailServer?.key === removeTarget) {
        setDetailServer(null);
      }
      await loadData();
    } catch (err) {
      setActionMessage({
        type: "error",
        text: `Remove failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      setRemoveOpen(false);
    } finally {
      setSubmitting(false);
    }
  }, [removeTarget, sendRpc, loadData, detailServer]);

  // ── Table columns ──
  const columns: Column<McpServerState>[] = [
    {
      key: "key",
      header: "Name",
      sortable: true,
      render: (row) => (
        <button
          className="text-left font-medium hover:underline flex items-center gap-1 cursor-pointer"
          onClick={() => setDetailServer(row)}
        >
          {row.key}
          <ChevronRight className="size-3 text-muted-foreground" />
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: "type", header: "Type", sortable: true },
    {
      key: "toolCount",
      header: "Tools",
      sortable: true,
      render: (row) => <span title={row.toolNames.join(", ")}>{row.toolCount}</span>,
    },
    {
      key: "scope",
      header: "Scope",
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-muted-foreground">{row.scope ?? "-"}</span>
      ),
    },
    {
      key: "avgLatencyMs",
      header: "Latency",
      sortable: true,
      render: (row) => (row.avgLatencyMs != null ? `${Math.round(row.avgLatencyMs)}ms` : "-"),
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const isInline = row.scope === "inline";
        return (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={acting === row.key}
              onClick={() => testServer(row.key)}
              title="Test"
            >
              <Zap className="size-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting === row.key || isInline}
              onClick={() => openEdit(row)}
              title={isInline ? "Edit not available for inline-configured servers" : "Edit"}
            >
              <Pencil className="size-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting === row.key}
              onClick={() =>
                act(
                  row.status === "disabled" ? "mcp.servers.enable" : "mcp.servers.disable",
                  row.key,
                )
              }
              title={row.status === "disabled" ? "Enable" : "Disable"}
            >
              {row.status === "disabled" ? (
                <Power className="size-3" />
              ) : (
                <PowerOff className="size-3" />
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={acting === row.key || isInline}
              onClick={() => openRemove(row.key)}
              title={isInline ? "Remove not available for inline-configured servers" : "Remove"}
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        );
      },
    },
  ];

  const STATUS_FILTERS: StatusFilter[] = ["All", "Connected", "Unavailable", "Disabled"];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Installed MCP Servers</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setAddForm(EMPTY_FORM);
              setAddOpen(true);
            }}
          >
            <Plus className="size-4 mr-1" />
            Add Server
          </Button>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-1">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={statusFilter === f ? "default" : "outline"}
            onClick={() => setStatusFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Search servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {actionMessage && (
        <div
          className={cn(
            "text-xs rounded p-2 font-mono border",
            actionMessage.type === "error" && "text-red-500 bg-red-500/5 border-red-500/10",
            actionMessage.type === "success" && "text-green-500 bg-green-500/5 border-green-500/10",
            actionMessage.type === "info" && "text-yellow-500 bg-yellow-500/5 border-yellow-500/10",
          )}
        >
          {actionMessage.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} pageSize={20} />
      )}

      {/* Detail panel */}
      {detailServer && (
        <ServerDetailPanel
          server={detailServer}
          onClose={() => setDetailServer(null)}
          sendRpc={sendRpc}
        />
      )}

      {/* Add dialog */}
      <ServerFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add MCP Server"
        description="Configure a new MCP server connection."
        form={addForm}
        setForm={setAddForm}
        onSubmit={handleAdd}
        submitting={submitting}
        isEdit={false}
      />

      {/* Edit dialog */}
      <ServerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Server"
        description={`Update configuration for ${editForm.key}.`}
        form={editForm}
        setForm={setEditForm}
        onSubmit={handleEdit}
        submitting={submitting}
        isEdit={true}
      />

      {/* Remove confirmation */}
      <RemoveDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        serverKey={removeTarget}
        onConfirm={handleRemove}
        submitting={submitting}
      />
    </div>
  );
}
