import { describe, expect, it } from "vitest";
import { useCronTestDb } from "../infra/state-db/test-helpers.cron.js";
import {
  appendCronRunLog,
  DEFAULT_CRON_RUN_LOG_KEEP_LINES,
  DEFAULT_CRON_RUN_LOG_MAX_BYTES,
  readCronRunLogEntries,
  readCronRunLogEntriesPage,
  readCronRunLogEntriesPageAll,
  resolveCronRunLogPruneOptions,
} from "./run-log.js";

describe("cron run log", () => {
  useCronTestDb();

  it("resolves prune options from config with defaults", () => {
    expect(resolveCronRunLogPruneOptions()).toEqual({
      maxBytes: DEFAULT_CRON_RUN_LOG_MAX_BYTES,
      keepLines: DEFAULT_CRON_RUN_LOG_KEEP_LINES,
    });
    expect(
      resolveCronRunLogPruneOptions({
        maxBytes: "5mb",
        keepLines: 123,
      }),
    ).toEqual({
      maxBytes: 5 * 1024 * 1024,
      keepLines: 123,
    });
    expect(
      resolveCronRunLogPruneOptions({
        maxBytes: "invalid",
        keepLines: -1,
      }),
    ).toEqual({
      maxBytes: DEFAULT_CRON_RUN_LOG_MAX_BYTES,
      keepLines: DEFAULT_CRON_RUN_LOG_KEEP_LINES,
    });
  });

  it("appends and reads entries", () => {
    for (let i = 0; i < 10; i++) {
      appendCronRunLog({
        ts: 1000 + i,
        jobId: "job-1",
        action: "finished",
        status: "ok",
        durationMs: i,
      });
    }

    const entries = readCronRunLogEntries({ limit: 100, jobId: "job-1" });
    expect(entries).toHaveLength(10);
    // readCronRunLogEntries returns in ascending order (oldest first)
    expect(entries[0]?.ts).toBe(1000);
    expect(entries[9]?.ts).toBe(1009);
  });

  it("reads entries filtered by jobId", () => {
    appendCronRunLog({ ts: 1, jobId: "a", action: "finished", status: "ok" });
    appendCronRunLog({
      ts: 2,
      jobId: "b",
      action: "finished",
      status: "error",
      error: "nope",
      summary: "oops",
    });
    appendCronRunLog({
      ts: 3,
      jobId: "a",
      action: "finished",
      status: "skipped",
      sessionId: "run-123",
      sessionKey: "agent:main:cron:a:run:run-123",
    });

    const allA = readCronRunLogEntries({ limit: 10, jobId: "a" });
    expect(allA.map((e) => e.jobId)).toEqual(["a", "a"]);

    const onlyA = readCronRunLogEntries({ limit: 10, jobId: "a" });
    expect(onlyA.map((e) => e.ts)).toEqual([1, 3]);

    const lastOne = readCronRunLogEntries({ limit: 1, jobId: "a" });
    expect(lastOne.map((e) => e.ts)).toEqual([3]);
    expect(lastOne[0]?.sessionId).toBe("run-123");
    expect(lastOne[0]?.sessionKey).toBe("agent:main:cron:a:run:run-123");

    const onlyB = readCronRunLogEntries({ limit: 10, jobId: "b" });
    expect(onlyB[0]?.summary).toBe("oops");

    const wrongFilter = readCronRunLogEntries({ limit: 10, jobId: "nonexistent" });
    expect(wrongFilter).toEqual([]);
  });

  it("preserves delivery fields", () => {
    appendCronRunLog({
      ts: 2,
      jobId: "job-1",
      action: "finished",
      status: "ok",
      delivered: true,
      deliveryStatus: "not-delivered",
      deliveryError: "announce failed",
    });

    const entries = readCronRunLogEntries({ limit: 10, jobId: "job-1" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.ts).toBe(2);
    expect(entries[0]?.delivered).toBe(true);
    expect(entries[0]?.deliveryStatus).toBe("not-delivered");
    expect(entries[0]?.deliveryError).toBe("announce failed");
  });

  it("reads telemetry fields", () => {
    appendCronRunLog({
      ts: 1,
      jobId: "job-1",
      action: "finished",
      status: "ok",
      model: "gpt-5.2",
      provider: "openai",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
        cache_read_tokens: 2,
        cache_write_tokens: 1,
      },
    });

    // Entry with blank/empty model and provider
    appendCronRunLog({
      ts: 2,
      jobId: "job-1",
      action: "finished",
      status: "ok",
      model: " ",
      provider: "",
    });

    const entries = readCronRunLogEntries({ limit: 10, jobId: "job-1" });
    expect(entries[0]?.model).toBe("gpt-5.2");
    expect(entries[0]?.provider).toBe("openai");
    expect(entries[0]?.usage).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      cache_read_tokens: 2,
      cache_write_tokens: 1,
    });
    expect(entries[1]?.model).toBeUndefined();
    expect(entries[1]?.provider).toBeUndefined();
    expect(entries[1]?.usage).toBeUndefined();
  });

  it("paginates results with readCronRunLogEntriesPage", () => {
    for (let i = 0; i < 5; i++) {
      appendCronRunLog({
        ts: 1000 + i,
        jobId: "job-p",
        action: "finished",
        status: "ok",
      });
    }

    const page1 = readCronRunLogEntriesPage({
      jobId: "job-p",
      limit: 2,
      offset: 0,
      sortDir: "desc",
    });
    expect(page1.total).toBe(5);
    expect(page1.entries).toHaveLength(2);
    expect(page1.hasMore).toBe(true);
    expect(page1.entries[0]?.ts).toBe(1004);

    const page2 = readCronRunLogEntriesPage({
      jobId: "job-p",
      limit: 2,
      offset: 2,
      sortDir: "desc",
    });
    expect(page2.entries).toHaveLength(2);
    expect(page2.entries[0]?.ts).toBe(1002);
  });

  it("filters by status", () => {
    appendCronRunLog({ ts: 1, jobId: "j", action: "finished", status: "ok" });
    appendCronRunLog({ ts: 2, jobId: "j", action: "finished", status: "error", error: "fail" });
    appendCronRunLog({ ts: 3, jobId: "j", action: "finished", status: "skipped" });

    const errorsOnly = readCronRunLogEntriesPage({ jobId: "j", statuses: ["error"] });
    expect(errorsOnly.total).toBe(1);
    expect(errorsOnly.entries[0]?.status).toBe("error");

    const okAndSkipped = readCronRunLogEntriesPage({ jobId: "j", statuses: ["ok", "skipped"] });
    expect(okAndSkipped.total).toBe(2);
  });

  it("reads all jobs with readCronRunLogEntriesPageAll", () => {
    appendCronRunLog({ ts: 1, jobId: "alpha", action: "finished", status: "ok" });
    appendCronRunLog({ ts: 2, jobId: "beta", action: "finished", status: "error", error: "boom" });
    appendCronRunLog({ ts: 3, jobId: "alpha", action: "finished", status: "ok" });

    const page = readCronRunLogEntriesPageAll({
      limit: 10,
      sortDir: "desc",
      jobNameById: { alpha: "Alpha Job", beta: "Beta Job" },
    });
    expect(page.total).toBe(3);
    expect(page.entries[0]?.ts).toBe(3);
    const first = page.entries[0] as { jobName?: string };
    expect(first.jobName).toBe("Alpha Job");
  });

  it("filters by delivery status", () => {
    appendCronRunLog({
      ts: 1,
      jobId: "d",
      action: "finished",
      status: "ok",
      deliveryStatus: "delivered",
    });
    appendCronRunLog({
      ts: 2,
      jobId: "d",
      action: "finished",
      status: "ok",
      deliveryStatus: "not-delivered",
    });
    appendCronRunLog({
      ts: 3,
      jobId: "d",
      action: "finished",
      status: "ok",
      // no deliveryStatus = "not-requested"
    });

    const delivered = readCronRunLogEntriesPage({
      jobId: "d",
      deliveryStatuses: ["delivered"],
    });
    expect(delivered.total).toBe(1);
    expect(delivered.entries[0]?.deliveryStatus).toBe("delivered");

    const notRequested = readCronRunLogEntriesPage({
      jobId: "d",
      deliveryStatuses: ["not-requested"],
    });
    expect(notRequested.total).toBe(1);
    expect(notRequested.entries[0]?.ts).toBe(3);
  });

  it("filters by query text", () => {
    appendCronRunLog({
      ts: 1,
      jobId: "q",
      action: "finished",
      status: "ok",
      summary: "deployment succeeded",
    });
    appendCronRunLog({
      ts: 2,
      jobId: "q",
      action: "finished",
      status: "error",
      error: "network timeout",
    });

    const matched = readCronRunLogEntriesPage({ jobId: "q", query: "timeout" });
    expect(matched.total).toBe(1);
    expect(matched.entries[0]?.error).toBe("network timeout");
  });
});
