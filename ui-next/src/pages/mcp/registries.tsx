import { RefreshCw, Loader2, Trash2, Plus, RotateCcw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/custom/data/data-table";
import { Input } from "@/components/ui/input";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// ── Types ────────────────────────────────────────────────────────────────────

interface McpRegistry {
  id: string;
  name: string;
  url: string;
  visibility: string;
  enabled: boolean;
  description: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function McpRegistriesPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [registries, setRegistries] = useState<McpRegistry[]>([]);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", url: "" });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendRpc<{ registries: McpRegistry[] }>("mcp.registry.list");
      setRegistries(res.registries ?? []);
    } catch {
      setRegistries([]);
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (isConnected) {
      void loadData();
    }
  }, [isConnected, loadData]);

  const handleSync = useCallback(
    async (id: string) => {
      setActing(id);
      try {
        await sendRpc("mcp.registry.sync", { id });
        await loadData();
      } finally {
        setActing(null);
      }
    },
    [sendRpc, loadData],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      setActing(id);
      try {
        await sendRpc("mcp.registry.remove", { id });
        await loadData();
      } finally {
        setActing(null);
      }
    },
    [sendRpc, loadData],
  );

  const handleAdd = useCallback(async () => {
    if (!form.id || !form.name || !form.url) {
      return;
    }
    setLoading(true);
    try {
      await sendRpc("mcp.registry.add", form);
      setForm({ id: "", name: "", url: "" });
      setShowAdd(false);
      await loadData();
    } finally {
      setLoading(false);
    }
  }, [sendRpc, form, loadData]);

  const columns: Column<McpRegistry>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "url", header: "URL", sortable: true },
    { key: "visibility", header: "Visibility", sortable: true },
    {
      key: "enabled",
      header: "Enabled",
      sortable: true,
      render: (row) => (
        <span className={row.enabled ? "text-green-600" : "text-muted-foreground"}>
          {row.enabled ? "Yes" : "No"}
        </span>
      ),
    },
    { key: "description", header: "Description" },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={acting === row.id}
            onClick={() => handleSync(row.id)}
            title="Sync"
          >
            {acting === row.id ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RotateCcw className="size-3" />
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={acting === row.id}
            onClick={() => handleRemove(row.id)}
            title="Remove"
          >
            <Trash2 className="size-3" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">MCP Registries</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="size-4 mr-1" />
            Add Registry
          </Button>
          <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="flex items-end gap-2 rounded-lg border p-3 bg-muted/30">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">ID</label>
            <Input
              placeholder="my-registry"
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              placeholder="My Registry"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-48"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">URL</label>
            <Input
              placeholder="https://registry.example.com"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              className="w-72"
            />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!form.id || !form.name || !form.url}>
            Add
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={registries} pageSize={20} />
      )}
    </div>
  );
}
