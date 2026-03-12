import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCronRunsFromDb } from "./cron-runs-sqlite.js";
import { loadAllCronJobsFromDb } from "./cron-sqlite.js";
import { migrateCronToSqlite } from "./migrate-cron.js";
import { useCronTestDb } from "./test-helpers.cron.js";

describe("migrateCronToSqlite", () => {
  useCronTestDb();

  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  function makeCronDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-migrate-cron-"));
    const cronDir = path.join(tmpDir, "cron");
    fs.mkdirSync(cronDir, { recursive: true });
    return cronDir;
  }

  it("migrates jobs.json to cron_jobs table", () => {
    const cronDir = makeCronDir();
    const storePath = path.join(cronDir, "jobs.json");

    fs.writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        jobs: [
          {
            id: "job-1",
            name: "daily report",
            enabled: true,
            createdAtMs: 1000,
            updatedAtMs: 2000,
            schedule: { kind: "every", everyMs: 60000 },
            sessionTarget: "isolated",
            wakeMode: "next-heartbeat",
            payload: { kind: "agentTurn", message: "run" },
            state: {},
          },
        ],
      }),
    );

    const results = migrateCronToSqlite(storePath);
    const jobResult = results.find((r) => r.store === "cron-jobs");
    expect(jobResult?.migrated).toBe(true);
    expect(jobResult?.count).toBe(1);

    // Verify data in SQLite
    const jobs = loadAllCronJobsFromDb();
    expect(jobs).toHaveLength(1);
    expect((jobs[0] as Record<string, unknown>).name).toBe("daily report");

    // File should be removed
    expect(fs.existsSync(storePath)).toBe(false);
  });

  it("migrates runs/*.jsonl to cron_runs table", () => {
    const cronDir = makeCronDir();
    const storePath = path.join(cronDir, "jobs.json");
    const runsDir = path.join(cronDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    const entries = [
      { ts: 1000, jobId: "job-1", action: "finished", status: "ok", summary: "done" },
      { ts: 2000, jobId: "job-1", action: "finished", status: "error", error: "fail" },
    ];
    fs.writeFileSync(
      path.join(runsDir, "job-1.jsonl"),
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );

    const results = migrateCronToSqlite(storePath);
    const runResult = results.find((r) => r.store === "cron-run-logs");
    expect(runResult?.migrated).toBe(true);
    expect(runResult?.count).toBe(2);

    // Verify data in SQLite
    const page = readCronRunsFromDb({ jobId: "job-1", sortDir: "asc" });
    expect(page.total).toBe(2);
    expect(page.entries[0]?.status).toBe("ok");
    expect(page.entries[1]?.status).toBe("error");

    // JSONL files should be removed
    expect(fs.existsSync(path.join(runsDir, "job-1.jsonl"))).toBe(false);
  });

  it("skips migration when DB already has data", () => {
    const cronDir = makeCronDir();
    const storePath = path.join(cronDir, "jobs.json");

    fs.writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        jobs: [{ id: "old-job", name: "old" }],
      }),
    );

    // First migration
    migrateCronToSqlite(storePath);

    // Write new file (simulating a race or re-creation)
    fs.writeFileSync(
      storePath,
      JSON.stringify({
        version: 1,
        jobs: [{ id: "new-job", name: "new" }],
      }),
    );

    // Second migration should skip (DB already has data)
    const results = migrateCronToSqlite(storePath);
    const jobResult = results.find((r) => r.store === "cron-jobs");
    expect(jobResult?.migrated).toBe(false);

    // Original data should be preserved
    const jobs = loadAllCronJobsFromDb();
    expect(jobs).toHaveLength(1);
    expect((jobs[0] as Record<string, unknown>).name).toBe("old");
  });

  it("handles missing cron directory gracefully", () => {
    const results = migrateCronToSqlite("/nonexistent/path/jobs.json");
    for (const r of results) {
      expect(r.migrated).toBe(false);
      expect(r.error).toBeUndefined();
    }
  });

  it("skips invalid JSONL lines", () => {
    const cronDir = makeCronDir();
    const storePath = path.join(cronDir, "jobs.json");
    const runsDir = path.join(cronDir, "runs");
    fs.mkdirSync(runsDir, { recursive: true });

    fs.writeFileSync(
      path.join(runsDir, "job-1.jsonl"),
      [
        '{"bad json',
        JSON.stringify({ ts: 1, jobId: "job-1", action: "started", status: "ok" }),
        JSON.stringify({ ts: 2, jobId: "job-1", action: "finished", status: "ok" }),
        "",
      ].join("\n"),
    );

    const results = migrateCronToSqlite(storePath);
    const runResult = results.find((r) => r.store === "cron-run-logs");
    expect(runResult?.count).toBe(1); // only the valid "finished" entry
  });
});
