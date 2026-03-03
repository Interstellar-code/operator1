import { format } from "date-fns";
import { X, RefreshCw } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import type { LogLevel, LogLine as BaseLogLine } from "@/pages/logs";
import { useGatewayStore } from "@/store/gateway-store";

export interface LogTerminalPanelProps {
  terminalId: string;
  onClose: () => void;
}

// Add an ID for rendering keys
export interface PanelLogLine extends BaseLogLine {
  id: number | string;
  tsMs: number;
}

// Maps terminal uids to the category we want to filter by
const TERMINAL_CATEGORY_MAP: Record<string, string> = {
  "c-log-ws": "gateway", // or ws, socket depending on log metadata
  "c-log-auth": "auth",
  "c-log-agent": "agent",
  "c-log-chan": "channel",
  "c-log-sess": "session",
  "c-log-event": "event",
  "c-log-rpc": "rpc",
};

const TERMINAL_COLOR_MAP: Record<string, string> = {
  "c-log-ws": "text-green-500",
  "c-log-auth": "text-amber-500",
  "c-log-agent": "text-cyan-500",
  "c-log-chan": "text-red-500",
  "c-log-sess": "text-blue-500",
  "c-log-event": "text-yellow-500",
  "c-log-rpc": "text-green-500",
};

export function LogTerminalPanel({ terminalId, onClose }: LogTerminalPanelProps) {
  const category = TERMINAL_CATEGORY_MAP[terminalId] || "general";
  const headerColor = TERMINAL_COLOR_MAP[terminalId] || "text-green-500";
  const eventLog = useGatewayStore((s) => s.eventLog);

  const [filteredLogs, setFilteredLogs] = useState<PanelLogLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initial filter + Auto scroll
  useEffect(() => {
    // Basic filter logic depending on what the log text contains
    // In Phase 4 we will connect to actual real-time filtered feeds
    const mappedLogs: PanelLogLine[] = eventLog.map((l) => ({
      id: l.ts,
      tsMs: l.ts,
      text: l.event,
      level: "info" as LogLevel,
    }));

    const fLogs = mappedLogs.filter((l) => {
      const txt = l.text.toLowerCase();
      switch (terminalId) {
        case "c-log-ws":
          return (
            txt.includes("socket") ||
            txt.includes("connect") ||
            txt.includes("disconnect") ||
            txt.includes("ping")
          );
        case "c-log-auth":
          return (
            txt.includes("auth") ||
            txt.includes("token") ||
            txt.includes("device") ||
            txt.includes("unauthorized")
          );
        case "c-log-agent":
          return txt.includes("agent") || txt.includes("tool") || txt.includes("run");
        case "c-log-chan":
          return txt.includes("channel") || txt.includes("join") || txt.includes("leave");
        case "c-log-sess":
          return txt.includes("session");
        case "c-log-event":
          return txt.includes("presence") || txt.includes("health") || txt.includes("sync");
        case "c-log-rpc":
          return txt.includes("rpc") || txt.includes("request") || txt.includes("response");
        default:
          return true;
      }
    });
    // Reverse so chronological is top-to-bottom
    setFilteredLogs(fLogs.toReversed());
  }, [eventLog, terminalId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredLogs]);

  return (
    <div className="absolute top-0 right-0 h-full w-96 bg-black/95 border-l border-white/10 shadow-2xl z-50 flex flex-col font-mono text-sm transform transition-transform duration-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
        <div>
          <h2 className={`text-lg font-bold tracking-widest ${headerColor}`}>
            {category.toUpperCase()} _LOGS
          </h2>
          <div className="text-xs text-zinc-500 flex items-center gap-2 mt-1">
            <RefreshCw className="w-3 h-3 animate-spin" /> LIVE FEED
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-md transition-colors text-zinc-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Log Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="text-zinc-600 text-center mt-10">
            [ AWAITING {category.toUpperCase()} ACTIVITY ]
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="text-xs">
              <div className="flex items-start gap-2 mb-1 opacity-60">
                <span className="text-[10px] shrink-0">{format(log.tsMs, "HH:mm:ss.SSS")}</span>
                {log.level && (
                  <span
                    className={`px-1 py-0.5 rounded-[2px] text-[9px] font-bold ${
                      log.level === "error"
                        ? "bg-red-500/20 text-red-500"
                        : log.level === "warn"
                          ? "bg-amber-500/20 text-amber-500"
                          : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {log.level.toUpperCase()}
                  </span>
                )}
              </div>
              <div className="text-zinc-300 break-words leading-relaxed drop-shadow-sm">
                {log.text}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-white/10 bg-zinc-950 text-[10px] text-zinc-600 flex justify-between">
        <span>GATEWAY STREAM: ACTIVE</span>
        <span>{filteredLogs.length} EVENTS</span>
      </div>
    </div>
  );
}
