import { Type } from "@sinclair/typebox";
import { isRestartEnabled } from "../../config/commands.js";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveConfigSnapshotHash } from "../../config/io.js";
import { extractDeliveryInfo } from "../../config/sessions.js";
import {
  formatDoctorNonInteractiveHint,
  type RestartSentinelPayload,
  writeRestartSentinel,
} from "../../infra/restart-sentinel.js";
import { scheduleGatewaySigusr1Restart } from "../../infra/restart.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";
import { callGatewayTool, readGatewayCallOptions } from "./gateway.js";

const log = createSubsystemLogger("gateway-tool");

const DEFAULT_UPDATE_TIMEOUT_MS = 20 * 60_000;

function resolveBaseHashFromSnapshot(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== "object") {
    return undefined;
  }
  const hashValue = (snapshot as { hash?: unknown }).hash;
  const rawValue = (snapshot as { raw?: unknown }).raw;
  const hash = resolveConfigSnapshotHash({
    hash: typeof hashValue === "string" ? hashValue : undefined,
    raw: typeof rawValue === "string" ? rawValue : undefined,
  });
  return hash ?? undefined;
}

const GATEWAY_ACTIONS = [
  "restart",
  "config.get",
  "config.schema.lookup",
  "config.apply",
  "config.patch",
  "update.run",
  // Heartbeat
  "heartbeat.runNow",
  // State DB introspection (read-only unless state.settings.set)
  "state.info",
  "state.tables",
  "state.schema",
  "state.inspect",
  "state.query",
  "state.settings.list",
  "state.settings.get",
  "state.settings.set",
  "state.audit",
  "state.export",
] as const;

// NOTE: Using a flattened object schema instead of Type.Union([Type.Object(...), ...])
// because Claude API on Vertex AI rejects nested anyOf schemas as invalid JSON Schema.
// The discriminator (action) determines which properties are relevant; runtime validates.
const GatewayToolSchema = Type.Object({
  action: stringEnum(GATEWAY_ACTIONS),
  // restart
  delayMs: Type.Optional(Type.Number()),
  reason: Type.Optional(Type.String()),
  // config.get, config.schema.lookup, config.apply, update.run
  gatewayUrl: Type.Optional(Type.String()),
  gatewayToken: Type.Optional(Type.String()),
  timeoutMs: Type.Optional(Type.Number()),
  // config.schema.lookup
  path: Type.Optional(Type.String()),
  // config.apply, config.patch
  raw: Type.Optional(Type.String()),
  baseHash: Type.Optional(Type.String()),
  // config.apply, config.patch, update.run
  sessionKey: Type.Optional(Type.String()),
  note: Type.Optional(Type.String()),
  restartDelayMs: Type.Optional(Type.Number()),
  // state.schema, state.inspect, state.export, state.audit (filter)
  table: Type.Optional(Type.String()),
  // state.query
  sql: Type.Optional(Type.String()),
  // state.settings.*  ("core" = core_settings, "op1" = op1_settings)
  store: optionalStringEnum(["core", "op1"] as const),
  scope: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  value: Type.Optional(Type.Unknown()),
  // state.inspect
  columns: Type.Optional(Type.Array(Type.String())),
  offset: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Number()),
  // state.audit
  since: Type.Optional(Type.Number()),
  // "INSERT" | "UPDATE" | "DELETE" — named auditAction to avoid collision with `action`
  auditAction: optionalStringEnum(["INSERT", "UPDATE", "DELETE"] as const),
});
// NOTE: We intentionally avoid top-level `allOf`/`anyOf`/`oneOf` conditionals here:
// - OpenAI rejects tool schemas that include these keywords at the *top-level*.
// - Claude/Vertex has other JSON Schema quirks.
// Conditional requirements (like `raw` for config.apply) are enforced at runtime.

export function createGatewayTool(opts?: {
  agentSessionKey?: string;
  config?: OpenClawConfig;
}): AnyAgentTool {
  return {
    label: "Gateway",
    name: "gateway",
    ownerOnly: true,
    description:
      "Interact with the operator1 gateway: restart, config, update, trigger heartbeat, or query/write the live SQLite state DB. " +
      "Config: use config.schema.lookup before edits; config.patch for partial updates; config.apply to replace entire config (both restart). Pass `note` so the system can deliver a completion message after restart. " +
      "State DB (read-only except state.settings.set): state.info=DB overview, state.tables=all tables+row counts, state.schema=DDL for a table, state.inspect=paginated rows, state.query=arbitrary SELECT SQL, state.settings.list/get=read KV settings (store='core'|'op1'), state.settings.set=write a setting, state.audit=audit trail, state.export=export table(s) as JSON.",
    parameters: GatewayToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      if (action === "restart") {
        if (!isRestartEnabled(opts?.config)) {
          throw new Error("Gateway restart is disabled (commands.restart=false).");
        }
        const sessionKey =
          typeof params.sessionKey === "string" && params.sessionKey.trim()
            ? params.sessionKey.trim()
            : opts?.agentSessionKey?.trim() || undefined;
        const delayMs =
          typeof params.delayMs === "number" && Number.isFinite(params.delayMs)
            ? Math.floor(params.delayMs)
            : undefined;
        const reason =
          typeof params.reason === "string" && params.reason.trim()
            ? params.reason.trim().slice(0, 200)
            : undefined;
        const note =
          typeof params.note === "string" && params.note.trim() ? params.note.trim() : undefined;
        // Extract channel + threadId for routing after restart
        // Supports both :thread: (most channels) and :topic: (Telegram)
        const { deliveryContext, threadId } = extractDeliveryInfo(sessionKey);
        const payload: RestartSentinelPayload = {
          kind: "restart",
          status: "ok",
          ts: Date.now(),
          sessionKey,
          deliveryContext,
          threadId,
          message: note ?? reason ?? null,
          doctorHint: formatDoctorNonInteractiveHint(),
          stats: {
            mode: "gateway.restart",
            reason,
          },
        };
        try {
          await writeRestartSentinel(payload);
        } catch {
          // ignore: sentinel is best-effort
        }
        log.info(
          `gateway tool: restart requested (delayMs=${delayMs ?? "default"}, reason=${reason ?? "none"})`,
        );
        const scheduled = scheduleGatewaySigusr1Restart({
          delayMs,
          reason,
        });
        return jsonResult(scheduled);
      }

      const gatewayOpts = readGatewayCallOptions(params);

      const resolveGatewayWriteMeta = (): {
        sessionKey: string | undefined;
        note: string | undefined;
        restartDelayMs: number | undefined;
      } => {
        const sessionKey =
          typeof params.sessionKey === "string" && params.sessionKey.trim()
            ? params.sessionKey.trim()
            : opts?.agentSessionKey?.trim() || undefined;
        const note =
          typeof params.note === "string" && params.note.trim() ? params.note.trim() : undefined;
        const restartDelayMs =
          typeof params.restartDelayMs === "number" && Number.isFinite(params.restartDelayMs)
            ? Math.floor(params.restartDelayMs)
            : undefined;
        return { sessionKey, note, restartDelayMs };
      };

      const resolveConfigWriteParams = async (): Promise<{
        raw: string;
        baseHash: string;
        sessionKey: string | undefined;
        note: string | undefined;
        restartDelayMs: number | undefined;
      }> => {
        const raw = readStringParam(params, "raw", { required: true });
        let baseHash = readStringParam(params, "baseHash");
        if (!baseHash) {
          const snapshot = await callGatewayTool("config.get", gatewayOpts, {});
          baseHash = resolveBaseHashFromSnapshot(snapshot);
        }
        if (!baseHash) {
          throw new Error("Missing baseHash from config snapshot.");
        }
        return { raw, baseHash, ...resolveGatewayWriteMeta() };
      };

      if (action === "config.get") {
        const result = await callGatewayTool("config.get", gatewayOpts, {});
        return jsonResult({ ok: true, result });
      }
      if (action === "config.schema.lookup") {
        const path = readStringParam(params, "path", {
          required: true,
          label: "path",
        });
        const result = await callGatewayTool("config.schema.lookup", gatewayOpts, { path });
        return jsonResult({ ok: true, result });
      }
      if (action === "config.apply") {
        const { raw, baseHash, sessionKey, note, restartDelayMs } =
          await resolveConfigWriteParams();
        const result = await callGatewayTool("config.apply", gatewayOpts, {
          raw,
          baseHash,
          sessionKey,
          note,
          restartDelayMs,
        });
        return jsonResult({ ok: true, result });
      }
      if (action === "config.patch") {
        const { raw, baseHash, sessionKey, note, restartDelayMs } =
          await resolveConfigWriteParams();
        const result = await callGatewayTool("config.patch", gatewayOpts, {
          raw,
          baseHash,
          sessionKey,
          note,
          restartDelayMs,
        });
        return jsonResult({ ok: true, result });
      }
      if (action === "update.run") {
        const { sessionKey, note, restartDelayMs } = resolveGatewayWriteMeta();
        const updateTimeoutMs = gatewayOpts.timeoutMs ?? DEFAULT_UPDATE_TIMEOUT_MS;
        const updateGatewayOpts = {
          ...gatewayOpts,
          timeoutMs: updateTimeoutMs,
        };
        const result = await callGatewayTool("update.run", updateGatewayOpts, {
          sessionKey,
          note,
          restartDelayMs,
          timeoutMs: updateTimeoutMs,
        });
        return jsonResult({ ok: true, result });
      }

      // ── Heartbeat ─────────────────────────────────────────────────────────
      if (action === "heartbeat.runNow") {
        const result = await callGatewayTool("heartbeat.runNow", gatewayOpts, {});
        return jsonResult({ ok: true, result });
      }

      // ── State DB actions ──────────────────────────────────────────────────
      if (action === "state.info" || action === "state.tables") {
        const result = await callGatewayTool(action, gatewayOpts, {});
        return jsonResult({ ok: true, result });
      }
      if (action === "state.schema" || action === "state.export") {
        const table = readStringParam(params, "table");
        const result = await callGatewayTool(action, gatewayOpts, { table });
        return jsonResult({ ok: true, result });
      }
      if (action === "state.inspect") {
        const table = readStringParam(params, "table", { required: true });
        const limit = typeof params.limit === "number" ? params.limit : undefined;
        const offset = typeof params.offset === "number" ? params.offset : undefined;
        const columns = Array.isArray(params.columns) ? (params.columns as string[]) : undefined;
        const result = await callGatewayTool(action, gatewayOpts, {
          table,
          limit,
          offset,
          columns,
        });
        return jsonResult({ ok: true, result });
      }
      if (action === "state.query") {
        const sql = readStringParam(params, "sql", { required: true });
        const limit = typeof params.limit === "number" ? params.limit : undefined;
        const result = await callGatewayTool(action, gatewayOpts, { sql, limit });
        return jsonResult({ ok: true, result });
      }
      if (action === "state.settings.list") {
        const store = readStringParam(params, "store", { required: true });
        const scope = readStringParam(params, "scope");
        const result = await callGatewayTool(action, gatewayOpts, { store, scope });
        return jsonResult({ ok: true, result });
      }
      if (action === "state.settings.get") {
        const store = readStringParam(params, "store", { required: true });
        const scope = readStringParam(params, "scope", { required: true });
        const key = readStringParam(params, "key", { required: true });
        const result = await callGatewayTool(action, gatewayOpts, { store, scope, key });
        return jsonResult({ ok: true, result });
      }
      if (action === "state.settings.set") {
        const store = readStringParam(params, "store", { required: true });
        const scope = readStringParam(params, "scope", { required: true });
        const key = readStringParam(params, "key", { required: true });
        const value = params.value;
        const result = await callGatewayTool(action, gatewayOpts, { store, scope, key, value });
        return jsonResult({ ok: true, result });
      }
      if (action === "state.audit") {
        const table = readStringParam(params, "table");
        // auditAction maps to the `action` field in the RPC params (avoids collision with tool `action`)
        const auditAction = readStringParam(params, "auditAction");
        const since = typeof params.since === "number" ? params.since : undefined;
        const limit = typeof params.limit === "number" ? params.limit : undefined;
        const result = await callGatewayTool(action, gatewayOpts, {
          table,
          action: auditAction,
          since,
          limit,
        });
        return jsonResult({ ok: true, result });
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
