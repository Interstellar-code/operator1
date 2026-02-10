import { useMemo } from "react";

/* ── Types ────────────────────────────────────────────────────────── */

type DailyEntry = {
  date: string;
  tokens: number;
  cost: number;
  messages: number;
  toolCalls: number;
  errors: number;
};

type ActivityHeatmapProps = {
  data: DailyEntry[];
  mode: "tokens" | "cost";
};

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

/* ── Constants ────────────────────────────────────────────────────── */

const CELL_SIZE = 12;
const CELL_GAP = 2;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const DAY_LABEL_WIDTH = 20;
const MONTH_LABEL_HEIGHT = 16;
const ROWS = 7;

/** Green color scale: 0 = empty, 1-4 = increasing intensity */
const COLORS = ["transparent", "#9be9a8", "#40c463", "#30a14e", "#216e39"] as const;

const DAY_LABELS: Array<{ row: number; label: string }> = [
  { row: 1, label: "M" },
  { row: 3, label: "W" },
  { row: 5, label: "F" },
];

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/* ── Helpers ──────────────────────────────────────────────────────── */

/** Parse "YYYY-MM-DD" to a Date in local time */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format Date as "YYYY-MM-DD" */
function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Quantize a value into 0-4 based on the maximum */
function quantize(value: number, max: number): number {
  if (value <= 0 || max <= 0) {
    return 0;
  }
  const ratio = value / max;
  if (ratio <= 0.25) {
    return 1;
  }
  if (ratio <= 0.5) {
    return 2;
  }
  if (ratio <= 0.75) {
    return 3;
  }
  return 4;
}

/* ── Grid computation ─────────────────────────────────────────────── */

type CellData = {
  date: string;
  col: number;
  row: number;
  value: number;
  level: number;
  entry: DailyEntry | undefined;
};

type MonthLabel = {
  label: string;
  col: number;
};

function buildGrid(data: DailyEntry[], mode: "tokens" | "cost") {
  // Build lookup by date string
  const byDate = new Map<string, DailyEntry>();
  for (const entry of data) {
    byDate.set(entry.date, entry);
  }

  // Determine date range: last 52 weeks (364 days) ending today
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 363); // 364 days total including today

  // Align start to previous Sunday (day 0)
  const startDow = start.getDay();
  if (startDow !== 0) {
    start.setDate(start.getDate() - startDow);
  }

  // Compute max value
  const values = data.map((d) => (mode === "cost" ? d.cost : d.tokens));
  const maxVal = Math.max(...values, 0);

  const cells: CellData[] = [];
  const monthLabels: MonthLabel[] = [];
  const seenMonths = new Set<string>();

  const cursor = new Date(start);
  let col = 0;

  while (cursor <= today) {
    const dow = cursor.getDay(); // 0=Sun

    if (dow === 0 && cursor > start) {
      col++;
    }

    const dateStr = fmtDate(cursor);
    const entry = byDate.get(dateStr);
    const value = entry ? (mode === "cost" ? entry.cost : entry.tokens) : 0;
    const level = quantize(value, maxVal);

    cells.push({
      date: dateStr,
      col: dow === 0 ? col : col,
      row: dow,
      value,
      level,
      entry,
    });

    // Track month labels: place at first Sunday of each month
    const monthKey = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    if (dow === 0 && !seenMonths.has(monthKey)) {
      // Only label if this is within the first 7 days of the month
      if (cursor.getDate() <= 7) {
        seenMonths.add(monthKey);
        monthLabels.push({ label: MONTH_NAMES[cursor.getMonth()], col });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  const totalCols = col + 1;
  return { cells, monthLabels, totalCols, maxVal };
}

/* ── Component ────────────────────────────────────────────────────── */

export function ActivityHeatmap({ data, mode }: ActivityHeatmapProps) {
  const { cells, monthLabels, totalCols, maxVal } = useMemo(
    () => buildGrid(data, mode),
    [data, mode],
  );

  const svgWidth = DAY_LABEL_WIDTH + totalCols * CELL_STEP;
  const svgHeight = MONTH_LABEL_HEIGHT + ROWS * CELL_STEP;

  if (data.length === 0) {
    return <div className="text-xs text-muted-foreground font-mono">No activity data</div>;
  }

  return (
    <div className="overflow-x-auto">
      <svg width={svgWidth} height={svgHeight} className="text-muted-foreground">
        {/* Month labels */}
        {monthLabels.map((m) => (
          <text
            key={`${m.label}-${m.col}`}
            x={DAY_LABEL_WIDTH + m.col * CELL_STEP}
            y={MONTH_LABEL_HEIGHT - 4}
            className="fill-muted-foreground font-mono"
            style={{ fontSize: 9 }}
          >
            {m.label}
          </text>
        ))}

        {/* Day-of-week labels */}
        {DAY_LABELS.map((d) => (
          <text
            key={d.label}
            x={0}
            y={MONTH_LABEL_HEIGHT + d.row * CELL_STEP + CELL_SIZE - 2}
            className="fill-muted-foreground font-mono"
            style={{ fontSize: 9 }}
          >
            {d.label}
          </text>
        ))}

        {/* Cells */}
        {cells.map((cell) => {
          const x = DAY_LABEL_WIDTH + cell.col * CELL_STEP;
          const y = MONTH_LABEL_HEIGHT + cell.row * CELL_STEP;
          const e = cell.entry;
          const tooltip = e
            ? `${cell.date}: ${formatTokens(e.tokens)} tokens, ${formatCost(e.cost)}, ${e.messages} msgs`
            : `${cell.date}: no activity`;

          return (
            <rect
              key={cell.date}
              x={x}
              y={y}
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              fill={COLORS[cell.level]}
              stroke={cell.level === 0 ? "currentColor" : "none"}
              strokeOpacity={cell.level === 0 ? 0.1 : 0}
              strokeWidth={1}
            >
              <title>{tooltip}</title>
            </rect>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-[10px] text-muted-foreground font-mono">Less</span>
        {COLORS.map((color, i) => (
          <svg key={i} width={CELL_SIZE} height={CELL_SIZE}>
            <rect
              width={CELL_SIZE}
              height={CELL_SIZE}
              rx={2}
              fill={color}
              stroke={i === 0 ? "currentColor" : "none"}
              strokeOpacity={i === 0 ? 0.1 : 0}
              strokeWidth={1}
              className="text-muted-foreground"
            />
          </svg>
        ))}
        <span className="text-[10px] text-muted-foreground font-mono">More</span>
        {maxVal > 0 && (
          <span className="text-[10px] text-muted-foreground font-mono ml-2">
            max: {mode === "cost" ? formatCost(maxVal) : formatTokens(maxVal)}
          </span>
        )}
      </div>
    </div>
  );
}
