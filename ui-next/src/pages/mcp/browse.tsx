import { Search, RefreshCw, Loader2, Download } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/custom/data/data-table";
import { Input } from "@/components/ui/input";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// ── Types ────────────────────────────────────────────────────────────────────

interface McpRegistryServer {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  toolCount: number;
  registry: string;
  installed: boolean;
}

// ── Category tabs ────────────────────────────────────────────────────────────

const CATEGORIES = ["All", "Code", "Search", "Productivity", "Database"] as const;
type Category = (typeof CATEGORIES)[number];

// ── Component ────────────────────────────────────────────────────────────────

export function McpBrowsePage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [servers, setServers] = useState<McpRegistryServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [installing, setInstalling] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendRpc<{ servers: McpRegistryServer[] }>("mcp.browse.list");
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
    if (category !== "All") {
      list = list.filter((s) => s.category.toLowerCase() === category.toLowerCase());
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [servers, search, category]);

  const handleInstall = useCallback(
    async (id: string) => {
      setInstalling(id);
      try {
        await sendRpc("mcp.browse.install", { id });
        await loadData();
      } finally {
        setInstalling(null);
      }
    },
    [sendRpc, loadData],
  );

  const columns: Column<McpRegistryServer>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "type", header: "Type", sortable: true },
    { key: "category", header: "Category", sortable: true },
    { key: "toolCount", header: "Tools", sortable: true },
    { key: "registry", header: "Registry", sortable: true },
    {
      key: "action",
      header: "Action",
      render: (row) =>
        row.installed ? (
          <span className="text-xs text-muted-foreground">Installed</span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={installing === row.id}
            onClick={() => handleInstall(row.id)}
          >
            {installing === row.id ? (
              <Loader2 className="size-3 animate-spin mr-1" />
            ) : (
              <Download className="size-3 mr-1" />
            )}
            Install
          </Button>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Browse MCP Servers</h1>
        <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            size="sm"
            variant={category === cat ? "default" : "outline"}
            onClick={() => setCategory(cat)}
          >
            {cat}
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={filtered} pageSize={20} />
      )}
    </div>
  );
}
