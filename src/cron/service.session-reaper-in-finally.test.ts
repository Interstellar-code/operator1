import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractAgentIdFromStorePath,
  saveSessionEntriesToDb,
} from "../config/sessions/store-sqlite.js";
import { loadSessionStore } from "../config/sessions/store.js";
import { useSessionStoreTestDb } from "../config/sessions/test-helpers.sqlite.js";
import type { SessionEntry } from "../config/sessions/types.js";
import { syncAllCronJobsToDb } from "../infra/state-db/cron-sqlite.js";
import { createNoopLogger, createCronStoreHarness } from "./service.test-harness.js";
import { createCronServiceState } from "./service/state.js";
import { onTimer } from "./service/timer.js";
import { resetReaperThrottle } from "./session-reaper.js";
import type { CronJob } from "./types.js";

const noopLogger = createNoopLogger();
const { makeStorePath } = createCronStoreHarness({
  prefix: "openclaw-cron-reaper-finally-",
});

function createDueIsolatedJob(params: { id: string; nowMs: number }): CronJob {
  return {
    id: params.id,
    name: params.id,
    enabled: true,
    deleteAfterRun: false,
    createdAtMs: params.nowMs,
    updatedAtMs: params.nowMs,
    schedule: { kind: "every", everyMs: 60_000 },
    sessionTarget: "isolated",
    wakeMode: "next-heartbeat",
    payload: { kind: "agentTurn", message: "test" },
    delivery: { mode: "none" },
    state: { nextRunAtMs: params.nowMs },
  };
}

describe("CronService - session reaper runs in finally block (#31946)", () => {
  useSessionStoreTestDb();

  beforeEach(() => {
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
    resetReaperThrottle();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("session reaper runs even when job execution throws", async () => {
    const store = await makeStorePath();
    const now = Date.parse("2026-02-10T10:00:00.000Z");

    syncAllCronJobsToDb([createDueIsolatedJob({ id: "failing-job", nowMs: now })]);

    const sessionStorePath = path.join(path.dirname(store.storePath), "sessions", "sessions.json");

    const state = createCronServiceState({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      nowMs: () => now,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      // This will throw, simulating a failure during job execution.
      runIsolatedAgentJob: vi.fn().mockRejectedValue(new Error("gateway down")),
      sessionStorePath,
    });

    await onTimer(state);

    // After onTimer finishes (even with a job error), state.running must be
    // false — proving the finally block executed.
    expect(state.running).toBe(false);

    // The timer must be re-armed.
    expect(state.timer).not.toBeNull();
  });

  it("session reaper runs when resolveSessionStorePath is provided", async () => {
    const store = await makeStorePath();
    const now = Date.parse("2026-02-10T10:00:00.000Z");

    syncAllCronJobsToDb([createDueIsolatedJob({ id: "ok-job", nowMs: now })]);

    const resolvedPaths: string[] = [];
    const state = createCronServiceState({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      nowMs: () => now,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn().mockResolvedValue({ status: "ok", summary: "done" }),
      resolveSessionStorePath: (agentId) => {
        const p = path.join(path.dirname(store.storePath), `${agentId}-sessions`, "sessions.json");
        resolvedPaths.push(p);
        return p;
      },
    });

    await onTimer(state);

    // The resolveSessionStorePath callback should have been invoked to build
    // the set of store paths for the session reaper.
    expect(resolvedPaths.length).toBeGreaterThan(0);
    expect(state.running).toBe(false);
  });

  it("prunes expired cron-run sessions via reaper in finally block", async () => {
    const store = await makeStorePath();
    const now = Date.parse("2026-02-10T10:00:00.000Z");
    const sessionStorePath = path.join(path.dirname(store.storePath), "sessions", "sessions.json");

    // Seed a due job so onTimer has work to do.
    syncAllCronJobsToDb([createDueIsolatedJob({ id: "reaper-job", nowMs: now })]);

    // Seed an expired cron-run session entry that should be pruned by the reaper.
    saveSessionEntriesToDb(extractAgentIdFromStorePath(sessionStorePath), {
      "agent:agent-default:cron:failing-job:run:stale": {
        sessionId: "session-stale",
        updatedAt: now - 3 * 24 * 3_600_000,
      } as SessionEntry,
    });

    const state = createCronServiceState({
      storePath: store.storePath,
      cronEnabled: true,
      log: noopLogger,
      nowMs: () => now,
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn().mockResolvedValue({ status: "ok", summary: "done" }),
      sessionStorePath,
    });

    await onTimer(state);

    const updatedSessionStore = loadSessionStore(sessionStorePath);
    expect(updatedSessionStore).toEqual({});
    expect(state.running).toBe(false);
  });
});
