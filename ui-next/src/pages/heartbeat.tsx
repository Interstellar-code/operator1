import {
  Activity,
  CheckCircle2,
  Clock,
  Heart,
  Loader2,
  Play,
  Power,
  PowerOff,
  RefreshCw,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/custom/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHeartbeat, type HeartbeatEvent, type HeartbeatSummary } from "@/hooks/use-heartbeat";
import { useGatewayStore } from "@/store/gateway-store";

/* ── Helpers ──────────────────────────────────────────────── */

function formatTs(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) {
    return `${Math.round(diffMs / 1000)}s ago`;
  }
  if (diffMs < 3_600_000) {
    return `${Math.round(diffMs / 60_000)}m ago`;
  }
  if (diffMs < 86_400_000) {
    return `${Math.round(diffMs / 3_600_000)}h ago`;
  }
  return `${Math.round(diffMs / 86_400_000)}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function statusIcon(status: HeartbeatEvent["status"]) {
  switch (status) {
    case "sent":
      return <Activity className="h-4 w-4 text-blue-500" />;
    case "ok-empty":
    case "ok-token":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "skipped":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
  }
}

function statusLabel(status: HeartbeatEvent["status"]): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "ok-empty":
      return "OK (empty)";
    case "ok-token":
      return "OK (token)";
    case "skipped":
      return "Skipped";
    case "failed":
      return "Failed";
  }
}

/* ── Components ───────────────────────────────────────────── */

function HeartbeatEventCard({ event }: { event: HeartbeatEvent }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
      <div className="mt-0.5">{statusIcon(event.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatTs(event.ts)}</span>
          <span>({formatRelative(event.ts)})</span>
          {event.durationMs != null && <span>{formatDuration(event.durationMs)}</span>}
          {event.reason && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{event.reason}</span>
          )}
        </div>
        <div className="mt-1 font-medium">{statusLabel(event.status)}</div>
        {event.preview && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-2 font-mono">
            {event.preview}
          </div>
        )}
        {event.channel && (
          <div className="mt-1 text-xs text-muted-foreground">
            Channel: {event.channel}
            {event.to ? ` → ${event.to}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentHeartbeatCard({ summary }: { summary: HeartbeatSummary }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-sm font-medium">{summary.agentId}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            summary.enabled
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {summary.enabled ? (
            <>
              <Power className="h-3 w-3" /> Enabled
            </>
          ) : (
            <>
              <PowerOff className="h-3 w-3" /> Disabled
            </>
          )}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div>
          Interval: <span className="font-mono text-foreground">{summary.every}</span>
        </div>
        {summary.model && (
          <div>
            Model: <span className="font-mono text-foreground">{summary.model}</span>
          </div>
        )}
        {summary.target && (
          <div>
            Target: <span className="font-mono text-foreground">{summary.target}</span>
          </div>
        )}
        {summary.activeHours && (
          <div>
            Hours:{" "}
            <span className="font-mono text-foreground">
              {summary.activeHours.start}–{summary.activeHours.end}
            </span>
          </div>
        )}
        {summary.ackMaxChars != null && (
          <div>
            Ack limit: <span className="font-mono text-foreground">{summary.ackMaxChars}</span>
          </div>
        )}
        {summary.session && (
          <div>
            Session: <span className="font-mono text-foreground">{summary.session}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */

export function HeartbeatPage() {
  const connected = useGatewayStore((s) => s.connectionStatus === "connected");
  const { getLastHeartbeat, setHeartbeatsEnabled, getHeartbeatConfig, runHeartbeatNow } =
    useHeartbeat();
  const { toast } = useToast();

  const [lastEvent, setLastEvent] = useState<HeartbeatEvent | null>(null);
  const [agents, setAgents] = useState<HeartbeatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [toggling, setToggling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      const [event, config] = await Promise.all([getLastHeartbeat(), getHeartbeatConfig()]);
      setLastEvent(event);
      if (config?.agents) {
        setAgents(config.agents);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [getLastHeartbeat, getHeartbeatConfig]);

  useEffect(() => {
    if (!connected) {
      return;
    }
    void refresh();
    pollRef.current = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(pollRef.current);
  }, [connected, refresh]);

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await runHeartbeatNow();
      toast("Heartbeat triggered", "success");
      // Refresh after a short delay to see result
      setTimeout(() => void refresh(), 3000);
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setRunning(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setToggling(true);
    try {
      await setHeartbeatsEnabled(enabled);
      toast(enabled ? "Heartbeats enabled" : "Heartbeats disabled", "success");
      void refresh();
    } catch (err) {
      toast(`Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    } finally {
      setToggling(false);
    }
  };

  const anyEnabled = agents.some((a) => a.enabled);

  if (!connected) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Not connected to gateway
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="h-6 w-6 text-red-500" />
            <div>
              <h1 className="text-lg font-semibold">Heartbeat</h1>
              <p className="text-sm text-muted-foreground">
                Periodic agent health checks and task execution
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRunNow}
              disabled={running || !anyEnabled}
            >
              {running ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Run Now
            </Button>
            <Button
              variant={anyEnabled ? "destructive" : "default"}
              size="sm"
              onClick={() => void handleToggle(!anyEnabled)}
              disabled={toggling}
            >
              {toggling ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : anyEnabled ? (
                <PowerOff className="h-4 w-4 mr-1" />
              ) : (
                <Power className="h-4 w-4 mr-1" />
              )}
              {anyEnabled ? "Disable" : "Enable"}
            </Button>
          </div>
        </div>

        {/* Last Event */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Last Heartbeat
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : lastEvent ? (
            <HeartbeatEventCard event={lastEvent} />
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
              No heartbeat events recorded yet
            </div>
          )}
        </div>

        {/* Agent Configs */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Agent Configuration ({agents.length})
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              No agents with heartbeat configuration found
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {agents.map((a) => (
                <AgentHeartbeatCard key={a.agentId} summary={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
