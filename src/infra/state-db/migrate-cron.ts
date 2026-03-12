/**
 * One-shot migration: cron JSON/JSONL files → SQLite.
 *
 * Covers:
 *   - cron/jobs.json → cron_jobs table
 *   - cron/runs/*.jsonl → cron_runs table
 *
 * Each migrator reads the file(s), inserts rows, then deletes the file(s).
 * Safe to call multiple times (idempotent: files are removed after migration).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CronRunLogEntry } from "../../cron/run-log.js";
import { loadJsonFile } from "../json-file.js";
import { appendCronRunToDb } from "./cron-runs-sqlite.js";
import { loadAllCronJobsFromDb, syncAllCronJobsToDb } from "./cron-sqlite.js";

type MigrationResult = {
  store: string;
  count: number;
  migrated: boolean;
  error?: string;
};

function tryUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

function tryRmdir(dirPath: string): void {
  try {
    // Only remove if empty
    const entries = fs.readdirSync(dirPath);
    if (entries.length === 0) {
      fs.rmdirSync(dirPath);
    }
  } catch {
    // ignore
  }
}

// ── Cron Jobs (jobs.json → cron_jobs) ────────────────────────────────────

function migrateCronJobs(cronDir: string): MigrationResult {
  const result: MigrationResult = { store: "cron-jobs", count: 0, migrated: false };
  const filePath = path.join(cronDir, "jobs.json");

  try {
    if (!fs.existsSync(filePath)) {
      return result;
    }

    // Skip if DB already has data
    const existing = loadAllCronJobsFromDb();
    if (existing.length > 0) {
      tryUnlink(filePath);
      return result;
    }

    const raw = loadJsonFile(filePath);
    if (!raw || typeof raw !== "object") {
      tryUnlink(filePath);
      return result;
    }

    const data = raw as Record<string, unknown>;
    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    if (jobs.length === 0) {
      tryUnlink(filePath);
      return result;
    }

    const validJobs = jobs.filter(
      (j): j is { id?: string; jobId?: string } & Record<string, unknown> =>
        j != null &&
        typeof j === "object" &&
        (typeof (j as Record<string, unknown>).id === "string" ||
          typeof (j as Record<string, unknown>).jobId === "string"),
    );

    if (validJobs.length > 0) {
      syncAllCronJobsToDb(validJobs);
      result.count = validJobs.length;
      result.migrated = true;
    }

    tryUnlink(filePath);
    // Also clean up backup files
    tryUnlink(`${filePath}.bak`);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Cron Run Logs (runs/*.jsonl → cron_runs) ─────────────────────────────

function migrateCronRunLogs(cronDir: string): MigrationResult {
  const result: MigrationResult = { store: "cron-run-logs", count: 0, migrated: false };
  const runsDir = path.join(cronDir, "runs");

  try {
    if (!fs.existsSync(runsDir)) {
      return result;
    }

    const files = fs.readdirSync(runsDir).filter((f) => f.endsWith(".jsonl"));

    if (files.length === 0) {
      return result;
    }

    for (const file of files) {
      const filePath = path.join(runsDir, file);
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }

      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const obj = JSON.parse(trimmed) as Partial<CronRunLogEntry> | null;
          if (!obj || typeof obj !== "object") {
            continue;
          }
          if (obj.action !== "finished") {
            continue;
          }
          if (typeof obj.jobId !== "string" || !obj.jobId.trim()) {
            continue;
          }
          if (typeof obj.ts !== "number" || !Number.isFinite(obj.ts)) {
            continue;
          }

          appendCronRunToDb({
            ts: obj.ts,
            jobId: obj.jobId,
            action: "finished",
            status: obj.status,
            error: obj.error,
            summary: obj.summary,
            delivered: obj.delivered,
            deliveryStatus: obj.deliveryStatus,
            deliveryError: obj.deliveryError,
            sessionId: obj.sessionId,
            sessionKey: obj.sessionKey,
            runAtMs: obj.runAtMs,
            durationMs: obj.durationMs,
            nextRunAtMs: obj.nextRunAtMs,
            model: obj.model,
            provider: obj.provider,
            usage: obj.usage,
          });
          result.count++;
        } catch {
          // skip unparseable lines
        }
      }

      tryUnlink(filePath);
    }

    if (result.count > 0) {
      result.migrated = true;
    }

    // Try to remove the empty runs directory
    tryRmdir(runsDir);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve the cron directory from the store path or default.
 * The cron dir is the parent of jobs.json (e.g. ~/.openclaw/cron/).
 */
function resolveCronDir(cronStorePath?: string): string {
  if (cronStorePath?.trim()) {
    return path.dirname(path.resolve(cronStorePath.trim()));
  }
  // Default: ~/.openclaw/cron/
  const homeDir = process.env.OPENCLAW_HOME ?? path.join(os.homedir(), ".openclaw");
  return path.join(homeDir, "cron");
}

export function migrateCronToSqlite(cronStorePath?: string): MigrationResult[] {
  const cronDir = resolveCronDir(cronStorePath);
  return [migrateCronJobs(cronDir), migrateCronRunLogs(cronDir)];
}
