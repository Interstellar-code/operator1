import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { getPairingAdapter } from "../channels/plugins/pairing.js";
import type { ChannelId, ChannelPairingAdapter } from "../channels/plugins/types.js";
import { resolveOAuthDir, resolveStateDir } from "../config/paths.js";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { DEFAULT_ACCOUNT_ID } from "../routing/session-key.js";
import {
  addAllowlistEntryToDb,
  deleteExpiredPairingRequestsFromDb,
  loadAllowlistEntriesFromDb,
  loadPairingRequestsFromDb,
  removeAllowlistEntryFromDb,
  savePairingRequestsToDb,
  type PairingRequestRow,
} from "./pairing-store-sqlite.js";

const PAIRING_CODE_LENGTH = 8;
const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_PENDING_TTL_MS = 60 * 60 * 1000;
const PAIRING_PENDING_MAX = 3;

// Legacy allowFrom entries use empty string as account_id in the DB.
const LEGACY_ACCOUNT_ID = "";

export type PairingChannel = ChannelId;

export type PairingRequest = {
  id: string;
  code: string;
  createdAt: string;
  lastSeenAt: string;
  meta?: Record<string, string>;
};

function resolveCredentialsDir(env: NodeJS.ProcessEnv = process.env): string {
  const stateDir = resolveStateDir(env, () => resolveRequiredHomeDir(env, os.homedir));
  return resolveOAuthDir(env, stateDir);
}

/** Sanitize channel ID for use in filenames (prevent path traversal). */
function safeChannelKey(channel: PairingChannel): string {
  const raw = String(channel).trim().toLowerCase();
  if (!raw) {
    throw new Error("invalid pairing channel");
  }
  const safe = raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
  if (!safe || safe === "_") {
    throw new Error("invalid pairing channel");
  }
  return safe;
}

function safeAccountKey(accountId: string): string {
  const raw = String(accountId).trim().toLowerCase();
  if (!raw) {
    throw new Error("invalid pairing account id");
  }
  const safe = raw.replace(/[\\/:*?"<>|]/g, "_").replace(/\.\./g, "_");
  if (!safe || safe === "_") {
    throw new Error("invalid pairing account id");
  }
  return safe;
}

function resolveAllowFromPath(
  channel: PairingChannel,
  env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): string {
  const base = safeChannelKey(channel);
  const normalizedAccountId = typeof accountId === "string" ? accountId.trim() : "";
  if (!normalizedAccountId) {
    return path.join(resolveCredentialsDir(env), `${base}-allowFrom.json`);
  }
  return path.join(
    resolveCredentialsDir(env),
    `${base}-${safeAccountKey(normalizedAccountId)}-allowFrom.json`,
  );
}

/** Kept for migration reference. */
export function resolveChannelAllowFromPath(
  channel: PairingChannel,
  env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): string {
  return resolveAllowFromPath(channel, env, accountId);
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function resolveLastSeenAt(entry: PairingRequest): number {
  return parseTimestamp(entry.lastSeenAt) ?? parseTimestamp(entry.createdAt) ?? 0;
}

function pruneExcessRequests(reqs: PairingRequest[], maxPending: number) {
  if (maxPending <= 0 || reqs.length <= maxPending) {
    return { requests: reqs, removed: false };
  }
  const sorted = reqs.slice().toSorted((a, b) => resolveLastSeenAt(a) - resolveLastSeenAt(b));
  return { requests: sorted.slice(-maxPending), removed: true };
}

function randomCode(): string {
  let out = "";
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    const idx = crypto.randomInt(0, PAIRING_CODE_ALPHABET.length);
    out += PAIRING_CODE_ALPHABET[idx];
  }
  return out;
}

function generateUniqueCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = randomCode();
    if (!existing.has(code)) {
      return code;
    }
  }
  throw new Error("failed to generate unique pairing code");
}

function normalizePairingAccountId(accountId?: string): string {
  return accountId?.trim().toLowerCase() || "";
}

function requestMatchesAccountId(entry: PairingRequest, normalizedAccountId: string): boolean {
  if (!normalizedAccountId) {
    return true;
  }
  return (
    String(entry.meta?.accountId ?? "")
      .trim()
      .toLowerCase() === normalizedAccountId
  );
}

function shouldIncludeLegacyAllowFromEntries(normalizedAccountId: string): boolean {
  return !normalizedAccountId || normalizedAccountId === DEFAULT_ACCOUNT_ID;
}

function resolveAllowFromAccountId(accountId?: string): string {
  return normalizePairingAccountId(accountId) || DEFAULT_ACCOUNT_ID;
}

function normalizeId(value: string | number): string {
  return String(value).trim();
}

function normalizeAllowEntry(channel: PairingChannel, entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "*") {
    return "";
  }
  const adapter = getPairingAdapter(channel);
  const normalized = adapter?.normalizeAllowEntry ? adapter.normalizeAllowEntry(trimmed) : trimmed;
  return String(normalized).trim();
}

function normalizeAllowFromInput(channel: PairingChannel, entry: string | number): string {
  return normalizeAllowEntry(channel, normalizeId(entry));
}

function dedupePreserveOrder(entries: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    const normalized = String(entry).trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function rowToRequest(row: PairingRequestRow): PairingRequest {
  return {
    id: row.sender_id,
    code: row.code,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    meta: row.meta_json ? (JSON.parse(row.meta_json) as Record<string, string>) : undefined,
  };
}

function requestToRow(channel: string, accountId: string, req: PairingRequest): PairingRequestRow {
  return {
    channel,
    account_id: accountId,
    sender_id: req.id,
    code: req.code,
    created_at: req.createdAt,
    last_seen_at: req.lastSeenAt,
    meta_json: req.meta ? JSON.stringify(req.meta) : null,
  };
}

// ── AllowFrom reads ─────────────────────────────────────────────────────────

function readAllowFromEntries(channel: string, accountId: string): string[] {
  return loadAllowlistEntriesFromDb(safeChannelKey(channel), accountId);
}

export async function readLegacyChannelAllowFromStore(
  channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
): Promise<string[]> {
  return readAllowFromEntries(channel, LEGACY_ACCOUNT_ID);
}

export async function readChannelAllowFromStore(
  channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): Promise<string[]> {
  const resolvedAccountId = resolveAllowFromAccountId(accountId);

  if (!shouldIncludeLegacyAllowFromEntries(resolvedAccountId)) {
    return readAllowFromEntries(channel, resolvedAccountId);
  }
  const scopedEntries = readAllowFromEntries(channel, resolvedAccountId);
  const legacyEntries = readAllowFromEntries(channel, LEGACY_ACCOUNT_ID);
  return dedupePreserveOrder([...scopedEntries, ...legacyEntries]);
}

export function readLegacyChannelAllowFromStoreSync(
  channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
): string[] {
  return readAllowFromEntries(channel, LEGACY_ACCOUNT_ID);
}

export function readChannelAllowFromStoreSync(
  channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): string[] {
  const resolvedAccountId = resolveAllowFromAccountId(accountId);

  if (!shouldIncludeLegacyAllowFromEntries(resolvedAccountId)) {
    return readAllowFromEntries(channel, resolvedAccountId);
  }
  const scopedEntries = readAllowFromEntries(channel, resolvedAccountId);
  const legacyEntries = readAllowFromEntries(channel, LEGACY_ACCOUNT_ID);
  return dedupePreserveOrder([...scopedEntries, ...legacyEntries]);
}

/** No-op — kept for test compatibility; SQLite doesn't need file-stat caching. */
export function clearPairingAllowFromReadCacheForTest(): void {}

// ── AllowFrom mutations ─────────────────────────────────────────────────────

type AllowFromStoreEntryUpdateParams = {
  channel: PairingChannel;
  entry: string | number;
  accountId?: string;
  env?: NodeJS.ProcessEnv;
};

export async function addChannelAllowFromStoreEntry(
  params: AllowFromStoreEntryUpdateParams,
): Promise<{ changed: boolean; allowFrom: string[] }> {
  const normalized = normalizeAllowFromInput(params.channel, params.entry);
  if (!normalized) {
    const current = readAllowFromEntries(
      params.channel,
      resolveAllowFromAccountId(params.accountId),
    );
    return { changed: false, allowFrom: current };
  }
  const channelKey = safeChannelKey(params.channel);
  const accountId = resolveAllowFromAccountId(params.accountId);
  addAllowlistEntryToDb(channelKey, accountId, normalized);
  const allowFrom = loadAllowlistEntriesFromDb(channelKey, accountId);
  return { changed: true, allowFrom };
}

export async function removeChannelAllowFromStoreEntry(
  params: AllowFromStoreEntryUpdateParams,
): Promise<{ changed: boolean; allowFrom: string[] }> {
  const normalized = normalizeAllowFromInput(params.channel, params.entry);
  if (!normalized) {
    const current = readAllowFromEntries(
      params.channel,
      resolveAllowFromAccountId(params.accountId),
    );
    return { changed: false, allowFrom: current };
  }
  const channelKey = safeChannelKey(params.channel);
  const accountId = resolveAllowFromAccountId(params.accountId);
  const changed = removeAllowlistEntryFromDb(channelKey, accountId, normalized);
  const allowFrom = loadAllowlistEntriesFromDb(channelKey, accountId);
  return { changed, allowFrom };
}

// ── Pairing requests ────────────────────────────────────────────────────────

function pruneAndSaveRequests(channel: string, _reqs: PairingRequest[]): PairingRequest[] {
  const nowMs = Date.now();
  const channelKey = safeChannelKey(channel);

  // Prune expired
  const cutoffMs = nowMs - PAIRING_PENDING_TTL_MS;
  const cutoffIso = new Date(cutoffMs).toISOString();
  deleteExpiredPairingRequestsFromDb(channelKey, cutoffIso);

  // Reload after TTL prune
  const afterTtl = loadPairingRequestsFromDb(channelKey).map(rowToRequest);

  // Cap excess
  const { requests: capped, removed: cappedRemoved } = pruneExcessRequests(
    afterTtl,
    PAIRING_PENDING_MAX,
  );
  if (cappedRemoved) {
    savePairingRequestsToDb(
      channelKey,
      capped.map((r) => {
        const meta = r.meta ?? {};
        const accountId = String(meta.accountId ?? "").trim() || "";
        return requestToRow(channelKey, accountId, r);
      }),
    );
  }
  return capped;
}

export async function listChannelPairingRequests(
  channel: PairingChannel,
  _env: NodeJS.ProcessEnv = process.env,
  accountId?: string,
): Promise<PairingRequest[]> {
  const pruned = pruneAndSaveRequests(channel, []);
  const normalizedAccountId = normalizePairingAccountId(accountId);
  const filtered = normalizedAccountId
    ? pruned.filter((entry) => requestMatchesAccountId(entry, normalizedAccountId))
    : pruned;
  return filtered
    .filter(
      (r) =>
        r &&
        typeof r.id === "string" &&
        typeof r.code === "string" &&
        typeof r.createdAt === "string",
    )
    .slice()
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function upsertChannelPairingRequest(params: {
  channel: PairingChannel;
  id: string | number;
  accountId: string;
  meta?: Record<string, string | undefined | null>;
  env?: NodeJS.ProcessEnv;
  /** Extension channels can pass their adapter directly to bypass registry lookup. */
  pairingAdapter?: ChannelPairingAdapter;
}): Promise<{ code: string; created: boolean }> {
  const channelKey = safeChannelKey(params.channel);
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const id = normalizeId(params.id);
  const normalizedAccountId = normalizePairingAccountId(params.accountId) || DEFAULT_ACCOUNT_ID;
  const baseMeta =
    params.meta && typeof params.meta === "object"
      ? Object.fromEntries(
          Object.entries(params.meta)
            .map(([k, v]) => [k, String(v ?? "").trim()] as const)
            .filter(([_, v]) => Boolean(v)),
        )
      : undefined;
  const meta = { ...baseMeta, accountId: normalizedAccountId };

  // Prune expired
  const cutoffIso = new Date(nowMs - PAIRING_PENDING_TTL_MS).toISOString();
  deleteExpiredPairingRequestsFromDb(channelKey, cutoffIso);

  let reqs = loadPairingRequestsFromDb(channelKey).map(rowToRequest);
  const existingIdx = reqs.findIndex((r) => {
    if (r.id !== id) {
      return false;
    }
    return requestMatchesAccountId(r, normalizedAccountId);
  });
  const existingCodes = new Set(
    reqs.map((req) =>
      String(req.code ?? "")
        .trim()
        .toUpperCase(),
    ),
  );

  if (existingIdx >= 0) {
    const existing = reqs[existingIdx];
    const existingCode = existing && typeof existing.code === "string" ? existing.code.trim() : "";
    const code = existingCode || generateUniqueCode(existingCodes);
    const next: PairingRequest = {
      id,
      code,
      createdAt: existing?.createdAt ?? now,
      lastSeenAt: now,
      meta: meta ?? existing?.meta,
    };
    reqs[existingIdx] = next;
    const { requests: capped } = pruneExcessRequests(reqs, PAIRING_PENDING_MAX);
    savePairingRequestsToDb(
      channelKey,
      capped.map((r) => {
        const m = r.meta ?? {};
        const acct = String(m.accountId ?? "").trim() || "";
        return requestToRow(channelKey, acct, r);
      }),
    );
    return { code, created: false };
  }

  const { requests: capped } = pruneExcessRequests(reqs, PAIRING_PENDING_MAX);
  reqs = capped;
  if (PAIRING_PENDING_MAX > 0 && reqs.length >= PAIRING_PENDING_MAX) {
    return { code: "", created: false };
  }
  const code = generateUniqueCode(existingCodes);
  const next: PairingRequest = {
    id,
    code,
    createdAt: now,
    lastSeenAt: now,
    ...(meta ? { meta } : {}),
  };
  savePairingRequestsToDb(
    channelKey,
    [...reqs, next].map((r) => {
      const m = r.meta ?? {};
      const acct = String(m.accountId ?? "").trim() || "";
      return requestToRow(channelKey, acct, r);
    }),
  );
  return { code, created: true };
}

export async function approveChannelPairingCode(params: {
  channel: PairingChannel;
  code: string;
  accountId?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ id: string; entry?: PairingRequest } | null> {
  const code = params.code.trim().toUpperCase();
  if (!code) {
    return null;
  }

  const channelKey = safeChannelKey(params.channel);
  const nowMs = Date.now();

  // Prune expired
  const cutoffIso = new Date(nowMs - PAIRING_PENDING_TTL_MS).toISOString();
  deleteExpiredPairingRequestsFromDb(channelKey, cutoffIso);

  const reqs = loadPairingRequestsFromDb(channelKey).map(rowToRequest);
  const normalizedAccountId = normalizePairingAccountId(params.accountId);
  const idx = reqs.findIndex((r) => {
    if (String(r.code ?? "").toUpperCase() !== code) {
      return false;
    }
    return requestMatchesAccountId(r, normalizedAccountId);
  });
  if (idx < 0) {
    return null;
  }
  const entry = reqs[idx];
  if (!entry) {
    return null;
  }
  reqs.splice(idx, 1);
  savePairingRequestsToDb(
    channelKey,
    reqs.map((r) => {
      const m = r.meta ?? {};
      const acct = String(m.accountId ?? "").trim() || "";
      return requestToRow(channelKey, acct, r);
    }),
  );
  const entryAccountId = String(entry.meta?.accountId ?? "").trim() || undefined;
  await addChannelAllowFromStoreEntry({
    channel: params.channel,
    entry: entry.id,
    accountId: params.accountId?.trim() || entryAccountId,
  });
  return { id: entry.id, entry };
}
