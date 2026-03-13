import { randomUUID } from "node:crypto";
/**
 * Command file scanner — syncs ~/.openclaw/commands/*.md into op1_commands.
 *
 * Runs on gateway startup. Parses frontmatter from each .md file and upserts
 * a row in op1_commands with source='user'. Builtin rows (source='builtin')
 * are never touched by the scanner.
 */
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../../config/paths.js";
import { upsertCommand } from "./commands-sqlite.js";
import type { CommandArg } from "./commands-sqlite.js";

// ── Minimal frontmatter parser ───────────────────────────────────────────────

type ParsedFrontmatter = {
  name?: string;
  description?: string;
  emoji?: string;
  category?: string;
  "user-command"?: boolean | string;
  "model-invocation"?: boolean | string;
  "long-running"?: boolean | string;
  args?: CommandArg[];
  tags?: string[];
};

/**
 * Extract YAML frontmatter from a markdown string.
 * Only handles simple scalar values (string, boolean) and basic arrays of objects.
 */
function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }

  const raw = match[1] ?? "";
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const val = kvMatch[2].trim();

    if (val === "") {
      // Might be a block (list of objects)
      const items: Record<string, string>[] = [];
      i++;
      while (i < lines.length && lines[i]?.startsWith("  ")) {
        const itemLine = lines[i].trim();
        if (itemLine.startsWith("- ")) {
          const item: Record<string, string> = {};
          // parse "- key: value"
          const firstKv = itemLine.slice(2).match(/^(\w+)\s*:\s*(.*)/);
          if (firstKv) {
            item[firstKv[1]] = firstKv[2].trim().replace(/^"(.*)"$/, "$1");
          }
          i++;
          // parse subsequent "  key: value" lines belonging to this item
          while (i < lines.length && lines[i]?.match(/^    \w/)) {
            const subLine = lines[i].trim();
            const subKv = subLine.match(/^(\w+)\s*:\s*(.*)/);
            if (subKv) {
              item[subKv[1]] = subKv[2].trim().replace(/^"(.*)"$/, "$1");
            }
            i++;
          }
          items.push(item);
        } else {
          i++;
        }
      }
      result[key] = items.length ? items : undefined;
    } else {
      // Scalar: bool or string
      if (val === "true") {
        result[key] = true;
      } else if (val === "false") {
        result[key] = false;
      } else {
        result[key] = val.replace(/^"(.*)"$/, "$1");
      }
      i++;
    }
  }

  return result as ParsedFrontmatter;
}

// ── Scanner ──────────────────────────────────────────────────────────────────

function commandsDir(): string {
  return path.join(resolveStateDir(), "commands");
}

/**
 * Scan ~/.openclaw/commands/*.md and upsert into op1_commands.
 * Skips files with missing/invalid frontmatter (no name or description).
 * Does not touch rows where source='builtin'.
 */
export function scanCommandFiles(log?: { warn: (msg: string) => void }): void {
  const dir = commandsDir();

  if (!fs.existsSync(dir)) {
    return; // No commands dir yet — nothing to scan
  }

  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    return;
  }

  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const fm = parseFrontmatter(content);

      if (!fm?.name || !fm.description) {
        log?.warn(
          `[commands-scanner] Skipping ${file}: missing name or description in frontmatter`,
        );
        continue;
      }

      const args: CommandArg[] = Array.isArray(fm.args) ? fm.args : [];

      upsertCommand({
        commandId: randomUUID(), // ignored if row already exists (ON CONFLICT uses existing id)
        name: fm.name,
        description: fm.description,
        emoji: fm.emoji,
        filePath,
        type: "command",
        source: "user",
        userCommand: fm["user-command"] !== false && fm["user-command"] !== "false",
        modelInvocation: fm["model-invocation"] === true || fm["model-invocation"] === "true",
        longRunning: fm["long-running"] === true || fm["long-running"] === "true",
        args,
        tags: Array.isArray(fm.tags) ? fm.tags : [],
        category: fm.category ?? "general",
      });
    } catch (err) {
      log?.warn(
        `[commands-scanner] Failed to process ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
