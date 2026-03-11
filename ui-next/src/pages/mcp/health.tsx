import { Activity, CheckCircle2, AlertTriangle, RefreshCw, Loader2, Zap } from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/custom/data/data-table";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

// ── Types ────────────────────────────────────────────────────────────────────

interface McpHealthEntry {
  key: string;
  status: string;
  type: string;
  toolCount: number;
  avgLatencyMs: number | null;
  lastCallAt: string | null;
  lastError: string | null;
}

interface HealthSummary {
  total: number;
  connected: number;
  unavailable: number;
}

interface HealthResponse {
  servers: McpHealthEntry[];
  summary: HealthSummary;
}

// ── Status dot ───────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const connected = status === "connected";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", connected ? "bg-green-500" : "bg-red-500")} />
      <span className={connected ? "text-green-600" : "text-red-600"}>
        {connected ? "Connected" : "Unavailable"}
      </span>
    </span>
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Activity;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className={cn("rounded-md p-2", color)}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function McpHealthPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const [servers, setServers] = useState<McpHealthEntry[]>([]);
  const [summary, setSummary] = useState<HealthSummary>({ total: 0, connected: 0, unavailable: 0 });
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendRpc<HealthResponse>("mcp.health.status");
      setServers(res.servers ?? []);
      setSummary(res.summary ?? { total: 0, connected: 0, unavailable: 0 });
    } catch {
      setServers([]);
    } finally {
      setLoading(false);
    }
  }, [sendRpc]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }
    void loadData();
    intervalRef.current = setInterval(() => void loadData(), 5000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isConnected, loadData]);

  const handleCheck = useCallback(
    async (key: string) => {
      setChecking(key);
      try {
        await sendRpc("mcp.health.check", { key });
        await loadData();
      } finally {
        setChecking(null);
      }
    },
    [sendRpc, loadData],
  );

  const columns: Column<McpHealthEntry>[] = [
    { key: "key", header: "Server", sortable: true },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusDot status={row.status} />,
    },
    { key: "type", header: "Type", sortable: true },
    { key: "toolCount", header: "Tools", sortable: true },
    {
      key: "avgLatencyMs",
      header: "Avg Latency",
      sortable: true,
      render: (row) => (row.avgLatencyMs != null ? `${Math.round(row.avgLatencyMs)}ms` : "-"),
    },
    {
      key: "lastCallAt",
      header: "Last Call",
      render: (row) => (row.lastCallAt ? new Date(row.lastCallAt).toLocaleTimeString() : "-"),
    },
    {
      key: "lastError",
      header: "Last Error",
      render: (row) =>
        row.lastError ? (
          <span
            className="text-xs text-red-600 truncate max-w-[200px] inline-block"
            title={row.lastError}
          >
            {row.lastError}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          disabled={checking === row.key}
          onClick={() => handleCheck(row.key)}
          title="Health check"
        >
          {checking === row.key ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Zap className="size-3" />
          )}
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">MCP Health</h1>
        <Button size="sm" variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn("size-4 mr-1", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard
          label="Total Servers"
          value={summary.total}
          icon={Activity}
          color="bg-blue-500/10 text-blue-600"
        />
        <SummaryCard
          label="Connected"
          value={summary.connected}
          icon={CheckCircle2}
          color="bg-green-500/10 text-green-600"
        />
        <SummaryCard
          label="Unavailable"
          value={summary.unavailable}
          icon={AlertTriangle}
          color="bg-red-500/10 text-red-600"
        />
      </div>

      {loading && servers.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <DataTable columns={columns} data={servers} pageSize={20} />
      )}
    </div>
  );
}
