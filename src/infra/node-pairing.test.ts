import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { requireNodeSqlite } from "../memory/sqlite.js";
import {
  approveNodePairing,
  getPairedNode,
  requestNodePairing,
  verifyNodeToken,
} from "./node-pairing.js";
import {
  resetNodePairingDbForTest,
  setNodePairingDbForTest,
} from "./state-db/node-pairing-sqlite.js";
import { runMigrations } from "./state-db/schema.js";

describe("node pairing tokens", () => {
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

  async function setupPairedNode(): Promise<string> {
    const request = await requestNodePairing({
      nodeId: "node-1",
      platform: "darwin",
      commands: ["system.run"],
    });
    await approveNodePairing(request.request.requestId);
    const paired = await getPairedNode("node-1");
    expect(paired).not.toBeNull();
    if (!paired) {
      throw new Error("expected node to be paired");
    }
    return paired.token;
  }

  test("reuses existing pending requests for the same node", async () => {
    const first = await requestNodePairing({
      nodeId: "node-1",
      platform: "darwin",
    });
    const second = await requestNodePairing({
      nodeId: "node-1",
      platform: "darwin",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.request.requestId).toBe(first.request.requestId);
  });

  test("generates base64url node tokens with 256-bit entropy output length", async () => {
    const token = await setupPairedNode();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  test("verifies token and rejects mismatches", async () => {
    const token = await setupPairedNode();
    await expect(verifyNodeToken("node-1", token)).resolves.toEqual({
      ok: true,
      node: expect.objectContaining({ nodeId: "node-1" }),
    });
    await expect(verifyNodeToken("node-1", "x".repeat(token.length))).resolves.toEqual({
      ok: false,
    });
  });

  test("treats multibyte same-length token input as mismatch without throwing", async () => {
    const token = await setupPairedNode();
    const multibyteToken = "é".repeat(token.length);
    expect(Buffer.from(multibyteToken).length).not.toBe(Buffer.from(token).length);

    await expect(verifyNodeToken("node-1", multibyteToken)).resolves.toEqual({
      ok: false,
    });
  });
});
