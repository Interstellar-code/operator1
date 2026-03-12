import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCronTestDb } from "../infra/state-db/test-helpers.cron.js";
import { loadCronStore, resolveCronStorePath, saveCronStore } from "./store.js";
import type { CronStoreFile } from "./types.js";

function makeStore(jobId: string, enabled: boolean): CronStoreFile {
  const now = Date.now();
  return {
    version: 1,
    jobs: [
      {
        id: jobId,
        name: `Job ${jobId}`,
        enabled,
        createdAtMs: now,
        updatedAtMs: now,
        schedule: { kind: "every", everyMs: 60_000 },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        payload: { kind: "systemEvent", text: `tick-${jobId}` },
        state: {},
      },
    ],
  };
}

describe("resolveCronStorePath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses OPENCLAW_HOME for tilde expansion", () => {
    vi.stubEnv("OPENCLAW_HOME", "/srv/openclaw-home");
    vi.stubEnv("HOME", "/home/other");

    const result = resolveCronStorePath("~/cron/jobs.json");
    expect(result).toBe(path.resolve("/srv/openclaw-home", "cron", "jobs.json"));
  });
});

describe("cron store (SQLite)", () => {
  useCronTestDb();

  it("returns empty store when no jobs exist", async () => {
    const loaded = await loadCronStore("/unused");
    expect(loaded).toEqual({ version: 1, jobs: [] });
  });

  it("persists and round-trips a store", async () => {
    const store = makeStore("job-1", true);
    await saveCronStore("/unused", store);
    const loaded = await loadCronStore("/unused");
    expect(loaded).toEqual(store);
  });

  it("replaces all jobs on save", async () => {
    const first = makeStore("job-1", true);
    const second = makeStore("job-2", false);

    await saveCronStore("/unused", first);
    await saveCronStore("/unused", second);

    const loaded = await loadCronStore("/unused");
    expect(loaded.jobs).toHaveLength(1);
    expect(loaded.jobs[0]?.id).toBe("job-2");
  });

  it("handles saving an empty jobs list", async () => {
    const store = makeStore("job-1", true);
    await saveCronStore("/unused", store);
    await saveCronStore("/unused", { version: 1, jobs: [] });

    const loaded = await loadCronStore("/unused");
    expect(loaded.jobs).toHaveLength(0);
  });

  it("persists multiple jobs in a single save", async () => {
    const now = Date.now();
    const store: CronStoreFile = {
      version: 1,
      jobs: [
        {
          id: "a",
          name: "A",
          enabled: true,
          createdAtMs: now,
          updatedAtMs: now,
          schedule: { kind: "every", everyMs: 1000 },
          sessionTarget: "main",
          wakeMode: "next-heartbeat",
          payload: { kind: "systemEvent", text: "a" },
          state: {},
        },
        {
          id: "b",
          name: "B",
          enabled: false,
          createdAtMs: now,
          updatedAtMs: now,
          schedule: { kind: "every", everyMs: 2000 },
          sessionTarget: "main",
          wakeMode: "next-heartbeat",
          payload: { kind: "systemEvent", text: "b" },
          state: {},
        },
      ],
    };

    await saveCronStore("/unused", store);
    const loaded = await loadCronStore("/unused");
    expect(loaded.jobs).toHaveLength(2);
    expect(loaded.jobs[0]?.id).toBe("a");
    expect(loaded.jobs[1]?.id).toBe("b");
  });
});
