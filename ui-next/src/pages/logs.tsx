import {
  ScrollText,
  RotateCcw,
  Pause,
  Play,
  ArrowDown,
  Trash2,
  Download,
  AlertTriangle,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useGateway } from "@/hooks/use-gateway";
import { cn } from "@/lib/utils";
import { useGatewayStore } from "@/store/gateway-store";

export type LogLevel = "info" | "warn" | "error" | "debug" | "trace" | "fatal";

export type LogLine = {
  text: string;
  level?: LogLevel;
  ts?: string;
  subsystem?: string;
  details?: unknown[];
  raw?: unknown;
};

const ALL_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];
const DEFAULT_ENABLED_LEVELS = new Set<LogLevel>(["info", "warn", "error", "fatal"]);

const LEVEL_SET = new Set<string>(ALL_LEVELS);

/** Map numeric log level IDs (tslog/pino style) to LogLevel */
function numericToLevel(n: unknown): LogLevel | undefined {
  if (typeof n !== "number") {
    return undefined;
  }
  // tslog: 0=silly 1=trace 2=debug 3=info 4=warn 5=error 6=fatal
  // pino:  10=trace 20=debug 30=info 40=warn 50=error 60=fatal
  if (n >= 60) {
    return "fatal";
  }
  if (n >= 50) {
    return "error";
  }
  if (n >= 40 || n === 4) {
    return "warn";
  }
  if (n >= 30 || n === 3) {
    return "info";
  }
  if (n >= 20 || n === 2) {
    return "debug";
  }
  if (n >= 1) {
    return "trace";
  }
  return undefined;
}

/** Format ISO timestamp to compact time-only: "02:01:53.352" */
function formatTs(raw: unknown): string | undefined {
  if (raw == null) {
    return undefined;
  }
  const s =
    typeof raw === "number"
      ? new Date(raw).toISOString()
      : typeof raw === "string"
        ? raw
        : JSON.stringify(raw);
  // Extract HH:MM:SS.mmm from ISO string
  const m = s.match(/(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/);
  return m ? m[1] : s;
}

/** Extract subsystem from a JSON-encoded context arg like '{"subsystem":"gateway/ws"}' */
function extractSubsystem(val: unknown): string | undefined {
  if (typeof val !== "string") {
    return undefined;
  }
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed?.subsystem === "string") {
      return parsed.subsystem;
    }
  } catch {
    /* not JSON */
  }
  return undefined;
}

/** Resolve level from all known locations in a log object */
function resolveLevel(
  obj: Record<string, unknown>,
  meta: Record<string, unknown> | undefined,
): LogLevel | undefined {
  // 1. _meta.logLevelName (tslog format: "INFO", "WARN", "ERROR", ...)
  const metaLevelName = meta?.logLevelName;
  if (typeof metaLevelName === "string") {
    const lower = metaLevelName.toLowerCase();
    if (LEVEL_SET.has(lower)) {
      return lower as LogLevel;
    }
  }
  // 2. _meta.logLevelId (tslog numeric: 3=info, 4=warn, 5=error, 6=fatal)
  const metaLevelId = meta?.logLevelId;
  const fromId = numericToLevel(metaLevelId);
  if (fromId) {
    return fromId;
  }
  // 3. Root level field (pino: numeric 30/40/50; or string "info"/"warn")
  if (typeof obj.level === "string") {
    const lower = obj.level.toLowerCase();
    if (LEVEL_SET.has(lower)) {
      return lower as LogLevel;
    }
  }
  const fromRoot = numericToLevel(obj.level);
  if (fromRoot) {
    return fromRoot;
  }
  return undefined;
}

function parseLine(raw: string): LogLine {
  // Try JSON structured logs (tslog, pino, bunyan)
  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const meta = obj._meta as Record<string, unknown> | undefined;

      // Timestamp: root "time" > root "timestamp" > _meta.date
      const ts = formatTs(obj.time ?? obj.timestamp ?? meta?.date);

      // Level
      const level = resolveLevel(obj, meta);

      // Standard msg/message field (pino, bunyan)
      if (typeof obj.msg === "string" || typeof obj.message === "string") {
        return { ts, level, text: (obj.msg ?? obj.message) as string };
      }

      // Array-style log args: numeric keys "0", "1", "2", ...
      const numericKeys = Object.keys(obj)
        .filter((k) => /^\d+$/.test(k))
        .slice()
        .toSorted((a: string, b: string) => Number(a) - Number(b));

      if (numericKeys.length > 0) {
        let subsystem: string | undefined;
        let messageText: string | undefined;
        const details: unknown[] = [];

        for (const key of numericKeys) {
          const val = obj[key];
          if (typeof val === "string") {
            const sub = extractSubsystem(val);
            if (sub && !subsystem) {
              subsystem = sub;
              continue;
            }
            messageText = val;
          } else if (typeof val === "object" && val !== null) {
            details.push(val);
          }
        }

        return {
          ts,
          level,
          subsystem,
          text: messageText ?? (details.length > 0 ? "" : raw.slice(0, 200)),
          details: details.length > 0 ? details : undefined,
          raw: obj,
        };
      }

      // Generic JSON object
      return { ts, level, text: raw.slice(0, 200), raw: obj };
    } catch {
      // not JSON, fall through
    }
  }

  // Structured: [TIMESTAMP] LEVEL message
  const match = raw.match(
    /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]?\s*(INFO|WARN|ERROR|DEBUG|TRACE|FATAL|info|warn|error|debug|trace|fatal)?\s*(.*)/,
  );
  if (match) {
    return {
      ts: match[1],
      level: (match[2]?.toLowerCase() as LogLevel) ?? undefined,
      text: match[3] || raw,
    };
  }

  // Level-only prefix: LEVEL message
  const levelMatch = raw.match(
    /^(INFO|WARN|ERROR|DEBUG|TRACE|FATAL|info|warn|error|debug|trace|fatal)\s+(.*)/,
  );
  if (levelMatch) {
    return {
      level: levelMatch[1].toLowerCase() as LogLevel,
      text: levelMatch[2],
    };
  }

  return { text: raw };
}

// --- Visual styles ---

const levelBadgeStyles: Record<string, string> = {
  trace: "text-muted-foreground bg-muted/50",
  debug: "text-muted-foreground bg-muted/60",
  info: "text-chart-2 bg-chart-2/10",
  warn: "text-chart-5 bg-chart-5/15",
  error: "text-destructive bg-destructive/10",
  fatal: "text-destructive bg-destructive/20 font-bold",
};

const levelBorderColors: Record<string, string> = {
  trace: "border-l-muted-foreground/30",
  debug: "border-l-muted-foreground/50",
  info: "border-l-chart-2/50",
  warn: "border-l-chart-5",
  error: "border-l-destructive",
  fatal: "border-l-destructive",
};

// --- Inline helpers ---

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Highlight search matches within text */
function HighlightMatches({ text, query }: { text: string; query: string }) {
  if (!query) {
    return <>{text}</>;
  }
  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-chart-5/30 text-foreground rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Render a single log row's content: subsystem tag + message + expandable details */
function LogRowContent({ line, query }: { line: LogLine; query: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = (line.details && line.details.length > 0) || line.raw;

  // Detect JSON embedded in the message text itself
  const jsonInText = !line.raw && line.text.match(/(\{[\s\S]{2,}\}|\[[\s\S]{2,}\])/);
  let inlineJson: unknown = undefined;
  let textPrefix = "";
  let textSuffix = "";
  if (jsonInText) {
    try {
      inlineJson = JSON.parse(jsonInText[0]);
      textPrefix = line.text.slice(0, jsonInText.index);
      textSuffix = line.text.slice((jsonInText.index ?? 0) + jsonInText[0].length);
    } catch {
      /* not valid JSON */
    }
  }

  return (
    <div className="flex-1 min-w-0">
      {/* Inline flow: subsystem + message + expand button all wrap naturally together */}
      <span className="break-all whitespace-pre-wrap">
        {line.subsystem && (
          <>
            <span className="text-[10px] font-mono text-primary/60 bg-primary/5 rounded px-1 py-0 inline-block align-baseline">
              {line.subsystem}
            </span>{" "}
          </>
        )}
        {line.text &&
          (inlineJson ? (
            <span className="text-foreground">
              <HighlightMatches text={textPrefix} query={query} />
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-primary/70 hover:text-primary text-[10px] font-semibold px-1 py-0 rounded bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                {expanded ? "collapse" : `{${Object.keys(inlineJson as object).length}}`}
              </button>
              <HighlightMatches text={textSuffix} query={query} />
            </span>
          ) : (
            <span className="text-foreground">
              <HighlightMatches text={line.text} query={query} />
            </span>
          ))}
        {hasDetails && (inlineJson === undefined || inlineJson === null) ? (
          <>
            {"  "}
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn(
                "text-[10px] font-mono px-1 py-0 rounded transition-colors inline-block align-baseline",
                expanded
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-primary bg-muted/30 hover:bg-primary/10",
              )}
            >
              {expanded
                ? "collapse"
                : line.details
                  ? `+${line.details.length} detail${line.details.length > 1 ? "s" : ""}`
                  : "raw"}
            </button>
          </>
        ) : null}
      </span>
      {/* Expanded details below */}
      {expanded && (
        <div className="mt-1 ml-1">
          {line.details?.map((detail, di) => (
            <pre
              key={di}
              className="mb-1 p-2 rounded bg-muted/30 text-[11px] leading-4 overflow-x-auto border border-border/40 max-h-48"
            >
              {JSON.stringify(detail, null, 2)}
            </pre>
          ))}
          {Boolean(line.raw) && !line.details && (
            <pre className="p-2 rounded bg-muted/30 text-[11px] leading-4 overflow-x-auto border border-border/40 max-h-48">
              {JSON.stringify(line.raw, null, 2)}
            </pre>
          )}
          {Boolean(inlineJson) && (
            <pre className="p-2 rounded bg-muted/30 text-[11px] leading-4 overflow-x-auto border border-border/40 max-h-48">
              {JSON.stringify(inlineJson, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main page ---

export function LogsPage() {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const [logFilePath, setLogFilePath] = useState<string | null>(null);
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(
    () => new Set(DEFAULT_ENABLED_LEVELS),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleLevel = useCallback((level: LogLevel) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const result = await sendRpc<{
        lines?: string[];
        cursor?: number;
        truncated?: boolean;
        reset?: boolean;
        file?: string;
      }>("logs.tail", {
        cursor: cursorRef.current,
        limit: 500,
      });

      setLastError(null);

      if (result?.file) {
        setLogFilePath(result.file);
      }

      if (result?.reset) {
        setLines([]);
        cursorRef.current = 0;
      }

      if (result?.lines && result.lines.length > 0) {
        const parsed = result.lines.map(parseLine);
        setLines((prev) => [...prev, ...parsed].slice(-2000));
      }
      if (result?.cursor != null) {
        cursorRef.current = result.cursor;
      }
    } catch (e) {
      setLastError((e as Error).message);
    }
  }, [sendRpc]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    cursorRef.current = 0;
    setLines([]);
    await fetchLogs();
    setLoading(false);
  }, [fetchLogs]);

  useEffect(() => {
    if (isConnected) {
      void initialLoad();
    }
  }, [isConnected, initialLoad]);

  // Poll for new logs
  useEffect(() => {
    if (!isConnected || paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }
    intervalRef.current = setInterval(fetchLogs, 2000);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isConnected, paused, fetchLogs]);

  // Auto-scroll to top (newest entries are at the top)
  useEffect(() => {
    if (autoScroll && !paused && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [lines.length, autoScroll, paused]);

  const scrollToLatest = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, []);

  const filtered = useMemo(() => {
    const lowerFilter = filter.toLowerCase();
    const result = lines.filter((l) => {
      // Level filter: lines without a level are always shown
      if (l.level && !enabledLevels.has(l.level)) {
        return false;
      }
      // Text filter (search message and subsystem)
      if (filter) {
        const matchesText = l.text.toLowerCase().includes(lowerFilter);
        const matchesSub = l.subsystem?.toLowerCase().includes(lowerFilter) ?? false;
        if (!matchesText && !matchesSub) {
          return false;
        }
      }
      return true;
    });
    // Reverse so newest entries appear at the top
    return result.slice().toReversed();
  }, [lines, enabledLevels, filter]);

  const isFiltering = filter.length > 0 || enabledLevels.size < ALL_LEVELS.length;

  const exportFiltered = useCallback(() => {
    const content = filtered
      .map((l) => [l.ts, l.level?.toUpperCase(), l.text].filter(Boolean).join(" "))
      .join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `openclaw-logs-${date}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <ScrollText className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-mono font-semibold">Logs</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportFiltered}
            disabled={filtered.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={initialLoad} disabled={loading}>
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Reload
          </Button>
        </div>
      </div>
      {logFilePath && (
        <p className="text-[11px] font-mono text-muted-foreground mb-2 truncate">
          File: {logFilePath}
        </p>
      )}
      {lastError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 text-destructive px-4 py-2 text-xs font-mono mb-2 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {lastError}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 shrink-0">
          <input
            type="text"
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7 flex-1 max-w-xs rounded border border-border bg-background px-2 text-xs font-mono placeholder:text-muted-foreground outline-none focus:border-primary/50"
          />

          {/* Level filter pills */}
          <div className="flex items-center gap-1">
            {ALL_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border transition-colors",
                  enabledLevels.has(level)
                    ? cn("border-current", levelBadgeStyles[level])
                    : "border-border text-muted-foreground/40 bg-transparent",
                )}
              >
                {level}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setPaused(!paused)}
              title={paused ? "Resume" : "Pause"}
            >
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon-xs" onClick={scrollToLatest} title="Jump to latest">
              <ArrowDown className="h-3 w-3 rotate-180" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setLines([]);
                cursorRef.current = 0;
              }}
              title="Clear"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>

          {/* Auto-follow toggle */}
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3 rounded border-border accent-primary"
            />
            <span className="text-[10px] font-mono text-muted-foreground">Auto-follow</span>
          </label>

          {paused && (
            <span className="text-[10px] font-mono text-chart-5 px-1.5 py-0.5 rounded bg-chart-5/10">
              paused
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground ml-auto tabular-nums">
            {isFiltering ? `${filtered.length} of ${lines.length} lines` : `${lines.length} lines`}
          </span>
        </div>

        {/* Log content */}
        {!isConnected ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Connect to the gateway to view logs</p>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto p-1 font-mono text-xs leading-5"
            onScroll={() => {
              const el = containerRef.current;
              if (!el) {
                return;
              }
              // Newest entries are at top, so auto-follow when scrolled to top
              const atTop = el.scrollTop < 30;
              setAutoScroll(atTop);
            }}
          >
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                {filter ? "No matching lines" : loading ? "Loading..." : "No log entries"}
              </div>
            ) : (
              filtered.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 px-2 py-0.5 border-l-2 rounded-r-sm",
                    line.level ? levelBorderColors[line.level] : "border-l-transparent",
                    i % 2 === 1 && "bg-muted/15",
                    "hover:bg-secondary/30 transition-colors",
                  )}
                >
                  {/* Line number */}
                  <span className="shrink-0 w-8 text-right text-muted-foreground/30 select-none tabular-nums">
                    {i + 1}
                  </span>
                  {/* Timestamp */}
                  {line.ts && (
                    <span className="shrink-0 w-[90px] text-muted-foreground/50 tabular-nums select-all">
                      {line.ts}
                    </span>
                  )}
                  {/* Level badge */}
                  {line.level && (
                    <span
                      className={cn(
                        "shrink-0 inline-flex items-center justify-center rounded w-14 text-center text-[10px] font-mono font-semibold uppercase tracking-wider",
                        levelBadgeStyles[line.level] ?? "text-foreground",
                      )}
                    >
                      {line.level}
                    </span>
                  )}
                  {/* Content: subsystem + message + details */}
                  <LogRowContent line={line} query={filter} />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
