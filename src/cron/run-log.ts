import { parseByteSize } from "../cli/parse-bytes.js";
import type { CronConfig } from "../config/types.cron.js";
import { appendCronRunToDb, readCronRunsFromDb } from "../infra/state-db/cron-runs-sqlite.js";
import type { CronDeliveryStatus, CronRunStatus, CronRunTelemetry } from "./types.js";

export type CronRunLogEntry = {
  ts: number;
  jobId: string;
  action: "finished";
  status?: CronRunStatus;
  error?: string;
  summary?: string;
  delivered?: boolean;
  deliveryStatus?: CronDeliveryStatus;
  deliveryError?: string;
  sessionId?: string;
  sessionKey?: string;
  runAtMs?: number;
  durationMs?: number;
  nextRunAtMs?: number;
} & CronRunTelemetry;

export type CronRunLogSortDir = "asc" | "desc";
export type CronRunLogStatusFilter = "all" | "ok" | "error" | "skipped";

export type ReadCronRunLogPageOptions = {
  limit?: number;
  offset?: number;
  jobId?: string;
  status?: CronRunLogStatusFilter;
  statuses?: CronRunStatus[];
  deliveryStatus?: CronDeliveryStatus;
  deliveryStatuses?: CronDeliveryStatus[];
  query?: string;
  sortDir?: CronRunLogSortDir;
};

export type CronRunLogPageResult = {
  entries: CronRunLogEntry[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  nextOffset: number | null;
};

type ReadCronRunLogAllPageOptions = Omit<ReadCronRunLogPageOptions, "jobId"> & {
  jobNameById?: Record<string, string>;
};

// ── Prune options (still used by server-cron.ts config resolution) ───────────

export const DEFAULT_CRON_RUN_LOG_MAX_BYTES = 2_000_000;
export const DEFAULT_CRON_RUN_LOG_KEEP_LINES = 2_000;

export function resolveCronRunLogPruneOptions(cfg?: CronConfig["runLog"]): {
  maxBytes: number;
  keepLines: number;
} {
  let maxBytes = DEFAULT_CRON_RUN_LOG_MAX_BYTES;
  if (cfg?.maxBytes !== undefined) {
    try {
      maxBytes = parseByteSize(String(cfg.maxBytes).trim(), { defaultUnit: "b" });
    } catch {
      maxBytes = DEFAULT_CRON_RUN_LOG_MAX_BYTES;
    }
  }

  let keepLines = DEFAULT_CRON_RUN_LOG_KEEP_LINES;
  if (typeof cfg?.keepLines === "number" && Number.isFinite(cfg.keepLines) && cfg.keepLines > 0) {
    keepLines = Math.floor(cfg.keepLines);
  }

  return { maxBytes, keepLines };
}

// ── Write ───────────────────────────────────────────────────────────────────

export function appendCronRunLog(entry: CronRunLogEntry): void {
  appendCronRunToDb(entry);
}

// ── Read ────────────────────────────────────────────────────────────────────

export function readCronRunLogEntries(opts?: {
  limit?: number;
  jobId?: string;
}): CronRunLogEntry[] {
  const limit = Math.max(1, Math.min(5000, Math.floor(opts?.limit ?? 200)));
  const page = readCronRunLogEntriesPage({
    jobId: opts?.jobId,
    limit,
    offset: 0,
    status: "all",
    sortDir: "desc",
  });
  return page.entries.toReversed();
}

export function readCronRunLogEntriesPage(opts?: ReadCronRunLogPageOptions): CronRunLogPageResult {
  return readCronRunsFromDb(opts);
}

export function readCronRunLogEntriesPageAll(
  opts: ReadCronRunLogAllPageOptions,
): CronRunLogPageResult {
  return readCronRunsFromDb(opts);
}
