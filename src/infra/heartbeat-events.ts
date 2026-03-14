import { getOp1Setting, setOp1Setting } from "./state-db/settings-sqlite.js";

export type HeartbeatIndicatorType = "ok" | "alert" | "error";

export type HeartbeatEventPayload = {
  ts: number;
  status: "sent" | "ok-empty" | "ok-token" | "skipped" | "failed";
  to?: string;
  accountId?: string;
  preview?: string;
  durationMs?: number;
  hasMedia?: boolean;
  reason?: string;
  /** The channel this heartbeat was sent to. */
  channel?: string;
  /** Whether the message was silently suppressed (showOk: false). */
  silent?: boolean;
  /** Indicator type for UI status display. */
  indicatorType?: HeartbeatIndicatorType;
};

export function resolveIndicatorType(
  status: HeartbeatEventPayload["status"],
): HeartbeatIndicatorType | undefined {
  switch (status) {
    case "ok-empty":
    case "ok-token":
      return "ok";
    case "sent":
      return "alert";
    case "failed":
      return "error";
    case "skipped":
      return undefined;
  }
}

const HB_SCOPE = "heartbeat";
const HB_LAST_EVENT_KEY = "last_event";

let lastHeartbeat: HeartbeatEventPayload | null = null;
const listeners = new Set<(evt: HeartbeatEventPayload) => void>();

export function emitHeartbeatEvent(evt: Omit<HeartbeatEventPayload, "ts">) {
  const enriched: HeartbeatEventPayload = { ts: Date.now(), ...evt };
  lastHeartbeat = enriched;
  // Persist so the UI survives gateway restarts
  try {
    setOp1Setting(HB_SCOPE, HB_LAST_EVENT_KEY, enriched);
  } catch {
    /* best-effort: don't break heartbeat flow if DB write fails */
  }
  for (const listener of listeners) {
    try {
      listener(enriched);
    } catch {
      /* ignore */
    }
  }
}

export function onHeartbeatEvent(listener: (evt: HeartbeatEventPayload) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLastHeartbeatEvent(): HeartbeatEventPayload | null {
  if (lastHeartbeat !== null) {
    return lastHeartbeat;
  }
  // Restore from DB after a gateway restart
  try {
    const entry = getOp1Setting(HB_SCOPE, HB_LAST_EVENT_KEY);
    if (entry && typeof entry.value === "object" && entry.value !== null) {
      lastHeartbeat = entry.value as HeartbeatEventPayload;
      return lastHeartbeat;
    }
  } catch {
    /* best-effort: DB may not be ready on very early calls */
  }
  return null;
}
