"use client";

import { X, RefreshCw, Search, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useGateway } from "@/hooks/use-gateway";
import type { LogLevel, LogLine } from "@/pages/logs";
import { useGatewayStore } from "@/store/gateway-store";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LogTerminalPanelProps {
  terminalId: string;
  /** Optional meta override — when provided, uses these keywords/label instead of TERMINAL_META lookup. */
  meta?: TerminalMeta;
  onClose: () => void;
}

// ── Terminal metadata ─────────────────────────────────────────────────────────

export interface TerminalMeta {
  label: string;
  accentClass: string;
  keywords: string[];
}

const TERMINAL_META: Record<string, TerminalMeta> = {
  "c-log-ws": {
    label: "WEBSOCKET",
    accentClass: "text-green-400 border-green-500/40",
    keywords: ["ws", "socket", "connect", "disconnect", "ping", "websocket", "gateway/ws"],
  },
  "c-log-auth": {
    label: "AUTH",
    accentClass: "text-amber-400 border-amber-500/40",
    keywords: ["auth", "token", "device", "unauthorized", "jwt", "session/auth"],
  },
  "c-log-agent": {
    label: "AGENT",
    accentClass: "text-cyan-400 border-cyan-500/40",
    keywords: ["agent", "tool", "run", "task", "worker"],
  },
  "c-log-chan": {
    label: "CHANNEL",
    accentClass: "text-red-400 border-red-500/40",
    keywords: ["channel", "chan", "join", "leave", "subscribe"],
  },
  "c-log-sess": {
    label: "SESSION",
    accentClass: "text-blue-400 border-blue-500/40",
    keywords: ["session", "sess"],
  },
  "c-log-event": {
    label: "EVENTS",
    accentClass: "text-yellow-400 border-yellow-500/40",
    keywords: ["presence", "health", "sync", "heartbeat", "event"],
  },
  "c-log-rpc": {
    label: "RPC",
    accentClass: "text-emerald-400 border-emerald-500/40",
    keywords: ["rpc", "request", "response", "method", "invoke"],
  },
};

// ── Log level config ──────────────────────────────────────────────────────────

type LevelConfig = {
  label: string;
  pill: string; // active pill classes
  pillOff: string; // inactive pill classes
  badge: string; // row badge classes
  border: string; // left border class
};

const ALL_LEVELS: LogLevel[] = ["fatal", "error", "warn", "info", "debug", "trace"];
const DEFAULT_ENABLED = new Set<LogLevel>(["fatal", "error", "warn", "info"]);

const LEVEL_CONFIG: Record<string, LevelConfig> = {
  fatal: {
    label: "FATAL",
    pill: "border-red-400 text-red-300 bg-red-500/20",
    pillOff: "border-zinc-700 text-zinc-600 bg-transparent",
    badge: "bg-red-600/30 text-red-300 font-bold",
    border: "border-l-red-400",
  },
  error: {
    label: "ERROR",
    pill: "border-red-500 text-red-400 bg-red-500/15",
    pillOff: "border-zinc-700 text-zinc-600 bg-transparent",
    badge: "bg-red-500/20 text-red-400",
    border: "border-l-red-500",
  },
  warn: {
    label: "WARN",
    pill: "border-amber-500 text-amber-400 bg-amber-500/15",
    pillOff: "border-zinc-700 text-zinc-600 bg-transparent",
    badge: "bg-amber-500/15 text-amber-400",
    border: "border-l-amber-500",
  },
  info: {
    label: "INFO",
    pill: "border-blue-500 text-blue-400 bg-blue-500/15",
    pillOff: "border-zinc-700 text-zinc-600 bg-transparent",
    badge: "bg-blue-500/15 text-blue-400",
    border: "border-l-blue-500/50",
  },
  debug: {
    label: "DBG",
    pill: "border-zinc-500 text-zinc-300 bg-zinc-700/40",
    pillOff: "border-zinc-700 text-zinc-600 bg-transparent",
    badge: "bg-zinc-800 text-zinc-400",
    border: "border-l-zinc-600",
  },
  trace: {
    label: "TRC",
    pill: "border-zinc-600 text-zinc-400 bg-zinc-800/40",
    pillOff: "border-zinc-700 text-zinc-600 bg-transparent",
    badge: "bg-zinc-800 text-zinc-500",
    border: "border-l-zinc-700",
  },
};

// ── Log parsing ───────────────────────────────────────────────────────────────

const LEVEL_SET = new Set<string>(ALL_LEVELS);

function numericToLevel(n: unknown): LogLevel | undefined {
  if (typeof n !== "number") {
    return undefined;
  }
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
  const m = s.match(/(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/);
  return m ? m[1] : s;
}

function extractSubsystem(val: unknown): string | undefined {
  if (typeof val !== "string") {
    return undefined;
  }
  try {
    const p = JSON.parse(val);
    if (typeof p?.subsystem === "string") {
      return p.subsystem;
    }
  } catch {
    /* not JSON */
  }
  return undefined;
}

function parseLine(raw: string): LogLine {
  if (raw.startsWith("{")) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const meta = obj._meta as Record<string, unknown> | undefined;
      const ts = formatTs(obj.time ?? obj.timestamp ?? meta?.date);

      let level: LogLevel | undefined;
      const metaName = meta?.logLevelName;
      if (typeof metaName === "string") {
        const l = metaName.toLowerCase();
        if (LEVEL_SET.has(l)) {
          level = l as LogLevel;
        }
      }
      if (!level) {
        level = numericToLevel(meta?.logLevelId);
      }
      if (!level && typeof obj.level === "string") {
        const l = obj.level.toLowerCase();
        if (LEVEL_SET.has(l)) {
          level = l as LogLevel;
        }
      }
      if (!level) {
        level = numericToLevel(obj.level);
      }

      if (typeof obj.msg === "string" || typeof obj.message === "string") {
        return { ts, level, text: (obj.msg ?? obj.message) as string };
      }

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
          text: messageText ?? "",
          details: details.length > 0 ? details : undefined,
          raw: obj,
        };
      }

      return { ts, level, text: raw.slice(0, 300), raw: obj };
    } catch {
      /* not JSON */
    }
  }

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

  const levelMatch = raw.match(
    /^(INFO|WARN|ERROR|DEBUG|TRACE|FATAL|info|warn|error|debug|trace|fatal)\s+(.*)/,
  );
  if (levelMatch) {
    return { level: levelMatch[1].toLowerCase() as LogLevel, text: levelMatch[2] };
  }

  return { text: raw };
}

// ── Component ─────────────────────────────────────────────────────────────────

const POLL_MS = 2000;

export function LogTerminalPanel({
  terminalId,
  meta: metaOverride,
  onClose,
}: LogTerminalPanelProps) {
  const { sendRpc } = useGateway();
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");

  const meta = metaOverride ??
    TERMINAL_META[terminalId] ?? {
      label: terminalId.replace("c-log-", "").toUpperCase(),
      accentClass: "text-green-400 border-green-500/40",
      keywords: [terminalId.replace("c-log-", "")],
    };

  const [allLines, setAllLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(() => new Set(DEFAULT_ENABLED));

  const cursorRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Toggle a single level pill
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

  // Toggle "all" — if all on, turn off extras (keep errors); if any off, enable all
  const toggleAll = useCallback(() => {
    setEnabledLevels((prev) => {
      if (prev.size === ALL_LEVELS.length) {
        return new Set(DEFAULT_ENABLED);
      }
      return new Set(ALL_LEVELS);
    });
  }, []);

  // Filter incoming lines to this terminal's category
  const filterToCategory = useCallback(
    (lines: LogLine[]): LogLine[] => {
      const kws = meta.keywords;
      return lines.filter((l) => {
        const textLower = l.text.toLowerCase();
        const subLower = l.subsystem?.toLowerCase() ?? "";
        return kws.some((kw) => textLower.includes(kw) || subLower.includes(kw));
      });
    },
    [meta.keywords],
  );

  const fetchLogs = useCallback(async () => {
    try {
      const result = await sendRpc<{
        lines?: string[];
        cursor?: number;
        reset?: boolean;
      }>("logs.tail", { cursor: cursorRef.current, limit: 200 });

      if (result?.reset) {
        setAllLines([]);
        cursorRef.current = 0;
      }

      if (result?.lines && result.lines.length > 0) {
        const parsed = result.lines.map(parseLine);
        const relevant = filterToCategory(parsed);
        if (relevant.length > 0) {
          setAllLines((prev) => [...prev, ...relevant].slice(-1000));
        }
        if (result.cursor != null) {
          cursorRef.current = result.cursor;
        }
      }
    } catch {
      // Silent fail — gateway may not be ready yet
    }
  }, [sendRpc, filterToCategory]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    cursorRef.current = 0;
    setAllLines([]);
    await fetchLogs();
    setLoading(false);
  }, [fetchLogs]);

  useEffect(() => {
    if (isConnected) {
      void initialLoad();
    }
  }, [isConnected, initialLoad]);

  useEffect(() => {
    if (!isConnected || paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      return;
    }
    intervalRef.current = setInterval(fetchLogs, POLL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isConnected, paused, fetchLogs]);

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [allLines, paused]);

  // Apply search + level filters for display
  const displayed = useMemo(() => {
    return allLines.filter((l) => {
      // Level filter (lines without a level are always shown)
      if (l.level && !enabledLevels.has(l.level)) {
        return false;
      }
      // Text search
      if (filter) {
        const q = filter.toLowerCase();
        const inText = l.text.toLowerCase().includes(q);
        const inSub = l.subsystem?.toLowerCase().includes(q) ?? false;
        if (!inText && !inSub) {
          return false;
        }
      }
      return true;
    });
  }, [allLines, filter, enabledLevels]);

  const isFiltering = filter.length > 0 || enabledLevels.size < ALL_LEVELS.length;
  const allOn = enabledLevels.size === ALL_LEVELS.length;

  // Count per-level for the pills
  const levelCounts = useMemo(() => {
    const counts: Partial<Record<LogLevel, number>> = {};
    for (const l of allLines) {
      if (l.level) {
        counts[l.level] = (counts[l.level] ?? 0) + 1;
      }
    }
    return counts;
  }, [allLines]);

  return (
    <div className="absolute top-0 right-0 h-full w-[400px] bg-[#080a0b]/98 border-l border-white/10 shadow-[−8px_0_32px_rgba(0,0,0,0.8)] z-50 flex flex-col font-mono text-xs">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className={`flex items-center justify-between px-3 py-2.5 border-b border-white/10 shrink-0 border-t-2 ${meta.accentClass.split(" ")[1]}`}
      >
        <div>
          <h2 className={`text-sm font-bold tracking-widest ${meta.accentClass.split(" ")[0]}`}>
            {meta.label} _LOGS
          </h2>
          <div className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
            {paused ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                PAUSED
              </>
            ) : (
              <>
                <RefreshCw className="w-2 h-2 animate-spin text-zinc-600" />
                LIVE FEED
              </>
            )}
            {loading && <span className="text-zinc-700 ml-1">LOADING…</span>}
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => void initialLoad()}
            title="Reload"
            className="p-1.5 hover:bg-white/8 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Resume live feed" : "Pause live feed"}
            className="p-1.5 hover:bg-white/8 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => {
              setAllLines([]);
              cursorRef.current = 0;
            }}
            title="Clear log"
            className="p-1.5 hover:bg-white/8 rounded text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Close (Esc)"
            className="p-1.5 hover:bg-white/10 rounded text-zinc-500 hover:text-white transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <div className="px-3 pt-2 pb-2 border-b border-white/8 shrink-0 space-y-2">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white/4 rounded border border-white/8 px-2 py-1.5">
          <Search className="w-3 h-3 text-zinc-600 shrink-0" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search messages, subsystems…"
            className="flex-1 bg-transparent text-[11px] text-zinc-300 placeholder:text-zinc-700 outline-none min-w-0"
          />
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="text-zinc-600 hover:text-zinc-400 transition-colors text-[10px] shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {/* Level filter pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {/* "ALL" shortcut pill */}
          <button
            onClick={toggleAll}
            className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border transition-colors shrink-0 ${
              allOn
                ? "border-zinc-400 text-zinc-300 bg-zinc-700/50"
                : "border-zinc-700 text-zinc-600 bg-transparent hover:border-zinc-500"
            }`}
            title={allOn ? "Showing all levels — click to reset" : "Show all levels"}
          >
            ALL
          </button>

          <span className="text-zinc-800 text-[10px]">|</span>

          {ALL_LEVELS.map((level) => {
            const cfg = LEVEL_CONFIG[level];
            const active = enabledLevels.has(level);
            const count = levelCounts[level];
            return (
              <button
                key={level}
                onClick={() => toggleLevel(level)}
                title={`Toggle ${level} logs${count ? ` (${count} events)` : ""}`}
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border transition-all shrink-0 flex items-center gap-1 ${
                  active ? cfg.pill : cfg.pillOff
                }`}
              >
                {cfg.label}
                {count != null && count > 0 && (
                  <span
                    className={`text-[8px] tabular-nums ${active ? "opacity-70" : "opacity-30"}`}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Log feed ───────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {!isConnected ? (
          <div className="text-zinc-700 text-center mt-12 text-[10px] tracking-widest">
            [ GATEWAY DISCONNECTED ]
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-zinc-700 text-center mt-12 text-[10px] tracking-widest px-4">
            {loading
              ? "[ INITIALIZING FEED… ]"
              : isFiltering
                ? "[ NO MATCHING EVENTS ]"
                : `[ AWAITING ${meta.label} ACTIVITY ]`}
          </div>
        ) : (
          <div className="p-1.5 space-y-px">
            {displayed.map((log, i) => {
              const cfg = log.level ? LEVEL_CONFIG[log.level] : null;
              return (
                <div
                  key={i}
                  className={`flex items-start gap-1.5 px-2 py-1 border-l-2 rounded-r-[2px] ${
                    cfg ? cfg.border : "border-l-transparent"
                  } ${i % 2 === 1 ? "bg-white/[0.018]" : ""} hover:bg-white/[0.035] transition-colors`}
                >
                  {/* Timestamp */}
                  {log.ts && (
                    <span className="shrink-0 text-[9px] text-zinc-700 tabular-nums w-[72px] pt-px">
                      {log.ts}
                    </span>
                  )}

                  {/* Level badge */}
                  {cfg && (
                    <span
                      className={`shrink-0 text-[8px] font-bold px-1 py-px rounded-[2px] uppercase w-9 text-center leading-none pt-[3px] ${cfg.badge}`}
                    >
                      {log.level === "fatal"
                        ? "FTL"
                        : log.level === "error"
                          ? "ERR"
                          : log.level === "warn"
                            ? "WRN"
                            : log.level === "info"
                              ? "INF"
                              : log.level === "debug"
                                ? "DBG"
                                : "TRC"}
                    </span>
                  )}

                  {/* Subsystem tag */}
                  {log.subsystem && (
                    <span className="shrink-0 text-[8px] text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1 py-px max-w-[70px] truncate leading-none pt-[3px]">
                      {log.subsystem}
                    </span>
                  )}

                  {/* Message — wraps and doesn't overflow */}
                  <span className="text-zinc-300 break-words leading-relaxed min-w-0 text-[10px]">
                    {log.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="px-3 py-1.5 border-t border-white/8 bg-[#050607] text-[9px] text-zinc-700 flex justify-between items-center shrink-0">
        <span>
          GATEWAY:{" "}
          <span className={isConnected ? "text-green-600" : "text-red-600"}>
            {isConnected ? "ACTIVE" : "OFFLINE"}
          </span>
          {isFiltering && <span className="ml-2 text-amber-700">FILTERED</span>}
        </span>
        <span className="tabular-nums">
          {isFiltering ? `${displayed.length} / ${allLines.length}` : `${allLines.length}`} EVT
        </span>
      </div>
    </div>
  );
}
