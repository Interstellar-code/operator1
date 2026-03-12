import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireNodeSqlite } from "../../memory/sqlite.js";
import type { NodePairingPairedNode, NodePairingPendingRequest } from "../node-pairing.js";
import {
  deletePairedNodeFromDb,
  deletePendingNodePairingFromDb,
  getPairedNodeFromDb,
  getPairedNodesFromDb,
  getPendingNodePairingByNodeIdFromDb,
  getPendingNodePairingFromDb,
  getPendingNodePairingsFromDb,
  resetNodePairingDbForTest,
  setNodePairingDbForTest,
  upsertPairedNodeInDb,
  upsertPendingNodePairingInDb,
} from "./node-pairing-sqlite.js";
import { runMigrations } from "./schema.js";

describe("node-pairing-sqlite", () => {
  let db: ReturnType<typeof requireNodeSqlite>["DatabaseSync"]["prototype"];

  beforeEach(() => {
    const { DatabaseSync } = requireNodeSqlite();
    db = new DatabaseSync(":memory:");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    setNodePairingDbForTest(db);
  });

  afterEach(() => {
    resetNodePairingDbForTest();
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  const pending1: NodePairingPendingRequest = {
    requestId: "req-n1",
    nodeId: "node-abc",
    displayName: "Gateway Node",
    platform: "linux",
    version: "2026.3.1",
    caps: ["tools", "memory"],
    ts: Date.now(),
  };

  const paired1: NodePairingPairedNode = {
    nodeId: "node-abc",
    token: "node-tok-1",
    displayName: "Gateway Node",
    platform: "linux",
    version: "2026.3.1",
    caps: ["tools", "memory"],
    createdAtMs: Date.now(),
    approvedAtMs: Date.now(),
  };

  // ── Pending ────────────────────────────────────────────────────────────────

  it("inserts and retrieves a pending request by requestId", () => {
    upsertPendingNodePairingInDb(pending1);
    const got = getPendingNodePairingFromDb("req-n1");
    expect(got?.requestId).toBe("req-n1");
    expect(got?.nodeId).toBe("node-abc");
    expect(got?.caps).toEqual(["tools", "memory"]);
  });

  it("retrieves a pending request by nodeId", () => {
    upsertPendingNodePairingInDb(pending1);
    const got = getPendingNodePairingByNodeIdFromDb("node-abc");
    expect(got?.requestId).toBe("req-n1");
  });

  it("lists all pending requests", () => {
    const pending2: NodePairingPendingRequest = {
      ...pending1,
      requestId: "req-n2",
      nodeId: "node-xyz",
    };
    upsertPendingNodePairingInDb(pending1);
    upsertPendingNodePairingInDb(pending2);
    const all = getPendingNodePairingsFromDb();
    expect(all).toHaveLength(2);
  });

  it("updates a pending request on conflict", () => {
    upsertPendingNodePairingInDb(pending1);
    const updated = { ...pending1, displayName: "Renamed Node" };
    upsertPendingNodePairingInDb(updated);
    const got = getPendingNodePairingFromDb("req-n1");
    expect(got?.displayName).toBe("Renamed Node");
    expect(getPendingNodePairingsFromDb()).toHaveLength(1);
  });

  it("deletes a pending request", () => {
    upsertPendingNodePairingInDb(pending1);
    const deleted = deletePendingNodePairingFromDb("req-n1");
    expect(deleted).toBe(true);
    expect(getPendingNodePairingFromDb("req-n1")).toBeNull();
  });

  it("returns false when deleting non-existent pending request", () => {
    expect(deletePendingNodePairingFromDb("no-such")).toBe(false);
  });

  it("returns null for missing pending request", () => {
    expect(getPendingNodePairingFromDb("missing")).toBeNull();
    expect(getPendingNodePairingByNodeIdFromDb("missing")).toBeNull();
  });

  // ── Paired ─────────────────────────────────────────────────────────────────

  it("inserts and retrieves a paired node", () => {
    upsertPairedNodeInDb(paired1);
    const got = getPairedNodeFromDb("node-abc");
    expect(got?.nodeId).toBe("node-abc");
    expect(got?.token).toBe("node-tok-1");
    expect(got?.caps).toEqual(["tools", "memory"]);
  });

  it("lists all paired nodes", () => {
    const paired2: NodePairingPairedNode = {
      ...paired1,
      nodeId: "node-xyz",
      token: "node-tok-2",
    };
    upsertPairedNodeInDb(paired1);
    upsertPairedNodeInDb(paired2);
    const all = getPairedNodesFromDb();
    expect(all).toHaveLength(2);
    expect(all.map((n) => n.nodeId)).toContain("node-abc");
    expect(all.map((n) => n.nodeId)).toContain("node-xyz");
  });

  it("updates a paired node on conflict", () => {
    upsertPairedNodeInDb(paired1);
    const updated: NodePairingPairedNode = { ...paired1, displayName: "Updated Node" };
    upsertPairedNodeInDb(updated);
    const got = getPairedNodeFromDb("node-abc");
    expect(got?.displayName).toBe("Updated Node");
    expect(getPairedNodesFromDb()).toHaveLength(1);
  });

  it("deletes a paired node", () => {
    upsertPairedNodeInDb(paired1);
    const deleted = deletePairedNodeFromDb("node-abc");
    expect(deleted).toBe(true);
    expect(getPairedNodeFromDb("node-abc")).toBeNull();
  });

  it("returns false when deleting non-existent paired node", () => {
    expect(deletePairedNodeFromDb("no-such")).toBe(false);
  });

  it("returns null for missing paired node", () => {
    expect(getPairedNodeFromDb("missing")).toBeNull();
  });

  it("returns empty arrays when tables are empty", () => {
    expect(getPendingNodePairingsFromDb()).toEqual([]);
    expect(getPairedNodesFromDb()).toEqual([]);
  });
});
