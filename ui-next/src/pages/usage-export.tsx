import { Calendar, Cpu, Radio, Clock, Wrench, BarChart3 } from "lucide-react";

/* ── Helpers ──────────────────────────────────────────────────────── */

export function formatCost(cost: number): string {
  if (cost === 0) {
    return "$0.00";
  }
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

/* ── CSV Export ────────────────────────────────────────────────────── */

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

type ExportSession = {
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
      errors: number;
    };
    [k: string]: unknown;
  } | null;
  [k: string]: unknown;
};

export function exportUsageCsv(params: {
  sessions: ExportSession[];
  startDate: string;
  endDate: string;
}): void {
  const { sessions, startDate, endDate } = params;

  const headers = [
    "Session Key",
    "Label",
    "Agent",
    "Channel",
    "Model",
    "Messages",
    "Tool Calls",
    "Errors",
    "Input Tokens",
    "Output Tokens",
    "Cache Read",
    "Cache Write",
    "Total Tokens",
    "Cost",
    "Duration (ms)",
    "First Activity",
    "Last Activity",
  ];

  const rows = sessions.map((s) => {
    const u = s.usage;
    const mc = u?.messageCounts;
    return [
      escapeCsv(s.key),
      escapeCsv(s.label ?? ""),
      escapeCsv(s.agentId ?? ""),
      escapeCsv(s.channel ?? ""),
      escapeCsv(s.model ?? ""),
      String(mc?.total ?? ""),
      String(mc?.toolCalls ?? ""),
      String(mc?.errors ?? ""),
      String(u?.input ?? ""),
      String(u?.output ?? ""),
      String(u?.cacheRead ?? ""),
      String(u?.cacheWrite ?? ""),
      String(u?.totalTokens ?? ""),
      u ? u.totalCost.toFixed(6) : "",
      String(u?.durationMs ?? ""),
      u?.firstActivity ? new Date(u.firstActivity).toISOString() : "",
      u?.lastActivity ? new Date(u.lastActivity).toISOString() : "",
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `usage-${startDate}-to-${endDate}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Insights Cards ───────────────────────────────────────────────── */

type InsightsCardsProps = {
  aggregates: {
    messages: { total: number; user: number; assistant: number; toolCalls: number; errors: number };
    tools: {
      totalCalls: number;
      uniqueTools: number;
      tools: Array<{ name: string; count: number }>;
    };
    byModel: Array<{
      provider?: string;
      model?: string;
      count: number;
      totals: { totalTokens: number; totalCost: number; [k: string]: unknown };
    }>;
    byAgent: Array<{
      agentId: string;
      totals: { totalTokens: number; totalCost: number; [k: string]: unknown };
    }>;
    byChannel: Array<{
      channel: string;
      totals: { totalTokens: number; totalCost: number; [k: string]: unknown };
    }>;
    latency?: { count: number; avgMs: number; p95Ms: number; minMs: number; maxMs: number };
    daily: Array<{
      date: string;
      tokens: number;
      cost: number;
      messages: number;
      toolCalls: number;
      errors: number;
    }>;
  };
  mode: "tokens" | "cost";
};

export function InsightsCards({ aggregates, mode }: InsightsCardsProps) {
  const { daily, byModel, byChannel, latency, tools } = aggregates;

  // Peak day
  const peakDay =
    daily.length > 0
      ? daily.reduce((best, d) => {
          const val = mode === "cost" ? d.cost : d.tokens;
          const bestVal = mode === "cost" ? best.cost : best.tokens;
          return val > bestVal ? d : best;
        })
      : null;

  // Top model
  const topModel =
    byModel.length > 0
      ? byModel.reduce((best, m) => {
          const val = mode === "cost" ? m.totals.totalCost : m.totals.totalTokens;
          const bestVal = mode === "cost" ? best.totals.totalCost : best.totals.totalTokens;
          return val > bestVal ? m : best;
        })
      : null;

  // Busiest channel
  const topChannel =
    byChannel.length > 0
      ? byChannel.reduce((best, c) => {
          const val = mode === "cost" ? c.totals.totalCost : c.totals.totalTokens;
          const bestVal = mode === "cost" ? best.totals.totalCost : best.totals.totalTokens;
          return val > bestVal ? c : best;
        })
      : null;

  // Top tool
  const topTool =
    tools.tools.length > 0
      ? tools.tools.reduce((best, t) => (t.count > best.count ? t : best))
      : null;

  // Active days
  const activeDays = daily.filter((d) => (mode === "cost" ? d.cost > 0 : d.tokens > 0)).length;

  const cards: Array<{
    icon: typeof Calendar;
    label: string;
    value: string;
    subtitle?: string;
  }> = [
    {
      icon: Calendar,
      label: "Peak Day",
      value: peakDay ? peakDay.date.slice(5) : "N/A",
      subtitle: peakDay
        ? mode === "cost"
          ? formatCost(peakDay.cost)
          : formatTokens(peakDay.tokens)
        : undefined,
    },
    {
      icon: Cpu,
      label: "Top Model",
      value: topModel?.model ?? "N/A",
      subtitle: topModel
        ? mode === "cost"
          ? formatCost(topModel.totals.totalCost)
          : formatTokens(topModel.totals.totalTokens)
        : undefined,
    },
    {
      icon: Radio,
      label: "Busiest Channel",
      value: topChannel?.channel ?? "N/A",
      subtitle: topChannel
        ? mode === "cost"
          ? formatCost(topChannel.totals.totalCost)
          : formatTokens(topChannel.totals.totalTokens)
        : undefined,
    },
    {
      icon: Clock,
      label: "Avg Latency",
      value: latency ? `${Math.round(latency.avgMs)}ms` : "N/A",
      subtitle: latency ? `p95 ${Math.round(latency.p95Ms)}ms` : undefined,
    },
    {
      icon: Wrench,
      label: "Top Tool",
      value: topTool?.name ?? "N/A",
      subtitle: topTool ? `${topTool.count} calls` : undefined,
    },
    {
      icon: BarChart3,
      label: "Active Days",
      value: String(activeDays),
      subtitle: `of ${daily.length} days`,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <card.icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] font-mono uppercase text-muted-foreground">
              {card.label}
            </span>
          </div>
          <div className="text-sm font-mono font-bold text-primary truncate">{card.value}</div>
          {card.subtitle && (
            <div className="text-[10px] font-mono text-muted-foreground">{card.subtitle}</div>
          )}
        </div>
      ))}
    </div>
  );
}
