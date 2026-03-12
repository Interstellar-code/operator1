import path from "node:path";
import { expandHomePrefix } from "../infra/home-dir.js";
import { loadAllCronJobsFromDb, syncAllCronJobsToDb } from "../infra/state-db/cron-sqlite.js";
import { CONFIG_DIR } from "../utils.js";
import type { CronStoreFile } from "./types.js";

export const DEFAULT_CRON_DIR = path.join(CONFIG_DIR, "cron");
export const DEFAULT_CRON_STORE_PATH = path.join(DEFAULT_CRON_DIR, "jobs.json");

export function resolveCronStorePath(storePath?: string) {
  if (storePath?.trim()) {
    const raw = storePath.trim();
    if (raw.startsWith("~")) {
      return path.resolve(expandHomePrefix(raw));
    }
    return path.resolve(raw);
  }
  return DEFAULT_CRON_STORE_PATH;
}

export async function loadCronStore(_storePath: string): Promise<CronStoreFile> {
  const jobs = loadAllCronJobsFromDb<CronStoreFile["jobs"][number]>();
  return { version: 1, jobs };
}

export async function saveCronStore(
  _storePath: string,
  store: CronStoreFile,
  _opts?: { skipBackup?: boolean },
) {
  syncAllCronJobsToDb(store.jobs);
}
