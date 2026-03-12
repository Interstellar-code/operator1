import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { loadAllSubagentRunsFromDb, saveAllSubagentRunsToDb } from "./subagent-registry-sqlite.js";
import type { SubagentRunRecord } from "./subagent-registry.types.js";

export type PersistedSubagentRegistryVersion = 1 | 2;

/** @deprecated — kept for migration reference only. */
export function resolveSubagentRegistryPath(): string {
  return path.join(resolveStateDir(process.env), "subagents", "runs.json");
}

export function loadSubagentRegistryFromDisk(): Map<string, SubagentRunRecord> {
  return loadAllSubagentRunsFromDb();
}

export function saveSubagentRegistryToDisk(runs: Map<string, SubagentRunRecord>) {
  saveAllSubagentRunsToDb(runs);
}
