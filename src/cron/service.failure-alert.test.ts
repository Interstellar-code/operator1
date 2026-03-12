import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCronTestDb } from "../infra/state-db/test-helpers.cron.js";
import { CronService } from "./service.js";

type CronServiceParams = ConstructorParameters<typeof CronService>[0];

const noopLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

function createFailureAlertCron(params: {
  storePath: string;
  cronConfig?: CronServiceParams["cronConfig"];
  runIsolatedAgentJob: NonNullable<CronServiceParams["runIsolatedAgentJob"]>;
  sendCronFailureAlert: NonNullable<CronServiceParams["sendCronFailureAlert"]>;
}) {
  return new CronService({
    storePath: params.storePath,
    cronEnabled: true,
    cronConfig: params.cronConfig,
    log: noopLogger,
    enqueueSystemEvent: vi.fn(),
    requestHeartbeatNow: vi.fn(),
    runIsolatedAgentJob: params.runIsolatedAgentJob,
    sendCronFailureAlert: params.sendCronFailureAlert,
  });
}

describe("CronService failure alerts", () => {
  useCronTestDb();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    noopLogger.debug.mockClear();
    noopLogger.info.mockClear();
    noopLogger.warn.mockClear();
    noopLogger.error.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("alerts after configured consecutive failures and honors cooldown", async () => {
    const storePath = "/mock/cron/failure-alert.json";
    const sendCronFailureAlert = vi.fn(async () => undefined);
    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "error" as const,
      error: "wrong model id",
    }));

    const cron = createFailureAlertCron({
      storePath,
      cronConfig: {
        failureAlert: {
          enabled: true,
          after: 2,
          cooldownMs: 60_000,
        },
      },
      runIsolatedAgentJob,
      sendCronFailureAlert,
    });

    await cron.start();
    const job = await cron.add({
      name: "daily report",
      enabled: true,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "run report" },
      delivery: { mode: "announce", channel: "telegram", to: "19098680" },
    });

    await cron.run(job.id, "force");
    expect(sendCronFailureAlert).not.toHaveBeenCalled();

    await cron.run(job.id, "force");
    expect(sendCronFailureAlert).toHaveBeenCalledTimes(1);
    expect(sendCronFailureAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        job: expect.objectContaining({ id: job.id }),
        channel: "telegram",
        to: "19098680",
        text: expect.stringContaining('Cron job "daily report" failed 2 times'),
      }),
    );

    await cron.run(job.id, "force");
    expect(sendCronFailureAlert).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    await cron.run(job.id, "force");
    expect(sendCronFailureAlert).toHaveBeenCalledTimes(2);
    expect(sendCronFailureAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('Cron job "daily report" failed 4 times'),
      }),
    );

    cron.stop();
    // cleanup handled by useCronTestDb
  });

  it("supports per-job failure alert override when global alerts are disabled", async () => {
    const storePath = "/mock/cron/failure-alert.json";
    const sendCronFailureAlert = vi.fn(async () => undefined);
    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "error" as const,
      error: "timeout",
    }));

    const cron = createFailureAlertCron({
      storePath,
      cronConfig: {
        failureAlert: {
          enabled: false,
        },
      },
      runIsolatedAgentJob,
      sendCronFailureAlert,
    });

    await cron.start();
    const job = await cron.add({
      name: "job with override",
      enabled: true,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "run report" },
      failureAlert: {
        after: 1,
        channel: "telegram",
        to: "12345",
        cooldownMs: 1,
      },
    });

    await cron.run(job.id, "force");
    expect(sendCronFailureAlert).toHaveBeenCalledTimes(1);
    expect(sendCronFailureAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        channel: "telegram",
        to: "12345",
      }),
    );

    cron.stop();
    // cleanup handled by useCronTestDb
  });

  it("respects per-job failureAlert=false and suppresses alerts", async () => {
    const storePath = "/mock/cron/failure-alert.json";
    const sendCronFailureAlert = vi.fn(async () => undefined);
    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "error" as const,
      error: "auth error",
    }));

    const cron = createFailureAlertCron({
      storePath,
      cronConfig: {
        failureAlert: {
          enabled: true,
          after: 1,
        },
      },
      runIsolatedAgentJob,
      sendCronFailureAlert,
    });

    await cron.start();
    const job = await cron.add({
      name: "disabled alert job",
      enabled: true,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "run report" },
      failureAlert: false,
    });

    await cron.run(job.id, "force");
    await cron.run(job.id, "force");
    expect(sendCronFailureAlert).not.toHaveBeenCalled();

    cron.stop();
    // cleanup handled by useCronTestDb
  });

  it("threads failure alert mode/accountId and skips best-effort jobs", async () => {
    const storePath = "/mock/cron/failure-alert.json";
    const sendCronFailureAlert = vi.fn(async () => undefined);
    const runIsolatedAgentJob = vi.fn(async () => ({
      status: "error" as const,
      error: "temporary upstream error",
    }));

    const cron = createFailureAlertCron({
      storePath,
      cronConfig: {
        failureAlert: {
          enabled: true,
          after: 1,
          mode: "webhook",
          accountId: "global-account",
        },
      },
      runIsolatedAgentJob,
      sendCronFailureAlert,
    });

    await cron.start();
    const normalJob = await cron.add({
      name: "normal alert job",
      enabled: true,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "run report" },
      delivery: { mode: "announce", channel: "telegram", to: "19098680" },
    });
    const bestEffortJob = await cron.add({
      name: "best effort alert job",
      enabled: true,
      schedule: { kind: "every", everyMs: 60_000 },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "run report" },
      delivery: {
        mode: "announce",
        channel: "telegram",
        to: "19098680",
        bestEffort: true,
      },
    });

    await cron.run(normalJob.id, "force");
    expect(sendCronFailureAlert).toHaveBeenCalledTimes(1);
    expect(sendCronFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "webhook",
        accountId: "global-account",
        to: undefined,
      }),
    );

    await cron.run(bestEffortJob.id, "force");
    expect(sendCronFailureAlert).toHaveBeenCalledTimes(1);

    cron.stop();
    // cleanup handled by useCronTestDb
  });
});
