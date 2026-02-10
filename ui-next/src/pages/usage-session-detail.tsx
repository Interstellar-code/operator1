import {
  X,
  DollarSign,
  Clock,
  Wrench,
  MessageSquare,
  AlertTriangle,
  ChevronDown,
  Search,
  Cpu,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* ── Types ────────────────────────────────────────────────────────── */

type Role = "user" | "assistant" | "tool" | "toolResult";

type TimeSeriesPoint = {
  timestamp: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  cumulativeTokens: number;
  cumulativeCost: number;
};

type SessionDetailProps = {
  sessionKey: string;
  session: {
    key: string;
    label?: string;
    agentId?: string;
    channel?: string;
    model?: string;
    usage: {
      totalTokens: number;
      totalCost: number;
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      durationMs?: number;
      firstActivity?: number;
      lastActivity?: number;
      messageCounts?: {
        total: number;
        user: number;
        assistant: number;
        toolCalls: number;
        toolResults: number;
        errors: number;
      };
      toolUsage?: {
        totalCalls: number;
        uniqueTools: number;
        tools: Array<{ name: string; count: number }>;
      };
      modelUsage?: Array<{
        provider?: string;
        model?: string;
        count: number;
        totals: { totalTokens: number; totalCost: number; [k: string]: unknown };
      }>;
      /** Context/system prompt breakdown data (optional) */
      contextBreakdown?: {
        system?: { label: string; chars: number }[];
        skills?: { label: string; chars: number }[];
        tools?: { label: string; chars: number }[];
        files?: { label: string; chars: number }[];
      };
      [k: string]: unknown;
    } | null;
    [k: string]: unknown;
  };
  timeSeries: { points: TimeSeriesPoint[] } | null;
  timeSeriesLoading: boolean;
  sessionLogs: Array<{
    timestamp: number;
    role: Role;
    content: string;
    tokens?: number;
    cost?: number;
    toolName?: string;
  }> | null;
  sessionLogsLoading: boolean;
  onClose: () => void;
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function formatCost(cost: number): string {
  if (cost === 0) {
    return "$0.00";
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1_000) {
    return `${ms}ms`;
  }
  const seconds = ms / 1_000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = Math.floor(seconds % 60);
  if (minutes < 60) {
    return `${minutes}m ${remainSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

const ROLE_COLORS: Record<string, string> = {
  user: "bg-blue-400/20 text-blue-400",
  assistant: "bg-green-400/20 text-green-400",
  tool: "bg-yellow-400/20 text-yellow-400",
  toolResult: "bg-orange-400/20 text-orange-400",
};

const ROLE_BORDER_COLORS: Record<string, string> = {
  user: "border-l-blue-400",
  assistant: "border-l-green-400",
  tool: "border-l-yellow-400",
  toolResult: "border-l-orange-400",
};

/* ── Mini stat card (inline) ──────────────────────────────────────── */

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-2.5 min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-primary/60 shrink-0">{icon}</span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">
          {label}
        </span>
      </div>
      <span className="text-base font-mono font-bold text-primary">{value}</span>
    </div>
  );
}

/* ── Token breakdown horizontal bar ──────────────────────────────── */

function TokenBreakdownBar({
  input,
  output,
  cacheRead,
  cacheWrite,
}: {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}) {
  const total = input + output + cacheRead + cacheWrite;
  if (total === 0) {
    return null;
  }

  const segments = [
    { label: "Input", value: input, className: "bg-primary" },
    { label: "Output", value: output, className: "bg-primary/70" },
    { label: "Cache Read", value: cacheRead, className: "bg-primary/45" },
    { label: "Cache Write", value: cacheWrite, className: "bg-primary/25" },
  ];

  return (
    <div className="space-y-1.5">
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted/30">
        {segments.map(
          (seg) =>
            seg.value > 0 && (
              <div
                key={seg.label}
                className={cn("h-full transition-all", seg.className)}
                style={{ width: `${(seg.value / total) * 100}%` }}
                title={`${seg.label}: ${formatTokens(seg.value)}`}
              />
            ),
        )}
      </div>
      <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
        <span>Input: {formatTokens(input)}</span>
        <span>Output: {formatTokens(output)}</span>
        <span>Cache: {formatTokens(cacheRead + cacheWrite)}</span>
      </div>
    </div>
  );
}

/* ── Time series chart with toggles ──────────────────────────────── */

type TsMode = "cumulative" | "perTurn";
type TsBreakdown = "total" | "byType";

function TimeSeriesChart({
  points,
  tsMode,
  tsBreakdown,
}: {
  points: TimeSeriesPoint[];
  tsMode: TsMode;
  tsBreakdown: TsBreakdown;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return null;
  }

  const height = 160;
  const width = 600;
  const padTop = 16;
  const padBottom = 24;
  const padLeft = 48;
  const padRight = 12;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const minTs = points[0].timestamp;
  const maxTs = points[points.length - 1].timestamp;
  const tsRange = maxTs - minTs || 1;

  const toX = (ts: number) => padLeft + ((ts - minTs) / tsRange) * chartW;

  if (tsMode === "cumulative") {
    // Area chart for cumulative
    const maxTokens = Math.max(...points.map((p) => p.cumulativeTokens), 1);
    const toY = (tokens: number) => padTop + chartH - (tokens / maxTokens) * chartH;

    const polylinePoints = points
      .map((p) => `${toX(p.timestamp)},${toY(p.cumulativeTokens)}`)
      .join(" ");

    const areaPath = [
      `M ${toX(points[0].timestamp)},${toY(points[0].cumulativeTokens)}`,
      ...points.slice(1).map((p) => `L ${toX(p.timestamp)},${toY(p.cumulativeTokens)}`),
      `L ${toX(points[points.length - 1].timestamp)},${padTop + chartH}`,
      `L ${toX(points[0].timestamp)},${padTop + chartH}`,
      "Z",
    ].join(" ");

    const yTicks = [0, maxTokens / 2, maxTokens];

    const xTickCount = Math.min(4, points.length);
    const xTicks = Array.from({ length: xTickCount }, (_, i) => {
      const ts = minTs + (tsRange * i) / (xTickCount - 1);
      return { x: toX(ts), label: formatTimestamp(ts) };
    });

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: `${height}px` }}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={toY(v)}
              y2={toY(v)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={0.5}
            />
            <text
              x={padLeft - 4}
              y={toY(v) + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono"
              style={{ fontSize: "9px" }}
            >
              {formatTokens(Math.round(v))}
            </text>
          </g>
        ))}
        <path d={areaPath} className="fill-primary/10" />
        <polyline
          points={polylinePoints}
          fill="none"
          className="stroke-primary"
          strokeWidth={1.5}
        />
        {xTicks.map((tick, i) => (
          <text
            key={i}
            x={tick.x}
            y={height - 4}
            textAnchor="middle"
            className="fill-muted-foreground font-mono"
            style={{ fontSize: "9px" }}
          >
            {tick.label}
          </text>
        ))}
      </svg>
    );
  }

  // Per-turn bar chart
  const barGap = 2;
  const barWidth = Math.max(2, Math.min(16, chartW / points.length - barGap));

  if (tsBreakdown === "byType") {
    // Stacked bars: output, input, cacheRead, cacheWrite
    const maxPerTurn = Math.max(
      ...points.map((p) => p.output + p.input + p.cacheRead + p.cacheWrite),
      1,
    );
    const toY = (v: number) => padTop + chartH - (v / maxPerTurn) * chartH;

    const yTicks = [0, maxPerTurn / 2, maxPerTurn];

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: `${height}px` }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={toY(v)}
              y2={toY(v)}
              stroke="currentColor"
              className="text-border"
              strokeWidth={0.5}
              strokeDasharray={v !== 0 && v !== maxPerTurn ? "4 3" : undefined}
            />
            <text
              x={padLeft - 4}
              y={toY(v) + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono"
              style={{ fontSize: "9px" }}
            >
              {formatTokens(Math.round(v))}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padLeft + (i / (points.length - 1 || 1)) * chartW - barWidth / 2;
          const total = p.output + p.input + p.cacheRead + p.cacheWrite;
          const isHovered = hoverIdx === i;
          // Stack from bottom: output, input, cacheRead, cacheWrite
          const segments = [
            { value: p.output, fill: isHovered ? "fill-primary" : "fill-primary/70" },
            { value: p.input, fill: isHovered ? "fill-primary/80" : "fill-primary/50" },
            { value: p.cacheRead, fill: isHovered ? "fill-primary/60" : "fill-primary/35" },
            { value: p.cacheWrite, fill: isHovered ? "fill-primary/40" : "fill-primary/20" },
          ];
          let yOffset = padTop + chartH;
          return (
            <g key={i}>
              <rect
                x={x - 2}
                y={padTop}
                width={barWidth + 4}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
              {segments.map((seg, si) => {
                if (seg.value === 0) {
                  return null;
                }
                const segH = (seg.value / maxPerTurn) * chartH;
                yOffset -= segH;
                return (
                  <rect
                    key={si}
                    x={x}
                    y={yOffset}
                    width={barWidth}
                    height={segH}
                    className={seg.fill}
                    rx={si === 0 && total === seg.value ? 1 : 0}
                    style={{ transition: "fill 0.1s" }}
                  />
                );
              })}
            </g>
          );
        })}
        {/* Hover tooltip via foreignObject */}
        {hoverIdx !== null && hoverIdx < points.length && (
          <foreignObject
            x={Math.min(toX(points[hoverIdx].timestamp), width - 140)}
            y={4}
            width={130}
            height={72}
          >
            <div className="rounded border border-border bg-popover px-2 py-1.5 text-[9px] font-mono shadow-md">
              <p className="text-foreground">{formatTimestamp(points[hoverIdx].timestamp)}</p>
              <p className="text-muted-foreground">Out: {formatTokens(points[hoverIdx].output)}</p>
              <p className="text-muted-foreground">In: {formatTokens(points[hoverIdx].input)}</p>
              <p className="text-muted-foreground">
                Cache: {formatTokens(points[hoverIdx].cacheRead + points[hoverIdx].cacheWrite)}
              </p>
            </div>
          </foreignObject>
        )}
      </svg>
    );
  }

  // Per-turn total bars
  const maxPerTurn = Math.max(...points.map((p) => p.totalTokens), 1);
  const toY = (v: number) => padTop + chartH - (v / maxPerTurn) * chartH;
  const yTicks = [0, maxPerTurn / 2, maxPerTurn];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      style={{ maxHeight: `${height}px` }}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={toY(v)}
            y2={toY(v)}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
            strokeDasharray={v !== 0 && v !== maxPerTurn ? "4 3" : undefined}
          />
          <text
            x={padLeft - 4}
            y={toY(v) + 3}
            textAnchor="end"
            className="fill-muted-foreground font-mono"
            style={{ fontSize: "9px" }}
          >
            {formatTokens(Math.round(v))}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const x = padLeft + (i / (points.length - 1 || 1)) * chartW - barWidth / 2;
        const barH = (p.totalTokens / maxPerTurn) * chartH;
        const isHovered = hoverIdx === i;
        return (
          <g key={i}>
            <rect
              x={x - 2}
              y={padTop}
              width={barWidth + 4}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
            <rect
              x={x}
              y={padTop + chartH - barH}
              width={barWidth}
              height={barH}
              className={isHovered ? "fill-primary" : "fill-primary/60"}
              rx={1}
              style={{ transition: "fill 0.1s" }}
            />
          </g>
        );
      })}
      {hoverIdx !== null && hoverIdx < points.length && (
        <foreignObject
          x={Math.min(toX(points[hoverIdx].timestamp), width - 130)}
          y={4}
          width={120}
          height={56}
        >
          <div className="rounded border border-border bg-popover px-2 py-1.5 text-[9px] font-mono shadow-md">
            <p className="text-foreground">{formatTimestamp(points[hoverIdx].timestamp)}</p>
            <p className="text-muted-foreground">
              {formatTokens(points[hoverIdx].totalTokens)} tokens
            </p>
            <p className="text-muted-foreground">{formatCost(points[hoverIdx].cost)}</p>
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

/* ── System prompt breakdown ─────────────────────────────────────── */

type ContextCategory = { label: string; chars: number };

const CTX_SEGMENTS = [
  { key: "system" as const, label: "System", barClass: "bg-red-400/70" },
  { key: "skills" as const, label: "Skills", barClass: "bg-purple-400/70" },
  { key: "tools" as const, label: "Tools", barClass: "bg-pink-400/70" },
  { key: "files" as const, label: "Files", barClass: "bg-orange-400/70" },
];

function SystemPromptBreakdown({
  breakdown,
}: {
  breakdown: {
    system?: ContextCategory[];
    skills?: ContextCategory[];
    tools?: ContextCategory[];
    files?: ContextCategory[];
  };
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const segmentData = CTX_SEGMENTS.map((seg) => {
    const items = breakdown[seg.key] ?? [];
    const totalChars = items.reduce((sum, item) => sum + item.chars, 0);
    return { ...seg, items, totalChars };
  }).filter((s) => s.totalChars > 0);

  const grandTotal = segmentData.reduce((sum, s) => sum + s.totalChars, 0);
  if (grandTotal === 0) {
    return null;
  }

  const estimatedTokens = Math.round(grandTotal / 4);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-mono font-semibold text-muted-foreground">
          System Prompt Breakdown
        </h3>
        <span className="text-[10px] font-mono text-muted-foreground">
          ~{formatTokens(estimatedTokens)} tokens est.
        </span>
      </div>

      {/* Stacked bar */}
      <div className="h-3 w-full rounded-full overflow-hidden flex bg-muted/30">
        {segmentData.map((seg) => (
          <div
            key={seg.key}
            className={cn("h-full transition-all cursor-pointer", seg.barClass)}
            style={{ width: `${(seg.totalChars / grandTotal) * 100}%` }}
            title={`${seg.label}: ${seg.totalChars.toLocaleString()} chars`}
            onClick={() => setExpanded(expanded === seg.key ? null : seg.key)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-muted-foreground">
        {segmentData.map((seg) => (
          <button
            key={seg.key}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            onClick={() => setExpanded(expanded === seg.key ? null : seg.key)}
          >
            <span className={cn("inline-block h-2 w-2 rounded-sm", seg.barClass)} />
            <span>
              {seg.label}: {seg.totalChars.toLocaleString()} chars
            </span>
          </button>
        ))}
      </div>

      {/* Collapsible detail */}
      {expanded &&
        (() => {
          const seg = segmentData.find((s) => s.key === expanded);
          if (!seg || seg.items.length === 0) {
            return null;
          }
          return (
            <div className="rounded-md border border-border bg-card p-2 space-y-1">
              <div className="flex items-center gap-1 mb-1">
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                <span className="text-[10px] font-mono font-semibold text-muted-foreground">
                  {seg.label} ({seg.items.length})
                </span>
              </div>
              {seg.items.slice(0, 12).map((item, i) => (
                <div key={i} className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-foreground/80 truncate max-w-[70%]">{item.label}</span>
                  <span className="text-muted-foreground">{item.chars.toLocaleString()} chars</span>
                </div>
              ))}
              {seg.items.length > 12 && (
                <p className="text-[10px] text-muted-foreground font-mono">
                  +{seg.items.length - 12} more
                </p>
              )}
            </div>
          );
        })()}
    </div>
  );
}

/* ── Log entry with expandable content ───────────────────────────── */

function LogEntry({
  entry,
}: {
  entry: {
    timestamp: number;
    role: Role;
    content: string;
    tokens?: number;
    cost?: number;
    toolName?: string;
  };
}) {
  const [expanded, setExpanded] = useState(false);
  const truncated = entry.content.length > 300;
  const displayContent = expanded ? entry.content : entry.content.slice(0, 300);

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-2 py-1.5 border-b border-border/40 border-l-2",
        "hover:bg-secondary/20 transition-colors",
        truncated && "cursor-pointer",
        ROLE_BORDER_COLORS[entry.role] ?? "border-l-muted",
      )}
      onClick={() => truncated && setExpanded(!expanded)}
    >
      <span className="shrink-0 text-[10px] font-mono text-muted-foreground w-[68px] tabular-nums">
        {formatTimestamp(entry.timestamp)}
      </span>
      <span
        className={cn(
          "shrink-0 text-[10px] font-mono font-semibold rounded px-1.5 py-0.5 w-[72px] text-center",
          ROLE_COLORS[entry.role] ?? "bg-muted text-muted-foreground",
        )}
      >
        {entry.role}
      </span>
      <div className="flex-1 min-w-0">
        {entry.toolName && (
          <span className="inline-block text-[9px] font-mono bg-yellow-400/10 text-yellow-400 rounded px-1.5 py-0.5 mr-1.5 mb-0.5">
            {entry.toolName}
          </span>
        )}
        <span className="text-xs text-foreground/80 break-all whitespace-pre-wrap font-mono">
          {displayContent}
          {truncated && !expanded && (
            <span className="text-muted-foreground"> ... (click to expand)</span>
          )}
        </span>
      </div>
      {entry.tokens != null && (
        <span className="shrink-0 text-[9px] font-mono text-muted-foreground tabular-nums">
          {formatTokens(entry.tokens)}
        </span>
      )}
    </div>
  );
}

/* ── Main component ──────────────────────────────────────────────── */

export function SessionDetailPanel({
  sessionKey,
  session,
  timeSeries,
  timeSeriesLoading,
  sessionLogs,
  sessionLogsLoading,
  onClose,
}: SessionDetailProps) {
  const usage = session.usage;

  // Time series toggles
  const [tsMode, setTsMode] = useState<TsMode>("cumulative");
  const [tsBreakdown, setTsBreakdown] = useState<TsBreakdown>("total");

  // Log filters
  const [roleFilters, setRoleFilters] = useState<Set<Role>>(
    () => new Set(["user", "assistant", "tool", "toolResult"]),
  );
  const [logQuery, setLogQuery] = useState("");
  const [hasToolsOnly, setHasToolsOnly] = useState(false);
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  const toggleRole = (role: Role) => {
    setRoleFilters((prev) => {
      const next = new Set(prev);
      if (next.has(role)) {
        next.delete(role);
      } else {
        next.add(role);
      }
      return next;
    });
  };

  const toggleToolFilter = (tool: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) {
        next.delete(tool);
      } else {
        next.add(tool);
      }
      return next;
    });
  };

  // Extract unique tool names from logs
  const uniqueToolNames = useMemo(() => {
    if (!sessionLogs) {
      return [];
    }
    const names = new Set<string>();
    for (const entry of sessionLogs) {
      if (entry.toolName) {
        names.add(entry.toolName);
      }
    }
    return [...names].toSorted();
  }, [sessionLogs]);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (!sessionLogs) {
      return [];
    }
    return sessionLogs.filter((entry) => {
      if (!roleFilters.has(entry.role)) {
        return false;
      }
      if (hasToolsOnly && !entry.toolName) {
        return false;
      }
      if (selectedTools.size > 0 && entry.toolName && !selectedTools.has(entry.toolName)) {
        return false;
      }
      if (logQuery) {
        const q = logQuery.toLowerCase();
        if (
          !entry.content.toLowerCase().includes(q) &&
          !entry.toolName?.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [sessionLogs, roleFilters, logQuery, hasToolsOnly, selectedTools]);

  // Top tools (6)
  const topTools = useMemo(() => {
    if (!usage?.toolUsage?.tools) {
      return [];
    }
    return [...usage.toolUsage.tools].toSorted((a, b) => b.count - a.count).slice(0, 6);
  }, [usage?.toolUsage?.tools]);

  const maxToolCount = topTools.length > 0 ? topTools[0].count : 0;

  // Model mix (6)
  const modelMix = useMemo(() => {
    if (!usage?.modelUsage) {
      return [];
    }
    return [...usage.modelUsage]
      .toSorted((a, b) => b.totals.totalTokens - a.totals.totalTokens)
      .slice(0, 6);
  }, [usage?.modelUsage]);

  // Time series summary
  const tsSummary = useMemo(() => {
    if (!timeSeries || timeSeries.points.length === 0) {
      return null;
    }
    const pts = timeSeries.points;
    const totalMsgs = pts.length;
    const totalTokens = pts.reduce((s, p) => s + p.totalTokens, 0);
    const totalCost = pts.reduce((s, p) => s + p.cost, 0);
    return { msgs: totalMsgs, tokens: totalTokens, cost: totalCost };
  }, [timeSeries]);

  // Display title: truncated to 50 chars
  const displayTitle = truncate(session.label || sessionKey, 50);

  return (
    <div className="space-y-5">
      {/* ── 1. Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-mono text-primary text-sm truncate" title={sessionKey}>
            {displayTitle}
          </h2>
          {session.label && session.label !== sessionKey && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">
              {sessionKey}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
            {usage && (
              <>
                <span>{formatTokens(usage.totalTokens)} tokens</span>
                <span>{formatCost(usage.totalCost)}</span>
              </>
            )}
            {session.agentId && <span>agent:{session.agentId}</span>}
            {session.channel && <span>ch:{session.channel}</span>}
            {session.model && <span className="truncate max-w-28">model:{session.model}</span>}
          </div>
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} title="Close">
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* ── 2. Summary grid (4 cards) ────────────────────────────── */}
      {usage && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MiniStat
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            label="Messages"
            value={String(usage.messageCounts?.total ?? 0)}
          />
          <MiniStat
            icon={<Wrench className="h-3.5 w-3.5" />}
            label="Tool Calls"
            value={String(usage.toolUsage?.totalCalls ?? usage.messageCounts?.toolCalls ?? 0)}
          />
          <MiniStat
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            label="Errors"
            value={String(usage.messageCounts?.errors ?? 0)}
          />
          <MiniStat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Duration"
            value={usage.durationMs != null ? formatDuration(usage.durationMs) : "--"}
          />
        </div>
      )}

      {/* ── Token breakdown bar ──────────────────────────────────── */}
      {usage && (
        <div>
          <h3 className="text-[11px] font-mono font-semibold text-muted-foreground mb-2">
            Token Breakdown
          </h3>
          <TokenBreakdownBar
            input={usage.input}
            output={usage.output}
            cacheRead={usage.cacheRead}
            cacheWrite={usage.cacheWrite}
          />
        </div>
      )}

      {/* ── 3. Sub-insights: Top Tools + Model Mix ───────────────── */}
      {(topTools.length > 0 || modelMix.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {topTools.length > 0 && (
            <div className="rounded-md border border-border bg-card p-3">
              <h3 className="text-[11px] font-mono font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wrench className="h-3 w-3" /> Top Tools
              </h3>
              <div className="space-y-1.5">
                {topTools.map((tool) => (
                  <div key={tool.name} className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-mono text-foreground/80 w-28 truncate shrink-0"
                      title={tool.name}
                    >
                      {tool.name}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all"
                        style={{
                          width: `${maxToolCount > 0 ? (tool.count / maxToolCount) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground w-7 text-right tabular-nums">
                      {tool.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {modelMix.length > 0 && (
            <div className="rounded-md border border-border bg-card p-3">
              <h3 className="text-[11px] font-mono font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                <Cpu className="h-3 w-3" /> Model Mix
              </h3>
              <div className="space-y-1.5">
                {modelMix.map((m) => (
                  <div
                    key={`${m.provider}-${m.model}`}
                    className="flex items-center justify-between text-[10px] font-mono"
                  >
                    <span className="text-foreground/80 truncate max-w-36">
                      {m.model ?? "unknown"}
                      {m.provider && (
                        <span className="text-muted-foreground ml-1">({m.provider})</span>
                      )}
                    </span>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>{formatTokens(m.totals.totalTokens)}</span>
                      <span>{formatCost(m.totals.totalCost)}</span>
                      <span className="text-[9px]">{m.count}x</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Time series chart ─────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[11px] font-mono font-semibold text-muted-foreground">
            Token Usage Over Time
          </h3>
          <div className="flex items-center gap-1">
            <Button
              variant={tsMode === "perTurn" ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setTsMode("perTurn")}
            >
              Per Turn
            </Button>
            <Button
              variant={tsMode === "cumulative" ? "default" : "outline"}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => setTsMode("cumulative")}
            >
              Cumulative
            </Button>
            {tsMode === "perTurn" && (
              <>
                <span className="text-muted-foreground mx-1">|</span>
                <Button
                  variant={tsBreakdown === "total" ? "default" : "outline"}
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setTsBreakdown("total")}
                >
                  Total
                </Button>
                <Button
                  variant={tsBreakdown === "byType" ? "default" : "outline"}
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setTsBreakdown("byType")}
                >
                  By Type
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Summary line */}
        {tsSummary && (
          <p className="text-[10px] font-mono text-muted-foreground mb-2">
            {tsSummary.msgs} msgs / {formatTokens(tsSummary.tokens)} tokens /{" "}
            {formatCost(tsSummary.cost)}
          </p>
        )}

        {timeSeriesLoading ? (
          <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground rounded-md border border-border bg-card">
            Loading...
          </div>
        ) : timeSeries && timeSeries.points.length >= 2 ? (
          <div className="rounded-md border border-border bg-card p-2">
            <TimeSeriesChart points={timeSeries.points} tsMode={tsMode} tsBreakdown={tsBreakdown} />
          </div>
        ) : (
          <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground rounded-md border border-border bg-card">
            No time series data
          </div>
        )}
      </div>

      {/* ── 5. System Prompt Breakdown ────────────────────────────── */}
      {usage?.contextBreakdown && <SystemPromptBreakdown breakdown={usage.contextBreakdown} />}

      {/* ── 6. Conversation Logs ─────────────────────────────────── */}
      <div>
        <h3 className="text-[11px] font-mono font-semibold text-muted-foreground mb-2">
          Session Logs
        </h3>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 mb-2">
          {/* Role checkboxes */}
          {(["user", "assistant", "tool", "toolResult"] as Role[]).map((role) => (
            <label key={role} className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={roleFilters.has(role)}
                onChange={() => toggleRole(role)}
                className="h-3 w-3 rounded border-border accent-primary"
              />
              <span
                className={cn(
                  "text-[10px] font-mono font-semibold rounded px-1 py-0.5",
                  ROLE_COLORS[role],
                )}
              >
                {role}
              </span>
            </label>
          ))}

          <span className="text-border">|</span>

          {/* Has tools toggle */}
          <label className="flex items-center gap-1 cursor-pointer select-none text-[10px] font-mono text-muted-foreground">
            <input
              type="checkbox"
              checked={hasToolsOnly}
              onChange={() => setHasToolsOnly(!hasToolsOnly)}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            Has tools
          </label>

          {/* Tool multi-select (compact pills) */}
          {uniqueToolNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {uniqueToolNames.slice(0, 8).map((tool) => (
                <button
                  key={tool}
                  onClick={() => toggleToolFilter(tool)}
                  className={cn(
                    "text-[9px] font-mono rounded px-1.5 py-0.5 border transition-colors",
                    selectedTools.has(tool)
                      ? "bg-yellow-400/20 text-yellow-400 border-yellow-400/40"
                      : "bg-transparent text-muted-foreground border-border hover:border-primary/40",
                  )}
                >
                  {tool}
                </button>
              ))}
              {uniqueToolNames.length > 8 && (
                <span className="text-[9px] text-muted-foreground font-mono">
                  +{uniqueToolNames.length - 8}
                </span>
              )}
            </div>
          )}

          {/* Query search */}
          <div className="relative ml-auto">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search logs..."
              value={logQuery}
              onChange={(e) => setLogQuery(e.target.value)}
              className="h-6 w-40 rounded-md border border-input bg-transparent pl-7 pr-2 text-[10px] font-mono outline-none focus-visible:border-ring placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Log entries */}
        {sessionLogsLoading ? (
          <div className="h-40 flex items-center justify-center text-xs text-muted-foreground rounded-md border border-border bg-card">
            Loading logs...
          </div>
        ) : filteredLogs.length > 0 ? (
          <div className="max-h-80 overflow-y-auto rounded-md border border-border bg-card">
            {filteredLogs.map((entry, i) => (
              <LogEntry key={i} entry={entry} />
            ))}
          </div>
        ) : (
          <div className="h-20 flex items-center justify-center text-xs text-muted-foreground rounded-md border border-border bg-card">
            {sessionLogs && sessionLogs.length > 0
              ? "No logs match current filters"
              : "No log entries"}
          </div>
        )}
      </div>
    </div>
  );
}
