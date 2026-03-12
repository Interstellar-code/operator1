import { describe, expect, it, vi } from "vitest";
import { syncAllCronJobsToDb } from "../infra/state-db/cron-sqlite.js";
import { CronService } from "./service.js";
import { createCronStoreHarness, createNoopLogger } from "./service.test-harness.js";

const noopLogger = createNoopLogger();
const { makeStorePath } = createCronStoreHarness({ prefix: "openclaw-cron-issue-35195-" });

describe("cron edit persistence (#35195)", () => {
  it("persists edits through service restart", async () => {
    const store = await makeStorePath();
    const base = Date.now();

    syncAllCronJobsToDb([
      {
        id: "job-35195",
        name: "job-35195",
        enabled: true,
        createdAtMs: base,
        updatedAtMs: base,
        schedule: { kind: "every", everyMs: 60_000, anchorMs: base },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        payload: { kind: "systemEvent", text: "hello" },
        state: {},
      },
    ]);

    const service = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" as const })),
    });

    await service.start();

    await service.update("job-35195", {
      payload: { kind: "systemEvent", text: "edited" },
    });

    service.stop();

    const service2 = new CronService({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn(async () => ({ status: "ok" as const })),
    });

    await service2.start();

    const jobs = await service2.list({ includeDisabled: true });
    const job = jobs.find((j) => j.id === "job-35195");
    expect(job).toBeDefined();
    expect(job?.payload).toEqual(expect.objectContaining({ kind: "systemEvent", text: "edited" }));

    service2.stop();
    await store.cleanup();
  });
});
