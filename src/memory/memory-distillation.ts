/**
 * Memory distillation utilities.
 *
 * Provides MEMORY.md size checks and distillation state tracking
 * used by the heartbeat system to trigger memory compaction.
 */
import fs from "node:fs";
import path from "node:path";
import { logVerbose } from "../globals.js";

/** System truncates MEMORY.md at 200 lines; keep a 20-line safety margin. */
const MEMORY_MD_LINE_LIMIT = 180;

/** Trigger early distillation when daily note count exceeds this. */
const DAILY_NOTE_THRESHOLD = 20;

/** Flag stale MEMORY.md after this many days without update. */
const STALE_DAYS = 7;

const DAILY_NOTE_PATTERN = /^\d{4}-\d{2}-\d{2}\.md$/;

export type MemoryDistillationStatus = {
  /** Current line count of MEMORY.md */
  memoryMdLines: number;
  /** Whether MEMORY.md exceeds the safe limit (180 lines) */
  needsCompaction: boolean;
  /** Whether MEMORY.md exists */
  memoryMdExists: boolean;
  /** Whether MEMORY.md was updated within the last 7 days */
  memoryMdFresh: boolean;
  /** Number of unprocessed daily notes in memory/ */
  dailyNoteCount: number;
  /** Whether daily note count exceeds threshold (20) */
  needsDistillation: boolean;
  /** Days since MEMORY.md was last modified */
  daysSinceUpdate: number | null;
};

/**
 * Check the distillation status of an agent's memory workspace.
 * Returns indicators that the heartbeat can use to decide whether
 * to trigger a distillation cycle.
 */
export function checkDistillationStatus(workspaceDir: string): MemoryDistillationStatus {
  const memoryMdPath = path.join(workspaceDir, "MEMORY.md");
  const memoryDir = path.join(workspaceDir, "memory");

  let memoryMdLines = 0;
  let memoryMdExists = false;
  let memoryMdFresh = false;
  let daysSinceUpdate: number | null = null;

  // Check MEMORY.md
  try {
    const content = fs.readFileSync(memoryMdPath, "utf-8");
    memoryMdExists = true;
    memoryMdLines = content.split("\n").length;

    const stat = fs.statSync(memoryMdPath);
    const msSinceUpdate = Date.now() - stat.mtimeMs;
    daysSinceUpdate = Math.floor(msSinceUpdate / (24 * 60 * 60 * 1000));
    memoryMdFresh = daysSinceUpdate < STALE_DAYS;
  } catch {
    // MEMORY.md doesn't exist or can't be read
  }

  // Count daily notes
  let dailyNoteCount = 0;
  try {
    if (fs.existsSync(memoryDir)) {
      const entries = fs.readdirSync(memoryDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && DAILY_NOTE_PATTERN.test(entry.name)) {
          dailyNoteCount++;
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  const needsCompaction = memoryMdLines > MEMORY_MD_LINE_LIMIT;
  const needsDistillation = dailyNoteCount > DAILY_NOTE_THRESHOLD || !memoryMdFresh;

  if (needsCompaction) {
    logVerbose(
      `[distillation] MEMORY.md has ${memoryMdLines} lines (limit: ${MEMORY_MD_LINE_LIMIT}) — needs compaction`,
    );
  }
  if (needsDistillation) {
    logVerbose(
      `[distillation] ${dailyNoteCount} daily notes, ${daysSinceUpdate ?? "?"}d since MEMORY.md update — needs distillation`,
    );
  }

  return {
    memoryMdLines,
    needsCompaction,
    memoryMdExists,
    memoryMdFresh,
    dailyNoteCount,
    needsDistillation,
    daysSinceUpdate,
  };
}

/**
 * Build a distillation hint to append to the heartbeat prompt
 * when distillation or compaction is needed.
 */
export function buildDistillationHint(status: MemoryDistillationStatus): string | null {
  const hints: string[] = [];

  if (status.needsCompaction) {
    hints.push(
      `⚠ MEMORY.md is ${status.memoryMdLines} lines (limit: ${MEMORY_MD_LINE_LIMIT}). ` +
        `Summarize older entries and move detail to memory/archive-YYYY-QN.md to stay under the limit.`,
    );
  }

  if (!status.memoryMdExists) {
    hints.push(
      "⚠ MEMORY.md does not exist. Create it by distilling recent daily notes into a curated summary.",
    );
  } else if (!status.memoryMdFresh && status.daysSinceUpdate !== null) {
    hints.push(
      `⚠ MEMORY.md has not been updated in ${status.daysSinceUpdate} days. Distill recent daily notes into it.`,
    );
  }

  if (status.dailyNoteCount > DAILY_NOTE_THRESHOLD) {
    hints.push(
      `⚠ ${status.dailyNoteCount} daily notes in memory/ (threshold: ${DAILY_NOTE_THRESHOLD}). ` +
        `Distill and archive processed notes.`,
    );
  }

  if (hints.length === 0) {
    return null;
  }

  return `\n\n### Memory Distillation Alert\n${hints.join("\n")}`;
}
