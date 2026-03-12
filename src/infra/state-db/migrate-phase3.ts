/**
 * One-shot migration: Phase 3 JSON files → SQLite.
 *
 * Covers: auth profiles, pairing requests, allowlists,
 * telegram thread bindings, discord thread bindings.
 *
 * Each migrator reads the JSON file, inserts rows, then deletes the file.
 * Safe to call multiple times (idempotent: files are removed after migration).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadAuthProfileStoreFromDb,
  saveAuthProfileStoreToDb,
} from "../../agents/auth-profiles/auth-profiles-sqlite.js";
import { saveThreadBindingToDb } from "../../channels/thread-bindings-sqlite.js";
import { resolveOAuthDir, resolveStateDir } from "../../config/paths.js";
import {
  addAllowlistEntryToDb,
  upsertPairingRequestInDb,
} from "../../pairing/pairing-store-sqlite.js";
import { loadJsonFile } from "../json-file.js";

/** Safely coerce an unknown JSON value to string (avoids no-base-to-string lint). */
function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return `${v}`;
  }
  return fallback;
}

type MigrationResult = {
  store: string;
  count: number;
  migrated: boolean;
  error?: string;
};

function resolveCredentialsDir(env: NodeJS.ProcessEnv): string {
  const stateDir = resolveStateDir(env, () => os.homedir());
  return resolveOAuthDir(env, stateDir);
}

function tryUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

// ── Auth Profiles ──────────────────────────────────────────────────────────

function migrateAuthProfiles(env: NodeJS.ProcessEnv): MigrationResult {
  const result: MigrationResult = { store: "auth-profiles", count: 0, migrated: false };
  const stateDir = resolveStateDir(env, () => os.homedir());
  const authPath = path.join(stateDir, "auth-profiles.json");
  const legacyPath = path.join(stateDir, "auth.json");

  try {
    // Skip if DB already has data
    const existing = loadAuthProfileStoreFromDb();
    if (existing && Object.keys(existing.profiles).length > 0) {
      tryUnlink(authPath);
      tryUnlink(legacyPath);
      return result;
    }

    // Try auth-profiles.json first
    if (fs.existsSync(authPath)) {
      const raw = loadJsonFile(authPath);
      if (raw && typeof raw === "object" && (raw as Record<string, unknown>).profiles) {
        const store = raw as Record<string, unknown>;
        saveAuthProfileStoreToDb(store);
        result.count = Object.keys((store.profiles as Record<string, unknown>) ?? {}).length;
        result.migrated = true;
        tryUnlink(authPath);
      }
    }

    // Also try legacy auth.json
    if (fs.existsSync(legacyPath) && !result.migrated) {
      const raw = loadJsonFile(legacyPath);
      if (raw && typeof raw === "object") {
        const record = raw as Record<string, unknown>;
        if (!("profiles" in record)) {
          const profiles: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(record)) {
            if (value && typeof value === "object") {
              profiles[`${key}:default`] = {
                ...(value as Record<string, unknown>),
                provider: key,
              };
            }
          }
          if (Object.keys(profiles).length > 0) {
            saveAuthProfileStoreToDb({ version: 1, profiles });
            result.count = Object.keys(profiles).length;
            result.migrated = true;
          }
        }
      }
      tryUnlink(legacyPath);
    }

    // Also check per-agent auth files
    const agentsDir = path.join(stateDir, "agents");
    if (fs.existsSync(agentsDir)) {
      try {
        for (const agentId of fs.readdirSync(agentsDir)) {
          const agentAuthPath = path.join(agentsDir, agentId, "agent", "auth-profiles.json");
          if (!fs.existsSync(agentAuthPath)) {
            continue;
          }
          const raw = loadJsonFile(agentAuthPath);
          if (raw && typeof raw === "object" && (raw as Record<string, unknown>).profiles) {
            const store = raw as Record<string, unknown>;
            const profiles = store.profiles as Record<string, unknown>;
            const current = loadAuthProfileStoreFromDb();
            const merged = { ...current?.profiles, ...profiles };
            saveAuthProfileStoreToDb({
              version: 1,
              profiles: merged,
              order: current?.order ?? (store.order as Record<string, string[]> | undefined),
              lastGood: current?.lastGood ?? (store.lastGood as Record<string, string> | undefined),
              usageStats:
                current?.usageStats ?? (store.usageStats as Record<string, unknown> | undefined),
            });
            result.count += Object.keys(profiles).length;
            result.migrated = true;
          }
          tryUnlink(agentAuthPath);
        }
      } catch {
        // ignore agent dir read errors
      }
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Pairing Requests ───────────────────────────────────────────────────────

function migratePairingRequests(env: NodeJS.ProcessEnv): MigrationResult {
  const result: MigrationResult = { store: "pairing-requests", count: 0, migrated: false };
  const credDir = resolveCredentialsDir(env);

  try {
    if (!fs.existsSync(credDir)) {
      return result;
    }

    const files = fs.readdirSync(credDir).filter((f) => f.endsWith("-pairing.json"));
    for (const file of files) {
      const filePath = path.join(credDir, file);
      const channelKey = file.replace(/-pairing\.json$/, "");
      const raw = loadJsonFile(filePath);
      if (!Array.isArray(raw)) {
        tryUnlink(filePath);
        continue;
      }
      for (const entry of raw) {
        if (!entry || typeof entry !== "object" || !entry.id || !entry.code) {
          continue;
        }
        upsertPairingRequestInDb({
          channel: channelKey,
          senderId: str(entry.id),
          code: str(entry.code),
          createdAt: str(entry.createdAt ?? entry.created_at, new Date().toISOString()),
          lastSeenAt: str(entry.lastSeenAt ?? entry.last_seen_at, new Date().toISOString()),
          accountId: str(entry.meta?.accountId ?? entry.accountId),
        });
        result.count++;
      }
      result.migrated = true;
      tryUnlink(filePath);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Allowlists ─────────────────────────────────────────────────────────────

function migrateAllowlists(env: NodeJS.ProcessEnv): MigrationResult {
  const result: MigrationResult = { store: "allowlists", count: 0, migrated: false };
  const credDir = resolveCredentialsDir(env);

  try {
    if (!fs.existsSync(credDir)) {
      return result;
    }

    const files = fs.readdirSync(credDir).filter((f) => f.endsWith("-allowFrom.json"));
    for (const file of files) {
      const filePath = path.join(credDir, file);
      // Parse: {channel}-allowFrom.json or {channel}-{accountId}-allowFrom.json
      const stem = file.replace(/-allowFrom\.json$/, "");
      const lastHyphen = stem.lastIndexOf("-");
      let channelKey: string;
      let accountId: string;
      // Channel keys use _ (via safeChannelKey), so hyphens indicate account segment
      if (lastHyphen <= 0) {
        channelKey = stem;
        accountId = "";
      } else {
        channelKey = stem.substring(0, lastHyphen);
        accountId = stem.substring(lastHyphen + 1);
      }

      const raw = loadJsonFile(filePath);
      if (!Array.isArray(raw)) {
        tryUnlink(filePath);
        continue;
      }
      for (const entry of raw) {
        if (typeof entry !== "string" || !entry.trim()) {
          continue;
        }
        addAllowlistEntryToDb(channelKey, accountId, entry.trim());
        result.count++;
      }
      result.migrated = true;
      tryUnlink(filePath);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Telegram Thread Bindings ───────────────────────────────────────────────

function migrateTelegramThreadBindings(env: NodeJS.ProcessEnv): MigrationResult {
  const result: MigrationResult = {
    store: "telegram-thread-bindings",
    count: 0,
    migrated: false,
  };
  const stateDir = resolveStateDir(env, () => os.homedir());
  const telegramDir = path.join(stateDir, "telegram");

  try {
    if (!fs.existsSync(telegramDir)) {
      return result;
    }

    const files = fs
      .readdirSync(telegramDir)
      .filter((f) => f.startsWith("thread-bindings-") && f.endsWith(".json"));

    for (const file of files) {
      const filePath = path.join(telegramDir, file);
      const accountId = file.replace(/^thread-bindings-/, "").replace(/\.json$/, "");
      const raw = loadJsonFile(filePath);
      if (!raw || typeof raw !== "object") {
        tryUnlink(filePath);
        continue;
      }

      const data = raw as Record<string, unknown>;
      const bindings = Array.isArray(data.bindings)
        ? data.bindings
        : typeof data.bindings === "object" && data.bindings
          ? Object.values(data.bindings as Record<string, unknown>)
          : [];

      for (const entry of bindings) {
        if (!entry || typeof entry !== "object") {
          continue;
        }
        const binding = entry as Record<string, unknown>;
        const conversationId = str(binding.conversationId).trim();
        const targetSessionKey = str(binding.targetSessionKey).trim();
        if (!conversationId || !targetSessionKey) {
          continue;
        }

        saveThreadBindingToDb({
          binding_key: `${accountId}:${conversationId}`,
          channel_type: "telegram",
          account_id: accountId,
          thread_id: conversationId,
          channel_id: null,
          target_kind: str(binding.targetKind, "acp"),
          target_session_key: targetSessionKey,
          agent_id: binding.agentId ? str(binding.agentId) : null,
          label: binding.label ? str(binding.label) : null,
          bound_by: binding.boundBy ? str(binding.boundBy) : null,
          bound_at: typeof binding.boundAt === "number" ? binding.boundAt : Date.now(),
          last_activity_at:
            typeof binding.lastActivityAt === "number" ? binding.lastActivityAt : Date.now(),
          idle_timeout_ms: typeof binding.idleTimeoutMs === "number" ? binding.idleTimeoutMs : null,
          max_age_ms: typeof binding.maxAgeMs === "number" ? binding.maxAgeMs : null,
          webhook_id: null,
          webhook_token: null,
          extra_json: null,
        });
        result.count++;
      }
      result.migrated = true;
      tryUnlink(filePath);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Discord Thread Bindings ────────────────────────────────────────────────

function migrateDiscordThreadBindings(env: NodeJS.ProcessEnv): MigrationResult {
  const result: MigrationResult = {
    store: "discord-thread-bindings",
    count: 0,
    migrated: false,
  };
  const stateDir = resolveStateDir(env, () => os.homedir());
  const filePath = path.join(stateDir, "discord", "thread-bindings.json");

  try {
    if (!fs.existsSync(filePath)) {
      return result;
    }

    const raw = loadJsonFile(filePath);
    if (!raw || typeof raw !== "object") {
      tryUnlink(filePath);
      return result;
    }

    const data = raw as Record<string, unknown>;
    const bindings =
      typeof data.bindings === "object" && data.bindings
        ? (data.bindings as Record<string, Record<string, unknown>>)
        : {};

    for (const [bindingKey, entry] of Object.entries(bindings)) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const threadId = str(entry.threadId).trim();
      const targetSessionKey = str(entry.targetSessionKey).trim();
      if (!threadId || !targetSessionKey) {
        continue;
      }

      const accountId = str(entry.accountId, "default");
      const boundAt = typeof entry.boundAt === "number" ? entry.boundAt : Date.now();

      // Handle legacy expiresAt → maxAgeMs conversion
      let maxAgeMs: number | null = typeof entry.maxAgeMs === "number" ? entry.maxAgeMs : null;
      let idleTimeoutMs: number | null =
        typeof entry.idleTimeoutMs === "number" ? entry.idleTimeoutMs : null;

      if (maxAgeMs === null && idleTimeoutMs === null && typeof entry.expiresAt === "number") {
        const expiresAt = entry.expiresAt;
        if (expiresAt > 0) {
          maxAgeMs = expiresAt - boundAt;
          idleTimeoutMs = 0;
        } else {
          maxAgeMs = 0;
          idleTimeoutMs = 0;
        }
      }

      saveThreadBindingToDb({
        binding_key: bindingKey,
        channel_type: "discord",
        account_id: accountId,
        thread_id: threadId,
        channel_id: entry.channelId ? str(entry.channelId) : null,
        target_kind: str(entry.targetKind, "acp"),
        target_session_key: targetSessionKey,
        agent_id: entry.agentId ? str(entry.agentId) : null,
        label: entry.label ? str(entry.label) : null,
        bound_by: entry.boundBy ? str(entry.boundBy) : null,
        bound_at: boundAt,
        last_activity_at: typeof entry.lastActivityAt === "number" ? entry.lastActivityAt : boundAt,
        idle_timeout_ms: idleTimeoutMs,
        max_age_ms: maxAgeMs,
        webhook_id: entry.webhookId ? str(entry.webhookId) : null,
        webhook_token: entry.webhookToken ? str(entry.webhookToken) : null,
        extra_json: null,
      });
      result.count++;
    }
    result.migrated = true;
    tryUnlink(filePath);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function migratePhase3ToSqlite(env: NodeJS.ProcessEnv = process.env): MigrationResult[] {
  return [
    migrateAuthProfiles(env),
    migratePairingRequests(env),
    migrateAllowlists(env),
    migrateTelegramThreadBindings(env),
    migrateDiscordThreadBindings(env),
  ];
}
