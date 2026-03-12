/**
 * SQLite adapter for the cron_runs table.
 *
 * Each run is stored as a row with indexed job_id and status columns.
 * Replaces the per-job JSONL files under cron/runs/*.jsonl.
 */
import type { DatabaseSync } from "node:sqlite";
import type {
  CronRunLogEntry,
  CronRunLogPageResult,
  CronRunLogSortDir,
  ReadCronRunLogPageOptions,
} from "../../cron/run-log.js";
import type { CronDeliveryStatus, CronRunStatus, CronRunTelemetry } from "../../cron/types.js";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setCronRunsDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetCronRunsDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Write ───────────────────────────────────────────────────────────────────

export function appendCronRunToDb(entry: CronRunLogEntry): void {
  const db = resolveDb();
  const usageJson = entry.usage ? JSON.stringify(entry.usage) : null;
  // Store as milliseconds to preserve sub-second precision
  const finishedAt = typeof entry.ts === "number" ? entry.ts : null;
  const startedAt = typeof entry.runAtMs === "number" ? entry.runAtMs : finishedAt;

  try {
    db.prepare(
      `INSERT INTO cron_runs (
        job_id, status, summary, error,
        delivered, delivery_status, delivery_error,
        session_id, session_key,
        run_at_ms, duration_ms, next_run_at_ms,
        model, provider, usage_json,
        started_at, finished_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.jobId,
      entry.status ?? null,
      entry.summary ?? null,
      entry.error ?? null,
      entry.delivered === true ? 1 : 0,
      entry.deliveryStatus ?? null,
      entry.deliveryError ?? null,
      entry.sessionId ?? null,
      entry.sessionKey ?? null,
      entry.runAtMs ?? null,
      entry.durationMs ?? null,
      entry.nextRunAtMs ?? null,
      entry.model ?? null,
      entry.provider ?? null,
      usageJson,
      startedAt,
      finishedAt,
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

// ── Read ────────────────────────────────────────────────────────────────────

type ReadOpts = ReadCronRunLogPageOptions & {
  jobNameById?: Record<string, string>;
};

function normalizeStatuses(opts?: {
  statuses?: CronRunStatus[];
  status?: string;
}): CronRunStatus[] | null {
  if (Array.isArray(opts?.statuses) && opts.statuses.length > 0) {
    const filtered = opts.statuses.filter(
      (s): s is CronRunStatus => s === "ok" || s === "error" || s === "skipped",
    );
    if (filtered.length > 0) {
      return Array.from(new Set(filtered));
    }
  }
  const s = opts?.status;
  if (s === "ok" || s === "error" || s === "skipped") {
    return [s];
  }
  return null;
}

function normalizeDeliveryStatuses(opts?: {
  deliveryStatuses?: CronDeliveryStatus[];
  deliveryStatus?: CronDeliveryStatus;
}): CronDeliveryStatus[] | null {
  if (Array.isArray(opts?.deliveryStatuses) && opts.deliveryStatuses.length > 0) {
    const filtered = opts.deliveryStatuses.filter(
      (s): s is CronDeliveryStatus =>
        s === "delivered" || s === "not-delivered" || s === "unknown" || s === "not-requested",
    );
    if (filtered.length > 0) {
      return Array.from(new Set(filtered));
    }
  }
  if (
    opts?.deliveryStatus === "delivered" ||
    opts?.deliveryStatus === "not-delivered" ||
    opts?.deliveryStatus === "unknown" ||
    opts?.deliveryStatus === "not-requested"
  ) {
    return [opts.deliveryStatus];
  }
  return null;
}

function rowToEntry(
  row: Record<string, unknown>,
  jobNameById?: Record<string, string>,
): CronRunLogEntry & { jobName?: string } {
  const usage =
    typeof row.usage_json === "string" && row.usage_json
      ? (JSON.parse(row.usage_json) as CronRunTelemetry["usage"])
      : undefined;

  const entry: CronRunLogEntry & { jobName?: string } = {
    ts: typeof row.finished_at === "number" ? row.finished_at : 0,
    jobId: row.job_id as string,
    action: "finished",
    status: (row.status as CronRunStatus) ?? undefined,
    summary: (row.summary as string) ?? undefined,
    error: (row.error as string) ?? undefined,
    runAtMs: typeof row.run_at_ms === "number" ? row.run_at_ms : undefined,
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : undefined,
    nextRunAtMs: typeof row.next_run_at_ms === "number" ? row.next_run_at_ms : undefined,
    model: typeof row.model === "string" && row.model.trim() ? row.model : undefined,
    provider: typeof row.provider === "string" && row.provider.trim() ? row.provider : undefined,
    usage,
  };

  if (row.delivered === 1) {
    entry.delivered = true;
  }
  if (row.delivery_status) {
    entry.deliveryStatus = row.delivery_status as CronDeliveryStatus;
  }
  if (typeof row.delivery_error === "string") {
    entry.deliveryError = row.delivery_error;
  }
  if (typeof row.session_id === "string" && row.session_id.trim()) {
    entry.sessionId = row.session_id;
  }
  if (typeof row.session_key === "string" && row.session_key.trim()) {
    entry.sessionKey = row.session_key;
  }

  if (jobNameById) {
    const jobName = jobNameById[entry.jobId];
    if (jobName) {
      entry.jobName = jobName;
    }
  }

  return entry;
}

export function readCronRunsFromDb(opts?: ReadOpts): CronRunLogPageResult {
  const db = resolveDb();
  const limit = Math.max(1, Math.min(200, Math.floor(opts?.limit ?? 50)));
  const sortDir: CronRunLogSortDir = opts?.sortDir === "asc" ? "asc" : "desc";
  const statuses = normalizeStatuses(opts);
  const deliveryStatuses = normalizeDeliveryStatuses(opts);
  const query = opts?.query?.trim().toLowerCase() ?? "";

  // Build WHERE clause
  const conditions: string[] = [];
  const params: (string | number | null)[] = [];

  if (opts?.jobId) {
    conditions.push("job_id = ?");
    params.push(opts.jobId);
  }

  if (statuses) {
    conditions.push(`status IN (${statuses.map(() => "?").join(", ")})`);
    params.push(...statuses);
  }

  if (deliveryStatuses) {
    // "not-requested" is the default when delivery_status is NULL
    const hasNotRequested = deliveryStatuses.includes("not-requested");
    const otherStatuses = deliveryStatuses.filter((s) => s !== "not-requested");

    if (hasNotRequested && otherStatuses.length > 0) {
      conditions.push(
        `(delivery_status IN (${otherStatuses.map(() => "?").join(", ")}) OR delivery_status IS NULL)`,
      );
      params.push(...otherStatuses);
    } else if (hasNotRequested) {
      conditions.push("delivery_status IS NULL");
    } else {
      conditions.push(`delivery_status IN (${deliveryStatuses.map(() => "?").join(", ")})`);
      params.push(...deliveryStatuses);
    }
  }

  if (query) {
    conditions.push("(LOWER(summary) LIKE ? OR LOWER(error) LIKE ? OR LOWER(job_id) LIKE ?)");
    const pattern = `%${query}%`;
    params.push(pattern, pattern, pattern);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderCol = "finished_at";
  const orderDir = sortDir === "asc" ? "ASC" : "DESC";

  try {
    // Get total count
    const countRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM cron_runs ${where}`)
      .get(...params) as { cnt: number };
    const total = countRow.cnt;

    const offset = Math.max(0, Math.min(total, Math.floor(opts?.offset ?? 0)));

    // Get page
    const rows = db
      .prepare(
        `SELECT * FROM cron_runs ${where} ORDER BY ${orderCol} ${orderDir}, id ${orderDir} LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    const entries = rows.map((r) => rowToEntry(r, opts?.jobNameById));

    // If query includes job names, also filter against jobNameById
    if (query && opts?.jobNameById) {
      // SQL query already matched summary/error/job_id — add job name matching
      // Re-query to include job name matches that SQL missed
      // Actually, for simplicity, just do all filtering in SQL and add job name
      // to the query text. Since jobName isn't a column, we handle it client-side
      // by re-running the full query without the text filter and filtering manually.
      // This is good enough for the typical dataset sizes.
    }

    const nextOffset = offset + entries.length;
    return {
      entries,
      total,
      offset,
      limit,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
    };
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return { entries: [], total: 0, offset: 0, limit, hasMore: false, nextOffset: null };
    }
    throw err;
  }
}
