/**
 * SQLite adapter for the cron_jobs table.
 *
 * Each cron job is stored as a row: (job_id TEXT PK, job_json TEXT, enabled, created_at, updated_at).
 * The full job object is serialized as JSON in job_json.
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setCronDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetCronDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Types ────────────────────────────────────────────────────────────────────

type CronJobRow = {
  job_id: string;
  job_json: string;
  enabled: number;
  created_at: number | null;
  updated_at: number | null;
};

// ── Read ────────────────────────────────────────────────────────────────────

export function loadAllCronJobsFromDb<T = unknown>(): T[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT job_json FROM cron_jobs ORDER BY created_at ASC")
      .all() as CronJobRow[];
    const jobs: T[] = [];
    for (const row of rows) {
      try {
        jobs.push(JSON.parse(row.job_json) as T);
      } catch {
        // skip unparseable rows
      }
    }
    return jobs;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function loadCronJobFromDb<T = unknown>(jobId: string): T | null {
  const db = resolveDb();
  try {
    const row = db.prepare("SELECT job_json FROM cron_jobs WHERE job_id = ?").get(jobId) as
      | CronJobRow
      | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.job_json) as T;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

// ── Write ───────────────────────────────────────────────────────────────────

export function saveCronJobToDb(jobId: string, job: unknown): void {
  const db = resolveDb();
  const json = JSON.stringify(job);
  const jobObj = job as { enabled?: boolean; createdAtMs?: number; updatedAtMs?: number };
  const enabled = jobObj.enabled !== false ? 1 : 0;
  const createdAt =
    typeof jobObj.createdAtMs === "number" ? Math.floor(jobObj.createdAtMs / 1000) : null;
  const updatedAt =
    typeof jobObj.updatedAtMs === "number" ? Math.floor(jobObj.updatedAtMs / 1000) : null;
  try {
    db.prepare(
      `INSERT INTO cron_jobs (job_id, job_json, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (job_id) DO UPDATE SET
         job_json = excluded.job_json,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
    ).run(jobId, json, enabled, createdAt, updatedAt);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

export function deleteCronJobFromDb(jobId: string): boolean {
  const db = resolveDb();
  try {
    const result = db.prepare("DELETE FROM cron_jobs WHERE job_id = ?").run(jobId);
    return result.changes > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}

/**
 * Bulk-sync: replace all cron_jobs rows with the given job list.
 * Used by saveCronStore() to write the full jobs array atomically.
 */
export function syncAllCronJobsToDb(
  jobs: Array<{ id?: string; jobId?: string } & Record<string, unknown>>,
): void {
  const db = resolveDb();
  try {
    // Use a transaction for atomicity
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM cron_jobs");
      const insert = db.prepare(
        `INSERT INTO cron_jobs (job_id, job_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const job of jobs) {
        const json = JSON.stringify(job);
        const enabled = (job as { enabled?: boolean }).enabled !== false ? 1 : 0;
        const createdAtMs = (job as { createdAtMs?: number }).createdAtMs;
        const updatedAtMs = (job as { updatedAtMs?: number }).updatedAtMs;
        const createdAt = typeof createdAtMs === "number" ? Math.floor(createdAtMs / 1000) : null;
        const updatedAt = typeof updatedAtMs === "number" ? Math.floor(updatedAtMs / 1000) : null;
        const jobId = job.id ?? job.jobId ?? "";
        insert.run(jobId, json, enabled, createdAt, updatedAt);
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}
