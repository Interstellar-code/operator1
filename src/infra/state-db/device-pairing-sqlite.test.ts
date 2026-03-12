import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import type { DevicePairingPendingRequest, PairedDevice } from "../device-pairing.js";
import {
  deletePairedDeviceFromDb,
  deletePendingDevicePairingFromDb,
  getPairedDeviceFromDb,
  getPairedDevicesFromDb,
  getPendingDevicePairingByDeviceIdFromDb,
  getPendingDevicePairingFromDb,
  getPendingDevicePairingsFromDb,
  resetDevicePairingDbForTest,
  setDevicePairingDbForTest,
  upsertPairedDeviceInDb,
  upsertPendingDevicePairingInDb,
} from "./device-pairing-sqlite.js";
import { runMigrations } from "./schema.js";

describe("device-pairing-sqlite", () => {
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setDevicePairingDbForTest(db);
  });

  afterEach(() => {
    resetDevicePairingDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  const pending1: DevicePairingPendingRequest = {
    requestId: "req-1",
    deviceId: "dev-abc",
    publicKey: "pk-abc",
    displayName: "My Phone",
    platform: "ios",
    role: "operator.write",
    scopes: ["operator.read", "operator.write"],
    ts: Date.now(),
  };

  const paired1: PairedDevice = {
    deviceId: "dev-abc",
    publicKey: "pk-abc",
    displayName: "My Phone",
    platform: "ios",
    role: "operator.write",
    scopes: ["operator.read", "operator.write"],
    approvedScopes: ["operator.read", "operator.write"],
    tokens: {
      "operator.write": {
        token: "tok-1",
        role: "operator.write",
        scopes: ["operator.read", "operator.write"],
        createdAtMs: Date.now(),
      },
    },
    createdAtMs: Date.now(),
    approvedAtMs: Date.now(),
  };

  // ── Pending ────────────────────────────────────────────────────────────────

  it("inserts and retrieves a pending request by requestId", () => {
    upsertPendingDevicePairingInDb(pending1);
    const got = getPendingDevicePairingFromDb("req-1");
    expect(got?.requestId).toBe("req-1");
    expect(got?.deviceId).toBe("dev-abc");
    expect(got?.platform).toBe("ios");
    expect(got?.scopes).toEqual(["operator.read", "operator.write"]);
  });

  it("retrieves a pending request by deviceId", () => {
    upsertPendingDevicePairingInDb(pending1);
    const got = getPendingDevicePairingByDeviceIdFromDb("dev-abc");
    expect(got?.requestId).toBe("req-1");
  });

  it("lists all pending requests", () => {
    const pending2: DevicePairingPendingRequest = {
      ...pending1,
      requestId: "req-2",
      deviceId: "dev-xyz",
    };
    upsertPendingDevicePairingInDb(pending1);
    upsertPendingDevicePairingInDb(pending2);
    const all = getPendingDevicePairingsFromDb();
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.requestId)).toContain("req-1");
    expect(all.map((r) => r.requestId)).toContain("req-2");
  });

  it("updates a pending request on conflict", () => {
    upsertPendingDevicePairingInDb(pending1);
    const updated = { ...pending1, displayName: "Updated Phone" };
    upsertPendingDevicePairingInDb(updated);
    const got = getPendingDevicePairingFromDb("req-1");
    expect(got?.displayName).toBe("Updated Phone");
    expect(getPendingDevicePairingsFromDb()).toHaveLength(1);
  });

  it("deletes a pending request", () => {
    upsertPendingDevicePairingInDb(pending1);
    const deleted = deletePendingDevicePairingFromDb("req-1");
    expect(deleted).toBe(true);
    expect(getPendingDevicePairingFromDb("req-1")).toBeNull();
  });

  it("returns false when deleting non-existent pending request", () => {
    expect(deletePendingDevicePairingFromDb("no-such")).toBe(false);
  });

  it("returns null for missing pending request", () => {
    expect(getPendingDevicePairingFromDb("missing")).toBeNull();
    expect(getPendingDevicePairingByDeviceIdFromDb("missing")).toBeNull();
  });

  // ── Paired ─────────────────────────────────────────────────────────────────

  it("inserts and retrieves a paired device", () => {
    upsertPairedDeviceInDb(paired1);
    const got = getPairedDeviceFromDb("dev-abc");
    expect(got?.deviceId).toBe("dev-abc");
    expect(got?.tokens?.["operator.write"]?.token).toBe("tok-1");
    expect(got?.approvedScopes).toEqual(["operator.read", "operator.write"]);
  });

  it("lists all paired devices", () => {
    const paired2: PairedDevice = { ...paired1, deviceId: "dev-xyz", publicKey: "pk-xyz" };
    upsertPairedDeviceInDb(paired1);
    upsertPairedDeviceInDb(paired2);
    const all = getPairedDevicesFromDb();
    expect(all).toHaveLength(2);
    expect(all.map((d) => d.deviceId)).toContain("dev-abc");
    expect(all.map((d) => d.deviceId)).toContain("dev-xyz");
  });

  it("updates a paired device on conflict", () => {
    upsertPairedDeviceInDb(paired1);
    const updated: PairedDevice = { ...paired1, displayName: "Renamed Phone" };
    upsertPairedDeviceInDb(updated);
    const got = getPairedDeviceFromDb("dev-abc");
    expect(got?.displayName).toBe("Renamed Phone");
    expect(getPairedDevicesFromDb()).toHaveLength(1);
  });

  it("deletes a paired device", () => {
    upsertPairedDeviceInDb(paired1);
    const deleted = deletePairedDeviceFromDb("dev-abc");
    expect(deleted).toBe(true);
    expect(getPairedDeviceFromDb("dev-abc")).toBeNull();
  });

  it("returns false when deleting non-existent paired device", () => {
    expect(deletePairedDeviceFromDb("no-such")).toBe(false);
  });

  it("returns null for missing paired device", () => {
    expect(getPairedDeviceFromDb("missing")).toBeNull();
  });

  it("returns empty arrays when tables are empty", () => {
    expect(getPendingDevicePairingsFromDb()).toEqual([]);
    expect(getPairedDevicesFromDb()).toEqual([]);
  });
});
