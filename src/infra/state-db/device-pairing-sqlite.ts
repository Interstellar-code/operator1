/**
 * SQLite adapter for device pairing state.
 *
 * Replaces:
 *   ~/.openclaw/devices/pending.json → op1_device_pairing_pending rows
 *   ~/.openclaw/devices/paired.json  → op1_device_pairing_paired rows
 */
import type { DatabaseSync } from "node:sqlite";
import type { DevicePairingPendingRequest, PairedDevice } from "../device-pairing.js";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setDevicePairingDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetDevicePairingDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Pending requests ─────────────────────────────────────────────────────────

export function getPendingDevicePairingsFromDb(): DevicePairingPendingRequest[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT data_json FROM op1_device_pairing_pending ORDER BY created_at ASC")
      .all() as Array<{ data_json: string }>;
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as DevicePairingPendingRequest;
        } catch {
          return null;
        }
      })
      .filter((r): r is DevicePairingPendingRequest => r != null);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function getPendingDevicePairingFromDb(
  requestId: string,
): DevicePairingPendingRequest | null {
  const db = resolveDb();
  try {
    const row = db
      .prepare("SELECT data_json FROM op1_device_pairing_pending WHERE request_id = ?")
      .get(requestId) as { data_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data_json) as DevicePairingPendingRequest;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

export function getPendingDevicePairingByDeviceIdFromDb(
  deviceId: string,
): DevicePairingPendingRequest | null {
  const db = resolveDb();
  try {
    const row = db
      .prepare(
        "SELECT data_json FROM op1_device_pairing_pending WHERE device_id = ? ORDER BY created_at ASC LIMIT 1",
      )
      .get(deviceId) as { data_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data_json) as DevicePairingPendingRequest;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

export function upsertPendingDevicePairingInDb(request: DevicePairingPendingRequest): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(
      `INSERT INTO op1_device_pairing_pending (request_id, device_id, data_json, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (request_id) DO UPDATE SET
         device_id = excluded.device_id,
         data_json = excluded.data_json`,
    ).run(request.requestId, request.deviceId, JSON.stringify(request), now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

export function deletePendingDevicePairingFromDb(requestId: string): boolean {
  const db = resolveDb();
  try {
    const result = db
      .prepare("DELETE FROM op1_device_pairing_pending WHERE request_id = ?")
      .run(requestId);
    return Number(result.changes) > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}

export function deleteAllPendingDevicePairingsFromDb(): void {
  const db = resolveDb();
  try {
    db.prepare("DELETE FROM op1_device_pairing_pending").run();
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

// ── Paired devices ───────────────────────────────────────────────────────────

export function getPairedDevicesFromDb(): PairedDevice[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT data_json FROM op1_device_pairing_paired ORDER BY updated_at DESC")
      .all() as Array<{ data_json: string }>;
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as PairedDevice;
        } catch {
          return null;
        }
      })
      .filter((r): r is PairedDevice => r != null);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function getPairedDeviceFromDb(deviceId: string): PairedDevice | null {
  const db = resolveDb();
  try {
    const row = db
      .prepare("SELECT data_json FROM op1_device_pairing_paired WHERE device_id = ?")
      .get(deviceId) as { data_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data_json) as PairedDevice;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

export function upsertPairedDeviceInDb(device: PairedDevice): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(
      `INSERT INTO op1_device_pairing_paired (device_id, data_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (device_id) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
    ).run(device.deviceId, JSON.stringify(device), now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

export function deletePairedDeviceFromDb(deviceId: string): boolean {
  const db = resolveDb();
  try {
    const result = db
      .prepare("DELETE FROM op1_device_pairing_paired WHERE device_id = ?")
      .run(deviceId);
    return Number(result.changes) > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}
