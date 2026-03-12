import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ACCOUNT_ID } from "../routing/session-key.js";
import { saveAllowlistEntriesToDb } from "./pairing-store-sqlite.js";
import {
  addChannelAllowFromStoreEntry,
  approveChannelPairingCode,
  listChannelPairingRequests,
  readChannelAllowFromStore,
  readLegacyChannelAllowFromStore,
  readLegacyChannelAllowFromStoreSync,
  readChannelAllowFromStoreSync,
  removeChannelAllowFromStoreEntry,
  upsertChannelPairingRequest,
} from "./pairing-store.js";
import { usePairingStoreTestDb } from "./test-helpers.pairing-store.js";

describe("pairing store", () => {
  usePairingStoreTestDb();

  it("reuses pending code and reports created=false", async () => {
    const first = await upsertChannelPairingRequest({
      channel: "discord",
      id: "u1",
      accountId: DEFAULT_ACCOUNT_ID,
    });
    const second = await upsertChannelPairingRequest({
      channel: "discord",
      id: "u1",
      accountId: DEFAULT_ACCOUNT_ID,
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.code).toBe(first.code);

    const list = await listChannelPairingRequests("discord");
    expect(list).toHaveLength(1);
    expect(list[0]?.code).toBe(first.code);
  });

  it("expires pending requests after TTL", async () => {
    const created = await upsertChannelPairingRequest({
      channel: "signal",
      id: "+15550001111",
      accountId: DEFAULT_ACCOUNT_ID,
    });
    expect(created.created).toBe(true);

    // Manually backdate the request in the DB to simulate expiry
    const expiredAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    // Use the SQLite adapter's resolveDb which already points to the test DB
    const { loadPairingRequestsFromDb, savePairingRequestsToDb } =
      await import("./pairing-store-sqlite.js");
    const rows = loadPairingRequestsFromDb("signal");
    const backdated = rows.map((r) => ({ ...r, created_at: expiredAt, last_seen_at: expiredAt }));
    savePairingRequestsToDb("signal", backdated);

    const list = await listChannelPairingRequests("signal");
    expect(list).toHaveLength(0);

    const next = await upsertChannelPairingRequest({
      channel: "signal",
      id: "+15550001111",
      accountId: DEFAULT_ACCOUNT_ID,
    });
    expect(next.created).toBe(true);
  });

  it("regenerates when a generated code collides", async () => {
    const spy = vi.spyOn(crypto, "randomInt") as unknown as {
      mockReturnValue: (value: number) => void;
      mockImplementation: (fn: () => number) => void;
      mockRestore: () => void;
    };
    try {
      spy.mockReturnValue(0);
      const first = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "123",
        accountId: DEFAULT_ACCOUNT_ID,
      });
      expect(first.code).toBe("AAAAAAAA");

      const sequence = Array(8).fill(0).concat(Array(8).fill(1));
      let idx = 0;
      spy.mockImplementation(() => sequence[idx++] ?? 1);
      const second = await upsertChannelPairingRequest({
        channel: "telegram",
        id: "456",
        accountId: DEFAULT_ACCOUNT_ID,
      });
      expect(second.code).toBe("BBBBBBBB");
    } finally {
      spy.mockRestore();
    }
  });

  it("caps pending requests at the default limit", async () => {
    const ids = ["+15550000001", "+15550000002", "+15550000003"];
    for (const id of ids) {
      const created = await upsertChannelPairingRequest({
        channel: "whatsapp",
        id,
        accountId: DEFAULT_ACCOUNT_ID,
      });
      expect(created.created).toBe(true);
    }

    const blocked = await upsertChannelPairingRequest({
      channel: "whatsapp",
      id: "+15550000004",
      accountId: DEFAULT_ACCOUNT_ID,
    });
    expect(blocked.created).toBe(false);

    const list = await listChannelPairingRequests("whatsapp");
    const listIds = list.map((entry) => entry.id);
    expect(listIds).toHaveLength(3);
    expect(listIds).toContain("+15550000001");
    expect(listIds).toContain("+15550000002");
    expect(listIds).toContain("+15550000003");
    expect(listIds).not.toContain("+15550000004");
  });

  it("stores allowFrom entries per account when accountId is provided", async () => {
    await addChannelAllowFromStoreEntry({
      channel: "telegram",
      accountId: "yy",
      entry: "12345",
    });

    const accountScoped = await readChannelAllowFromStore("telegram", process.env, "yy");
    const channelScoped = await readLegacyChannelAllowFromStore("telegram");
    expect(accountScoped).toContain("12345");
    expect(channelScoped).not.toContain("12345");
  });

  it("approves pairing codes into account-scoped allowFrom via pairing metadata", async () => {
    const created = await upsertChannelPairingRequest({
      channel: "telegram",
      accountId: "yy",
      id: "12345",
    });
    expect(created.created).toBe(true);

    const approved = await approveChannelPairingCode({
      channel: "telegram",
      code: created.code,
    });
    expect(approved?.id).toBe("12345");

    const accountScoped = await readChannelAllowFromStore("telegram", process.env, "yy");
    const channelScoped = await readLegacyChannelAllowFromStore("telegram");
    expect(accountScoped).toContain("12345");
    expect(channelScoped).not.toContain("12345");
  });

  it("filters approvals by account id and ignores blank approval codes", async () => {
    const created = await upsertChannelPairingRequest({
      channel: "telegram",
      accountId: "yy",
      id: "12345",
    });
    expect(created.created).toBe(true);

    const blank = await approveChannelPairingCode({
      channel: "telegram",
      code: "   ",
    });
    expect(blank).toBeNull();

    const mismatched = await approveChannelPairingCode({
      channel: "telegram",
      code: created.code,
      accountId: "zz",
    });
    expect(mismatched).toBeNull();

    const pending = await listChannelPairingRequests("telegram");
    expect(pending).toHaveLength(1);
    expect(pending[0]?.id).toBe("12345");
  });

  it("removes account-scoped allowFrom entries idempotently", async () => {
    await addChannelAllowFromStoreEntry({
      channel: "telegram",
      accountId: "yy",
      entry: "12345",
    });

    const removed = await removeChannelAllowFromStoreEntry({
      channel: "telegram",
      accountId: "yy",
      entry: "12345",
    });
    expect(removed.changed).toBe(true);
    expect(removed.allowFrom).toEqual([]);

    const removedAgain = await removeChannelAllowFromStoreEntry({
      channel: "telegram",
      accountId: "yy",
      entry: "12345",
    });
    expect(removedAgain.changed).toBe(false);
    expect(removedAgain.allowFrom).toEqual([]);
  });

  it("reads sync allowFrom with account-scoped isolation and wildcard filtering", () => {
    // Legacy (unscoped) entries
    saveAllowlistEntriesToDb("telegram", "", ["1001"]);
    // Account-scoped entries
    saveAllowlistEntriesToDb("telegram", "yy", ["1002", "1001"]);

    const scoped = readChannelAllowFromStoreSync("telegram", process.env, "yy");
    const channelScoped = readLegacyChannelAllowFromStoreSync("telegram");
    expect(scoped.slice().toSorted()).toEqual(["1001", "1002"]);
    expect(channelScoped).toEqual(["1001"]);
  });

  it("does not read legacy channel-scoped allowFrom for non-default account ids", () => {
    saveAllowlistEntriesToDb("telegram", "", ["1001", "1002"]);
    saveAllowlistEntriesToDb("telegram", "yy", ["1003"]);

    const asyncScoped = readChannelAllowFromStoreSync("telegram", process.env, "yy");
    expect(asyncScoped).toEqual(["1003"]);
  });

  it("does not fall back to legacy allowFrom when scoped file exists but is empty", () => {
    saveAllowlistEntriesToDb("telegram", "", ["1001"]);
    saveAllowlistEntriesToDb("telegram", "yy", []);

    const scoped = readChannelAllowFromStoreSync("telegram", process.env, "yy");
    expect(scoped).toEqual([]);
  });

  it("does not reuse pairing requests across accounts for the same sender id", async () => {
    const first = await upsertChannelPairingRequest({
      channel: "telegram",
      accountId: "alpha",
      id: "12345",
    });
    const second = await upsertChannelPairingRequest({
      channel: "telegram",
      accountId: "beta",
      id: "12345",
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
    expect(second.code).not.toBe(first.code);

    const alpha = await listChannelPairingRequests("telegram", process.env, "alpha");
    const beta = await listChannelPairingRequests("telegram", process.env, "beta");
    expect(alpha).toHaveLength(1);
    expect(beta).toHaveLength(1);
    expect(alpha[0]?.code).toBe(first.code);
    expect(beta[0]?.code).toBe(second.code);
  });

  it("reads legacy channel-scoped allowFrom for default account", async () => {
    saveAllowlistEntriesToDb("telegram", "", ["1001"]);
    saveAllowlistEntriesToDb("telegram", "default", ["1002"]);

    const scoped = await readChannelAllowFromStore("telegram", process.env, DEFAULT_ACCOUNT_ID);
    expect(scoped).toEqual(["1002", "1001"]);
  });

  it("uses default-account allowFrom when account id is omitted", async () => {
    saveAllowlistEntriesToDb("telegram", "", ["1001"]);
    saveAllowlistEntriesToDb("telegram", DEFAULT_ACCOUNT_ID, ["1002"]);

    const asyncScoped = await readChannelAllowFromStore("telegram", process.env);
    const syncScoped = readChannelAllowFromStoreSync("telegram", process.env);
    expect(asyncScoped).toEqual(["1002", "1001"]);
    expect(syncScoped).toEqual(["1002", "1001"]);
  });
});
