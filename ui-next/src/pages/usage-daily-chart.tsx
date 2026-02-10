import { useState } from "react";

/* ── Types ────────────────────────────────────────────────────────── */

type DailyEntry = {
  date: string;
  tokens: number;
  cost: number;
  messages: number;
  toolCalls: number;
  errors: number;
};

type CostDailyEntry = {
  date: string;
  totalTokens: number;
  totalCost: number;
  [k: string]: unknown;
};

type DailyUsageChartProps = {
  data: DailyEntry[];
  costDaily: CostDailyEntry[];
  mode: "tokens" | "cost";
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

/* ── Component ────────────────────────────────────────────────────── */

export function DailyUsageChart({ data, costDaily, mode }: DailyUsageChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (data.length === 0) {
    return null;
  }

  // Build chart data, preferring costDaily when in cost mode
  const costMap = new Map(costDaily.map((c) => [c.date, c]));
  const chartData = data.map((d) => {
    const costEntry = costMap.get(d.date);
    return {
      date: d.date,
      tokens: costEntry?.totalTokens ?? d.tokens,
      cost: mode === "cost" && costEntry ? costEntry.totalCost : d.cost,
      messages: d.messages,
      toolCalls: d.toolCalls,
      errors: d.errors,
    };
  });

  const values = chartData.map((d) => (mode === "cost" ? d.cost : d.tokens));
  const maxVal = Math.max(...values, 1);

  // Layout constants
  const yAxisWidth = 48;
  const barGap = 2;
  const barWidth = Math.max(4, Math.min(24, Math.floor(600 / chartData.length) - barGap));
  const chartContentWidth = chartData.length * (barWidth + barGap);
  const svgWidth = Math.max(yAxisWidth + chartContentWidth + 8, 200);
  const chartHeight = 140;
  const xAxisHeight = 18;
  const svgHeight = chartHeight + xAxisHeight;

  // Y-axis tick values
  const yTicks = [0, maxVal * 0.5, maxVal];

  // Determine which x-axis labels to show: first, last, and every 7th
  function showXLabel(i: number): boolean {
    if (i === 0 || i === chartData.length - 1) {
      return true;
    }
    if (i % 7 === 0) {
      return true;
    }
    return false;
  }

  // Format date as MM-DD
  function fmtDate(dateStr: string): string {
    const parts = dateStr.split("-");
    if (parts.length >= 3) {
      return `${parts[1]}-${parts[2]}`;
    }
    return dateStr.slice(5);
  }

  return (
    <div className="relative overflow-x-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        className="text-muted-foreground"
        style={{ minHeight: `${chartHeight}px` }}
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {/* Horizontal grid lines */}
        {yTicks.map((tick) => {
          const y = chartHeight - (tick / maxVal) * chartHeight;
          return (
            <line
              key={`grid-${tick}`}
              x1={yAxisWidth}
              y1={y}
              x2={svgWidth}
              y2={y}
              stroke="currentColor"
              strokeOpacity={0.15}
              strokeDasharray="4 3"
            />
          );
        })}

        {/* Y-axis labels */}
        {yTicks.map((tick) => {
          const y = chartHeight - (tick / maxVal) * chartHeight;
          const label = mode === "cost" ? formatCost(tick) : formatTokens(tick);
          return (
            <text
              key={`ylabel-${tick}`}
              x={yAxisWidth - 4}
              y={tick === maxVal ? y + 10 : tick === 0 ? y - 2 : y + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono"
              style={{ fontSize: "9px" }}
            >
              {label}
            </text>
          );
        })}

        {/* Bars */}
        {chartData.map((d, i) => {
          const value = mode === "cost" ? d.cost : d.tokens;
          const barHeight = maxVal > 0 ? (value / maxVal) * chartHeight : 0;
          const x = yAxisWidth + i * (barWidth + barGap);
          const y = chartHeight - barHeight;
          const isHovered = hoveredIndex === i;

          return (
            <g key={d.date}>
              {/* Invisible wider hit area for hover */}
              <rect
                x={x - 1}
                y={0}
                width={barWidth + 2}
                height={chartHeight + xAxisHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIndex(i)}
              />
              {/* Visible bar */}
              <rect
                x={x}
                y={Math.max(y, 0)}
                width={barWidth}
                height={Math.max(barHeight, 0)}
                className={isHovered ? "fill-primary" : "fill-primary/60"}
                rx={1}
                style={{ transition: "fill 0.1s" }}
              />
              {/* X-axis date label */}
              {showXLabel(i) && (
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 13}
                  textAnchor="middle"
                  className="fill-muted-foreground font-mono"
                  style={{ fontSize: "8px" }}
                >
                  {fmtDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hoveredIndex !== null && hoveredIndex < chartData.length && (
        <div
          className="absolute z-10 pointer-events-none rounded-md border border-border bg-popover px-3 py-2 shadow-md"
          style={{
            left: Math.min(
              yAxisWidth + hoveredIndex * (barWidth + barGap) + barWidth / 2,
              svgWidth - 140,
            ),
            top: 4,
          }}
        >
          <p className="text-xs font-mono font-semibold text-foreground">
            {chartData[hoveredIndex].date}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            Tokens: {formatTokens(chartData[hoveredIndex].tokens)}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            Cost: {formatCost(chartData[hoveredIndex].cost)}
          </p>
          <p className="text-[11px] font-mono text-muted-foreground">
            Messages: {chartData[hoveredIndex].messages}
          </p>
        </div>
      )}
    </div>
  );
}
