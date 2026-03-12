/**
 * One-shot migration: subagents/runs.json → op1_subagent_runs table.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { loadJsonFile } from "../infra/json-file.js";
import { normalizeDeliveryContext } from "../utils/delivery-context.js";
import { saveSubagentRunToDb } from "./subagent-registry-sqlite.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

type LegacyRunRecord = SubagentRunRecord & {
  announceCompletedAt?: unknown;
  announceHandled?: unknown;
  requesterChannel?: unknown;
  requesterAccountId?: unknown;
};

export function migrateSubagentRegistryToSqlite(): {
  count: number;
  migrated: boolean;
  error?: string;
} {
  const stateDir = resolveStateDir(process.env);
  const filePath = path.join(stateDir, "subagents", "runs.json");

  if (!fs.existsSync(filePath)) {
    return { count: 0, migrated: false };
  }

  try {
    const raw = loadJsonFile(filePath) as {
      version?: number;
      runs?: Record<string, LegacyRunRecord>;
    } | null;

    if (!raw?.runs || typeof raw.runs !== "object") {
      fs.unlinkSync(filePath);
      return { count: 0, migrated: true };
    }

    const isLegacy = raw.version === 1;
    let count = 0;

    for (const [runId, entry] of Object.entries(raw.runs)) {
      if (!entry || typeof entry !== "object" || !entry.runId) {
        continue;
      }

      const typed = entry;
      const legacyCompletedAt =
        isLegacy && typeof typed.announceCompletedAt === "number"
          ? typed.announceCompletedAt
          : undefined;
      const cleanupCompletedAt =
        typeof typed.cleanupCompletedAt === "number" ? typed.cleanupCompletedAt : legacyCompletedAt;
      const cleanupHandled =
        typeof typed.cleanupHandled === "boolean"
          ? typed.cleanupHandled
          : isLegacy
            ? Boolean(typed.announceHandled ?? cleanupCompletedAt)
            : undefined;
      const requesterOrigin = normalizeDeliveryContext(
        typed.requesterOrigin ?? {
          channel: typeof typed.requesterChannel === "string" ? typed.requesterChannel : undefined,
          accountId:
            typeof typed.requesterAccountId === "string" ? typed.requesterAccountId : undefined,
        },
      );

      const {
        announceCompletedAt: _a,
        announceHandled: _b,
        requesterChannel: _c,
        requesterAccountId: _d,
        ...rest
      } = typed;

      const record: SubagentRunRecord = {
        ...rest,
        runId,
        requesterOrigin,
        cleanupCompletedAt,
        cleanupHandled,
        spawnMode: typed.spawnMode === "session" ? "session" : "run",
      };

      saveSubagentRunToDb(record);
      count++;
    }

    fs.unlinkSync(filePath);
    // Clean up empty directory
    const dir = path.dirname(filePath);
    try {
      const remaining = fs.readdirSync(dir);
      if (remaining.length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      /* ignore */
    }

    return { count, migrated: true };
  } catch (err) {
    return {
      count: 0,
      migrated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
