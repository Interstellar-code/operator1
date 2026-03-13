import { useCallback } from "react";
import { useGateway } from "./use-gateway";

/* ── Types ──────────────────────────────────────────────── */

export type HeartbeatEvent = {
  ts: number;
  status: "sent" | "ok-empty" | "ok-token" | "skipped" | "failed";
  to?: string;
  accountId?: string;
  preview?: string;
  durationMs?: number;
  reason?: string;
  channel?: string;
  silent?: boolean;
  indicatorType?: "ok" | "alert" | "error";
};

export type HeartbeatSummary = {
  agentId: string;
  enabled: boolean;
  every: string;
  intervalMs: number;
  target?: string;
  model?: string;
  prompt?: string;
  session?: string;
  activeHours?: {
    start: string;
    end: string;
    timezone: string;
  };
  lightContext?: boolean;
  ackMaxChars?: number;
};

export type HeartbeatConfigResult = {
  agents: HeartbeatSummary[];
};

/* ── Helpers ─────────────────────────────────────────────── */

function isGatewayTeardownError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  return (
    err.message === "gateway client stopped" ||
    err.message === "gateway not connected" ||
    err.message.startsWith("gateway closed")
  );
}

/* ── Hook ────────────────────────────────────────────────── */

export function useHeartbeat() {
  const { sendRpc } = useGateway();

  /** Get last heartbeat event */
  const getLastHeartbeat = useCallback(async (): Promise<HeartbeatEvent | null> => {
    try {
      return await sendRpc<HeartbeatEvent | null>("last-heartbeat");
    } catch (err) {
      if (isGatewayTeardownError(err)) {
        return null;
      }
      throw err;
    }
  }, [sendRpc]);

  /** Enable or disable heartbeats globally */
  const setHeartbeatsEnabled = useCallback(
    async (enabled: boolean): Promise<void> => {
      try {
        await sendRpc("set-heartbeats", { enabled });
      } catch (err) {
        if (isGatewayTeardownError(err)) {
          return;
        }
        throw err;
      }
    },
    [sendRpc],
  );

  /** Get heartbeat config summary for all agents */
  const getHeartbeatConfig = useCallback(async (): Promise<HeartbeatConfigResult | null> => {
    try {
      return await sendRpc<HeartbeatConfigResult>("heartbeat.config");
    } catch (err) {
      if (isGatewayTeardownError(err)) {
        return null;
      }
      throw err;
    }
  }, [sendRpc]);

  /** Trigger immediate heartbeat run */
  const runHeartbeatNow = useCallback(async (): Promise<void> => {
    try {
      await sendRpc("heartbeat.runNow");
    } catch (err) {
      if (isGatewayTeardownError(err)) {
        return;
      }
      throw err;
    }
  }, [sendRpc]);

  return {
    getLastHeartbeat,
    setHeartbeatsEnabled,
    getHeartbeatConfig,
    runHeartbeatNow,
  };
}
