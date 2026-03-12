/**
 * SQLite adapter for node pairing state.
 *
 * Replaces:
 *   ~/.openclaw/nodes/pending.json → op1_node_pairing_pending rows
 *   ~/.openclaw/nodes/paired.json  → op1_node_pairing_paired rows
 */
import type { DatabaseSync } from "node:sqlite";
import type { NodePairingPairedNode, NodePairingPendingRequest } from "../node-pairing.js";
import { getStateDb } from "./connection.js";

// ── DB provider (overridable for tests) ─────────────────────────────────────

let _dbOverride: DatabaseSync | null = null;

export function setNodePairingDbForTest(db: DatabaseSync): void {
  _dbOverride = db;
}

export function resetNodePairingDbForTest(): void {
  _dbOverride = null;
}

function resolveDb(): DatabaseSync {
  return _dbOverride ?? getStateDb();
}

// ── Pending requests ─────────────────────────────────────────────────────────

export function getPendingNodePairingsFromDb(): NodePairingPendingRequest[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT data_json FROM op1_node_pairing_pending ORDER BY created_at ASC")
      .all() as Array<{ data_json: string }>;
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as NodePairingPendingRequest;
        } catch {
          return null;
        }
      })
      .filter((r): r is NodePairingPendingRequest => r != null);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function getPendingNodePairingFromDb(requestId: string): NodePairingPendingRequest | null {
  const db = resolveDb();
  try {
    const row = db
      .prepare("SELECT data_json FROM op1_node_pairing_pending WHERE request_id = ?")
      .get(requestId) as { data_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data_json) as NodePairingPendingRequest;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

export function getPendingNodePairingByNodeIdFromDb(
  nodeId: string,
): NodePairingPendingRequest | null {
  const db = resolveDb();
  try {
    const row = db
      .prepare(
        "SELECT data_json FROM op1_node_pairing_pending WHERE node_id = ? ORDER BY created_at ASC LIMIT 1",
      )
      .get(nodeId) as { data_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data_json) as NodePairingPendingRequest;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

export function upsertPendingNodePairingInDb(request: NodePairingPendingRequest): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(
      `INSERT INTO op1_node_pairing_pending (request_id, node_id, data_json, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (request_id) DO UPDATE SET
         node_id = excluded.node_id,
         data_json = excluded.data_json`,
    ).run(request.requestId, request.nodeId, JSON.stringify(request), now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

export function deletePendingNodePairingFromDb(requestId: string): boolean {
  const db = resolveDb();
  try {
    const result = db
      .prepare("DELETE FROM op1_node_pairing_pending WHERE request_id = ?")
      .run(requestId);
    return Number(result.changes) > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}

export function deleteAllPendingNodePairingsFromDb(): void {
  const db = resolveDb();
  try {
    db.prepare("DELETE FROM op1_node_pairing_pending").run();
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

// ── Paired nodes ─────────────────────────────────────────────────────────────

export function getPairedNodesFromDb(): NodePairingPairedNode[] {
  const db = resolveDb();
  try {
    const rows = db
      .prepare("SELECT data_json FROM op1_node_pairing_paired ORDER BY updated_at DESC")
      .all() as Array<{ data_json: string }>;
    return rows
      .map((r) => {
        try {
          return JSON.parse(r.data_json) as NodePairingPairedNode;
        } catch {
          return null;
        }
      })
      .filter((r): r is NodePairingPairedNode => r != null);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return [];
    }
    throw err;
  }
}

export function getPairedNodeFromDb(nodeId: string): NodePairingPairedNode | null {
  const db = resolveDb();
  try {
    const row = db
      .prepare("SELECT data_json FROM op1_node_pairing_paired WHERE node_id = ?")
      .get(nodeId) as { data_json: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.data_json) as NodePairingPairedNode;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return null;
    }
    throw err;
  }
}

export function upsertPairedNodeInDb(node: NodePairingPairedNode): void {
  const db = resolveDb();
  const now = Math.floor(Date.now() / 1000);
  try {
    db.prepare(
      `INSERT INTO op1_node_pairing_paired (node_id, data_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (node_id) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
    ).run(node.nodeId, JSON.stringify(node), now);
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return;
    }
    throw err;
  }
}

export function deletePairedNodeFromDb(nodeId: string): boolean {
  const db = resolveDb();
  try {
    const result = db.prepare("DELETE FROM op1_node_pairing_paired WHERE node_id = ?").run(nodeId);
    return Number(result.changes) > 0;
  } catch (err) {
    if (err instanceof Error && err.message.includes("no such table")) {
      return false;
    }
    throw err;
  }
}
