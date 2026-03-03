import {
  Bug,
  Send,
  ChevronDown,
  ChevronRight,
  Heart,
  Activity,
  Handshake,
  Trash2,
} from "lucide-react";
import { useState, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "@/components/ui/custom/data";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

type HeartbeatInfo = {
  ts?: number;
  status?: string;
  reason?: string;
  durationMs?: number;
};

/** Event type → badge color */
const eventBadgeStyles: Record<string, string> = {
  chat: "text-primary bg-primary/10",
  presence: "text-chart-2 bg-chart-2/10",
  health: "text-chart-4 bg-chart-4/10",
  tick: "text-muted-foreground bg-muted/40",
  config: "text-chart-5 bg-chart-5/10",
  error: "text-destructive bg-destructive/10",
};

/** Format epoch ms to compact time string */
function fmtTime(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${ms}`;
}

/** Extract a short summary from event payload */
function eventSummary(event: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const p = payload as Record<string, unknown>;
  if (event === "health") {
    const hb = p.heartbeat as Record<string, unknown> | undefined;
    if (hb?.status) {
      return `heartbeat=${JSON.stringify(hb.status)}`;
    }
  }
  if (event === "presence") {
    const list = p.presence;
    if (Array.isArray(list)) {
      return `${list.length} client${list.length !== 1 ? "s" : ""}`;
    }
  }
  if (event === "chat") {
    const state = p.state as string | undefined;
    const runId = p.runId as string | undefined;
    if (state) {
      return `${state}${runId ? ` run=${runId.slice(0, 8)}` : ""}`;
    }
  }
  if (event === "tick") {
    const ts = p.ts as number | undefined;
    if (ts) {
      return fmtTime(ts);
    }
  }
  // Generic: show first few keys
  const keys = Object.keys(p).slice(0, 3);
  if (keys.length > 0) {
    return keys.join(", ");
  }
  return null;
}

export function DebugPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const eventLog = useGatewayStore((s) => s.eventLog);
  const hello = useGatewayStore((s) => s.hello);
  const healthSnapshot = useGatewayStore((s) => s.healthSnapshot);

  const [rpcMethod, setRpcMethod] = useState("health");
  const [rpcParams, setRpcParams] = useState("{}");
  const [rpcResult, setRpcResult] = useState<unknown>(null);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [rpcLoading, setRpcLoading] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [rpcHistory, setRpcHistory] = useState<string[]>([]);
  const [showMethodList, setShowMethodList] = useState(false);
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const clearEventLog = useGatewayStore((s) => s.clearEventLog);
  const methodInputRef = useRef<HTMLInputElement>(null);

  // Heartbeat info - extracted from health snapshot
  const heartbeat: HeartbeatInfo | null = (() => {
    const snap = healthSnapshot as Record<string, unknown> | null;
    if (!snap) {
      return null;
    }
    const hb = snap.heartbeat as HeartbeatInfo | undefined;
    return hb ?? null;
  })();

  // Available RPC methods from hello handshake
  const availableMethods = hello?.features?.methods ?? [];
  const methodSuggestions = availableMethods.filter(
    (m) => !rpcMethod || m.toLowerCase().includes(rpcMethod.toLowerCase()),
  );

  const handleRpcCall = useCallback(async () => {
    setRpcLoading(true);
    setRpcResult(null);
    setRpcError(null);
    try {
      let params: unknown = {};
      if (rpcParams.trim()) {
        params = JSON.parse(rpcParams);
      }
      const result = await sendRpc(rpcMethod, params);
      setRpcResult(result);
      // Track history (deduplicate, keep last 10)
      setRpcHistory((prev) => [rpcMethod, ...prev.filter((m) => m !== rpcMethod)].slice(0, 10));
    } catch (e) {
      setRpcError((e as Error).message);
    } finally {
      setRpcLoading(false);
    }
  }, [sendRpc, rpcMethod, rpcParams]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bug className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Debug</h1>
        </div>

        {/* Snapshot trigger buttons */}
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" disabled={!heartbeat}>
                <Heart
                  className={cn(
                    "h-3.5 w-3.5",
                    heartbeat?.status === "ok"
                      ? "text-chart-2"
                      : heartbeat?.status === "skipped"
                        ? "text-chart-5"
                        : "text-muted-foreground",
                  )}
                />
                Heartbeat
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle className="font-mono">Heartbeat</SheetTitle>
                <SheetDescription>Live heartbeat status from the gateway</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                {heartbeat ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Heart
                        className={cn(
                          "h-5 w-5",
                          heartbeat.status === "ok"
                            ? "text-chart-2"
                            : heartbeat.status === "skipped"
                              ? "text-chart-5"
                              : "text-muted-foreground",
                        )}
                      />
                      <span className="text-sm font-mono font-semibold">
                        {heartbeat.status ?? "unknown"}
                      </span>
                    </div>
                    {heartbeat.reason && (
                      <div className="rounded border border-border bg-secondary/20 px-3 py-2 text-xs font-mono text-muted-foreground">
                        {heartbeat.reason}
                      </div>
                    )}
                    {heartbeat.durationMs != null && (
                      <div className="text-xs font-mono text-muted-foreground">
                        Duration: {heartbeat.durationMs}ms
                      </div>
                    )}
                    {heartbeat.ts && (
                      <div className="text-xs font-mono text-muted-foreground">
                        Last: {new Date(heartbeat.ts).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No heartbeat data available</p>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" disabled={!hello}>
                <Handshake className="h-3.5 w-3.5" />
                Hello
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle className="font-mono">Hello Snapshot</SheetTitle>
                <SheetDescription>Initial handshake payload from the gateway</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4 overflow-auto flex-1">
                {hello ? (
                  <JsonViewer data={hello} maxDepth={4} />
                ) : (
                  <p className="text-xs text-muted-foreground">No hello data</p>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" disabled={!healthSnapshot}>
                <Activity className="h-3.5 w-3.5" />
                Health
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle className="font-mono">Health Snapshot</SheetTitle>
                <SheetDescription>Current gateway health status</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4 overflow-auto flex-1">
                {healthSnapshot ? (
                  <JsonViewer data={healthSnapshot} maxDepth={4} />
                ) : (
                  <p className="text-xs text-muted-foreground">No health data</p>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* RPC Console */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-2">
          <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            RPC Console
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-2">
            <div className="flex-1 sm:max-w-xs relative">
              <label className="text-xs font-mono text-muted-foreground mb-1 block">Method</label>
              <input
                ref={methodInputRef}
                type="text"
                value={rpcMethod}
                onChange={(e) => {
                  setRpcMethod(e.target.value);
                  setShowMethodList(true);
                }}
                onFocus={() => setShowMethodList(true)}
                onBlur={() => {
                  // Delay to allow click on suggestion
                  setTimeout(() => setShowMethodList(false), 150);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setShowMethodList(false);
                  }
                }}
                placeholder="e.g. health"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground"
              />
              {showMethodList && (methodSuggestions.length > 0 || rpcHistory.length > 0) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-md border border-border bg-card shadow-lg max-h-48 overflow-auto">
                  {rpcHistory.length > 0 && !rpcMethod && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                        Recent
                      </div>
                      {rpcHistory.map((m) => (
                        <button
                          key={`h-${m}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setRpcMethod(m);
                            setShowMethodList(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-secondary/30 text-muted-foreground"
                        >
                          {m}
                        </button>
                      ))}
                      <div className="border-t border-border/50" />
                    </>
                  )}
                  {methodSuggestions.slice(0, 20).map((m) => (
                    <button
                      key={m}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setRpcMethod(m);
                        setShowMethodList(false);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-secondary/30"
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1">
              <label className="text-xs font-mono text-muted-foreground mb-1 block">
                Params (JSON)
              </label>
              <input
                type="text"
                value={rpcParams}
                onChange={(e) => setRpcParams(e.target.value)}
                placeholder="{}"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm font-mono outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] placeholder:text-muted-foreground"
              />
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleRpcCall}
              disabled={!isConnected || rpcLoading || !rpcMethod}
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </div>

          {rpcError && (
            <div className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-mono text-destructive">
              {rpcError}
            </div>
          )}

          {rpcResult != null && (
            <div>
              <h3 className="text-xs font-mono text-muted-foreground mb-1">Response</h3>
              <JsonViewer data={rpcResult} maxDepth={6} />
            </div>
          )}
        </div>
      </div>

      {/* Event log */}
      <EventLog
        eventLog={eventLog}
        eventFilter={eventFilter}
        setEventFilter={setEventFilter}
        expandedEvent={expandedEvent}
        setExpandedEvent={setExpandedEvent}
        onClear={clearEventLog}
      />
    </div>
  );
}

/* ─── Event Log component ─── */

type EventLogProps = {
  eventLog: Array<{ ts: number; event: string; payload?: unknown }>;
  eventFilter: string | null;
  setEventFilter: (f: string | null) => void;
  expandedEvent: string | null;
  setExpandedEvent: (k: string | null) => void;
  onClear: () => void;
};

function EventLog({
  eventLog,
  eventFilter,
  setEventFilter,
  expandedEvent,
  setExpandedEvent,
  onClear,
}: EventLogProps) {
  // Unique event types for filter pills
  const eventTypes = useMemo(() => {
    const seen = new Set<string>();
    for (const evt of eventLog) {
      seen.add(evt.event);
    }
    return [...seen].slice().toSorted();
  }, [eventLog]);

  // Filtered events
  const filtered = useMemo(
    () => (eventFilter ? eventLog.filter((e) => e.event === eventFilter) : eventLog),
    [eventLog, eventFilter],
  );

  const countLabel = eventFilter
    ? `${filtered.length} of ${eventLog.length}`
    : `${eventLog.length}`;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2 gap-2">
        <h2 className="text-sm font-mono uppercase tracking-wider text-muted-foreground shrink-0">
          Event Log
        </h2>

        {/* Filter pills */}
        <div className="flex items-center gap-1 flex-wrap flex-1 justify-end">
          {eventTypes.map((t) => {
            const active = eventFilter === t;
            const style = eventBadgeStyles[t] ?? "text-foreground bg-secondary/40";
            return (
              <button
                key={t}
                onClick={() => setEventFilter(active ? null : t)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold transition-colors",
                  active ? style : "text-muted-foreground bg-transparent hover:bg-secondary/30",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-muted-foreground tabular-nums">{countLabel}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={eventLog.length === 0}
            className="h-6 w-6 p-0"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Event rows */}
      <div className="max-h-[32rem] overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            {eventFilter ? `No "${eventFilter}" events` : "No events yet"}
          </div>
        ) : (
          filtered.map((evt, i) => {
            const key = `${evt.ts}-${i}`;
            const isExpanded = expandedEvent === key;
            const badge = eventBadgeStyles[evt.event] ?? "text-foreground bg-secondary/40";
            const summary = eventSummary(evt.event, evt.payload);

            return (
              <div
                key={key}
                className={cn(
                  "border-b border-border/20 last:border-0",
                  i % 2 === 0 ? "bg-transparent" : "bg-secondary/5",
                )}
              >
                <div
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => setExpandedEvent(isExpanded ? null : key)}
                >
                  {/* Expand chevron */}
                  {evt.payload ? (
                    isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )
                  ) : (
                    <div className="w-3 shrink-0" />
                  )}

                  {/* Timestamp */}
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0 w-[85px] tabular-nums">
                    {fmtTime(evt.ts)}
                  </span>

                  {/* Event type badge */}
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-mono font-semibold shrink-0",
                      badge,
                    )}
                  >
                    {evt.event}
                  </span>

                  {/* Inline summary */}
                  {Boolean(summary) && (
                    <span className="text-[11px] font-mono text-muted-foreground truncate">
                      {summary}
                    </span>
                  )}
                </div>

                {/* Expanded payload */}
                {Boolean(isExpanded) && Boolean(evt.payload) ? (
                  <div className="px-4 pb-3 pl-[7.5rem]">
                    <JsonViewer data={evt.payload} maxDepth={4} />
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
