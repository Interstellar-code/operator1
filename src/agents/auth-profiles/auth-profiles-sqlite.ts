/**
 * SQLite adapter for auth profiles store.
 *
 * Each profile is stored as a row in op1_auth_profiles with the credential
 * serialized as JSON. Companion tables handle ordering, usage stats, and
 * last-good tracking.
 */
import type { DatabaseSync } from "node:sqlite";
import { getStateDb } from "../../infra/state-db/connection.js";
import { runMigrations } from "../../infra/state-db/schema.js";
import type { AuthProfileCredential, AuthProfileStore, ProfileUsageStats } from "./types.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setAuthProfilesDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetAuthProfilesDbForTest(): void {
  _dbOverride = null;
}

export function initAuthProfilesTestDb(db: DatabaseSync): DatabaseSync {
  runMigrations(db);
  setAuthProfilesDbForTest(db);
  return db;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Load full store from SQLite ─────────────────────────────────────────────

export function loadAuthProfileStoreFromDb(): AuthProfileStore | null {
  const db = resolveDb();
  try {
    const profileRows = db
      .prepare("SELECT profile_id, credential_json FROM op1_auth_profiles")
      .all() as Array<{ profile_id: string; credential_json: string | null }>;

    if (profileRows.length === 0) {
      return null;
    }

    const profiles: Record<string, AuthProfileCredential> = {};
    for (const row of profileRows) {
      if (row.credential_json) {
        try {
          profiles[row.profile_id] = JSON.parse(row.credential_json);
        } catch {
          /* skip malformed */
        }
      }
    }

    // Load order
    const orderRows = db
      .prepare("SELECT provider, profile_ids_json FROM op1_auth_profile_order")
      .all() as Array<{ provider: string; profile_ids_json: string }>;
    let order: Record<string, string[]> | undefined;
    if (orderRows.length > 0) {
      order = {};
      for (const row of orderRows) {
        try {
          order[row.provider] = JSON.parse(row.profile_ids_json);
        } catch {
          /* skip */
        }
      }
    }

    // Load lastGood
    const lastGoodRows = db
      .prepare("SELECT provider, profile_id FROM op1_auth_profile_last_good")
      .all() as Array<{ provider: string; profile_id: string }>;
    let lastGood: Record<string, string> | undefined;
    if (lastGoodRows.length > 0) {
      lastGood = {};
      for (const row of lastGoodRows) {
        lastGood[row.provider] = row.profile_id;
      }
    }

    // Load usage stats
    const usageRows = db
      .prepare("SELECT profile_id, stats_json FROM op1_auth_profile_usage")
      .all() as Array<{ profile_id: string; stats_json: string }>;
    let usageStats: Record<string, ProfileUsageStats> | undefined;
    if (usageRows.length > 0) {
      usageStats = {};
      for (const row of usageRows) {
        try {
          usageStats[row.profile_id] = JSON.parse(row.stats_json);
        } catch {
          /* skip */
        }
      }
    }

    return { version: 1, profiles, order, lastGood, usageStats };
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

// ── Save full store to SQLite ───────────────────────────────────────────────

export function saveAuthProfileStoreToDb(store: AuthProfileStore): void {
  const db = resolveDb();
  try {
    db.exec("BEGIN");
    try {
      // Profiles
      db.exec("DELETE FROM op1_auth_profiles");
      const insertProfile = db.prepare(
        `INSERT INTO op1_auth_profiles (profile_id, type, provider, credential_json, email, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const now = Math.floor(Date.now() / 1000);
      for (const [profileId, cred] of Object.entries(store.profiles)) {
        insertProfile.run(
          profileId,
          cred.type,
          cred.provider,
          JSON.stringify(cred),
          cred.email ?? null,
          now,
        );
      }

      // Order
      db.exec("DELETE FROM op1_auth_profile_order");
      if (store.order) {
        const insertOrder = db.prepare(
          "INSERT INTO op1_auth_profile_order (provider, profile_ids_json) VALUES (?, ?)",
        );
        for (const [provider, ids] of Object.entries(store.order)) {
          insertOrder.run(provider, JSON.stringify(ids));
        }
      }

      // Last good
      db.exec("DELETE FROM op1_auth_profile_last_good");
      if (store.lastGood) {
        const insertLastGood = db.prepare(
          "INSERT INTO op1_auth_profile_last_good (provider, profile_id) VALUES (?, ?)",
        );
        for (const [provider, profileId] of Object.entries(store.lastGood)) {
          insertLastGood.run(provider, profileId);
        }
      }

      // Usage stats
      db.exec("DELETE FROM op1_auth_profile_usage");
      if (store.usageStats) {
        const insertUsage = db.prepare(
          "INSERT INTO op1_auth_profile_usage (profile_id, stats_json) VALUES (?, ?)",
        );
        for (const [profileId, stats] of Object.entries(store.usageStats)) {
          insertUsage.run(profileId, JSON.stringify(stats));
        }
      }

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

// ── Transactional update (replaces file lock) ───────────────────────────────

export function updateAuthProfileStoreInDb(
  updater: (store: AuthProfileStore) => boolean,
): AuthProfileStore | null {
  const store = loadAuthProfileStoreFromDb() ?? { version: 1, profiles: {} };
  const shouldSave = updater(store);
  if (shouldSave) {
    saveAuthProfileStoreToDb(store);
  }
  return store;
}
