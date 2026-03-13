/**
 * Daily note retention policy for memory files.
 *
 * Scans `memory/` for `YYYY-MM-DD.md` files older than the configured
 * retention threshold and moves them to `memory/.archive/` (recoverable).
 *
 * Called during reindex or heartbeat to prevent unbounded accumulation.
 */
import fs from "node:fs";
import path from "node:path";
import { logVerbose } from "../globals.js";

/** Default retention: 30 days */
const DEFAULT_RETENTION_DAYS = 30;

const DAILY_NOTE_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;

export type DailyNoteRetentionOptions = {
  /** Agent workspace directory (contains `memory/` subdirectory) */
  workspaceDir: string;
  /** Number of days to retain daily notes (default: 30) */
  retentionDays?: number;
  /** Dry run — log what would be archived but don't move files */
  dryRun?: boolean;
};

export type DailyNoteRetentionResult = {
  scanned: number;
  archived: string[];
  errors: string[];
};

/**
 * Archive daily notes older than the retention threshold.
 * Moves files to `memory/.archive/` rather than deleting them.
 */
export function archiveStaleDailyNotes(
  options: DailyNoteRetentionOptions,
): DailyNoteRetentionResult {
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const memoryDir = path.join(options.workspaceDir, "memory");
  const archiveDir = path.join(memoryDir, ".archive");
  const result: DailyNoteRetentionResult = { scanned: 0, archived: [], errors: [] };

  if (!fs.existsSync(memoryDir)) {
    return result;
  }

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(memoryDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile() || !DAILY_NOTE_PATTERN.test(entry.name)) {
      continue;
    }
    result.scanned++;

    // Parse date from filename
    const dateStr = entry.name.replace(".md", "");
    const fileDate = new Date(dateStr + "T00:00:00Z");
    if (Number.isNaN(fileDate.getTime())) {
      continue;
    }

    if (fileDate.getTime() >= cutoffMs) {
      continue; // Within retention window
    }

    const srcPath = path.join(memoryDir, entry.name);
    const dstPath = path.join(archiveDir, entry.name);

    if (options.dryRun) {
      result.archived.push(entry.name);
      logVerbose(`[retention] would archive: ${entry.name}`);
      continue;
    }

    try {
      // Create archive directory if it doesn't exist
      if (!fs.existsSync(archiveDir)) {
        fs.mkdirSync(archiveDir, { recursive: true });
      }
      fs.renameSync(srcPath, dstPath);
      result.archived.push(entry.name);
      logVerbose(`[retention] archived: ${entry.name}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${entry.name}: ${msg}`);
    }
  }

  return result;
}
