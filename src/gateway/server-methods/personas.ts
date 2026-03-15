/**
 * Persona library RPC handlers.
 *
 * Exposes the centralized persona template library for the agent creation
 * wizard (CLI + UI). Sources:
 *   - bundled: agents/personas/ (ships with operator1, ~147 personas)
 *   - hub: ~/.openclaw/{agentId}/agents/*.md (installed via hub.install)
 *
 * All methods read from disk — no database writes.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveAgentWorkspaceDir } from "../../agents/agent-scope.js";
import { expandPersona, loadPersonaBySlug, parsePersona } from "../../agents/persona-expansion.js";
import { backupWorkspace, writeExpansionResult } from "../../agents/persona-reassign.js";
import { loadConfig } from "../../config/config.js";
import {
  getAllHubInstalledFromDb,
  getHubInstalledItemFromDb,
} from "../../infra/state-db/hub-sqlite.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// ── Types ────────────────────────────────────────────────────────────────────

type PersonaSource = "bundled" | "hub";

type PersonaListEntry = {
  slug: string;
  name: string;
  description: string;
  category: string;
  role?: string;
  department?: string;
  emoji: string;
  tags?: string[];
  path: string;
  source: PersonaSource;
};

// ── Resolve personas directory ──────────────────────────────────────────────

function resolvePersonasDir(): string {
  // Same pattern as BUNDLED_AGENTS_DIR in marketplace.ts — one level up from dist/ to repo root
  return join(import.meta.dirname, "..", "agents", "personas");
}

async function loadIndex(): Promise<{
  personas: Array<{
    slug: string;
    name: string;
    description: string;
    category: string;
    role?: string;
    department?: string;
    emoji: string;
    tags?: string[];
    path: string;
  }>;
  categories: Array<{ slug: string; name: string; count: number }>;
} | null> {
  const indexPath = join(resolvePersonasDir(), "_index.json");
  try {
    const content = await readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ── Hub-installed persona helpers ────────────────────────────────────────────

/**
 * Load all hub-installed agent personas from their installPaths.
 * Skips files that can't be read or fail to parse.
 */
async function loadHubPersonaEntries(): Promise<PersonaListEntry[]> {
  const installed = getAllHubInstalledFromDb().filter((item) => item.type === "agent");
  const entries: PersonaListEntry[] = [];

  for (const item of installed) {
    try {
      const content = await readFile(item.installPath, "utf-8");
      const parsed = parsePersona(content);
      if ("error" in parsed) {
        continue;
      }
      const fm = parsed.frontmatter;
      entries.push({
        slug: fm.slug,
        name: fm.name,
        description: fm.description ?? "",
        category: fm.category,
        role: fm.role,
        department: fm.department,
        emoji: fm.emoji ?? "🤖",
        tags: fm.tags,
        path: item.installPath,
        source: "hub",
      });
    } catch {
      // Unreadable or missing — skip silently
    }
  }

  return entries;
}

/**
 * Load a hub-installed persona by slug.
 * Returns null if not found in hub-installed items.
 */
async function loadHubPersonaBySlug(slug: string) {
  const item = getHubInstalledItemFromDb(slug);
  if (!item || item.type !== "agent") {
    return null;
  }

  try {
    const content = await readFile(item.installPath, "utf-8");
    const parsed = parsePersona(content);
    if ("error" in parsed) {
      return null;
    }
    return { parsed, installPath: item.installPath };
  } catch {
    return null;
  }
}

// ── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Merge hub and bundled persona lists: hub entries first, deduplicate by slug.
 * Hub-installed wins over bundled when slugs collide. (P3)
 */
function mergePersonaLists(
  hubEntries: PersonaListEntry[],
  bundled: PersonaListEntry[],
): PersonaListEntry[] {
  const seen = new Set<string>();
  const merged: PersonaListEntry[] = [];
  for (const p of [...hubEntries, ...bundled]) {
    if (!seen.has(p.slug)) {
      seen.add(p.slug);
      merged.push(p);
    }
  }
  return merged;
}

// ── Handlers ────────────────────────────────────────────────────────────────

export const personasHandlers: GatewayRequestHandlers = {
  /**
   * List available persona templates with optional filters.
   * Includes both bundled personas and hub-installed personas.
   * Params: { category?: string, tag?: string, limit?: number, offset?: number, source?: 'bundled' | 'hub' | 'all' }
   */
  "personas.list": async ({ params, respond }) => {
    const index = await loadIndex();
    if (!index) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, "Persona index not found"));
      return;
    }

    const sourceFilter = typeof params.source === "string" ? params.source.trim() : "all";

    // Bundled personas from the index
    const bundled: PersonaListEntry[] = index.personas.map((p) => ({
      ...p,
      source: "bundled" as const,
    }));

    // Hub-installed personas (non-bundled agents)
    const hubEntries = sourceFilter !== "bundled" ? await loadHubPersonaEntries() : [];

    // Merge: hub-installed wins over bundled when slugs collide
    const merged = mergePersonaLists(hubEntries, bundled);

    let filtered = merged;

    if (sourceFilter === "bundled") {
      filtered = filtered.filter((p) => p.source === "bundled");
    } else if (sourceFilter === "hub") {
      filtered = filtered.filter((p) => p.source === "hub");
    }

    const category = typeof params.category === "string" ? params.category.trim() : "";
    if (category) {
      filtered = filtered.filter((p) => p.category === category);
    }

    const tag = typeof params.tag === "string" ? params.tag.trim() : "";
    if (tag) {
      filtered = filtered.filter((p) => p.tags?.includes(tag));
    }

    const offset = typeof params.offset === "number" ? Math.max(0, params.offset) : 0;
    const limit = typeof params.limit === "number" ? Math.max(1, params.limit) : filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    respond(true, { personas: paginated, total: filtered.length }, undefined);
  },

  /**
   * Get full persona content by slug.
   * Checks bundled personas first, then hub-installed.
   * Params: { slug: string }
   */
  "personas.get": async ({ params, respond }) => {
    const slug = typeof params.slug === "string" ? params.slug.trim() : "";
    if (!slug) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing slug parameter"));
      return;
    }

    const personasDir = resolvePersonasDir();

    // Try bundled first
    let persona = await loadPersonaBySlug(personasDir, slug);
    let source: PersonaSource = "bundled";

    // Fall back to hub-installed
    if ("error" in persona) {
      const hubResult = await loadHubPersonaBySlug(slug);
      if (hubResult) {
        persona = hubResult.parsed;
        source = "hub";
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, persona.error));
        return;
      }
    }

    respond(
      true,
      {
        slug: persona.frontmatter.slug,
        name: persona.frontmatter.name,
        description: persona.frontmatter.description,
        category: persona.frontmatter.category,
        role: persona.frontmatter.role,
        department: persona.frontmatter.department,
        emoji: persona.frontmatter.emoji,
        vibe: persona.frontmatter.vibe,
        tags: persona.frontmatter.tags,
        tools: persona.frontmatter.tools,
        tier: persona.frontmatter.tier,
        capabilities: persona.frontmatter.capabilities,
        body: persona.body,
        sections: Object.fromEntries(persona.sections),
        source,
      },
      undefined,
    );
  },

  /**
   * List available categories with counts.
   * Includes a "hub" category for hub-installed personas.
   */
  "personas.categories": async ({ respond }) => {
    const index = await loadIndex();
    if (!index) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, "Persona index not found"));
      return;
    }

    const categories = [...index.categories];

    // Add counts for hub-installed personas under their actual category (P2)
    const hubEntries = await loadHubPersonaEntries();
    const bundledSlugs = new Set(index.personas.map((p) => p.slug));
    for (const entry of hubEntries.filter((p) => !bundledSlugs.has(p.slug))) {
      const existing = categories.find((c) => c.slug === entry.category);
      if (existing) {
        existing.count += 1;
      } else {
        categories.push({ slug: entry.category, name: entry.category, count: 1 });
      }
    }

    respond(true, { categories }, undefined);
  },

  /**
   * Search personas by name, description, tags.
   * Searches both bundled and hub-installed personas.
   * Params: { query: string, limit?: number }
   */
  "personas.search": async ({ params, respond }) => {
    const query = typeof params.query === "string" ? params.query.trim().toLowerCase() : "";
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Missing query parameter"));
      return;
    }

    const index = await loadIndex();
    if (!index) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, "Persona index not found"));
      return;
    }

    const bundled: PersonaListEntry[] = index.personas.map((p) => ({
      ...p,
      source: "bundled" as const,
    }));
    const hubEntries = await loadHubPersonaEntries();

    const all = mergePersonaLists(hubEntries, bundled);

    const matches = all.filter((p) => {
      const haystack = [p.name, p.description, p.slug, p.category, ...(p.tags ?? [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });

    const limit = typeof params.limit === "number" ? Math.max(1, params.limit) : matches.length;
    respond(true, { personas: matches.slice(0, limit), total: matches.length }, undefined);
  },

  /**
   * Preview expansion of a persona into agent files (dry run — no disk writes).
   * Checks bundled then hub-installed.
   * Params: { slug: string, agentName: string, agentId: string, overrides?: object }
   */
  "personas.expand": async ({ params, respond }) => {
    const slug = typeof params.slug === "string" ? params.slug.trim() : "";
    const agentName = typeof params.agentName === "string" ? params.agentName.trim() : "";
    const agentId = typeof params.agentId === "string" ? params.agentId.trim() : "";

    if (!slug || !agentName || !agentId) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "Missing required parameters: slug, agentName, agentId",
        ),
      );
      return;
    }

    const overrides =
      params.overrides && typeof params.overrides === "object"
        ? (params.overrides as Record<string, unknown>)
        : undefined;

    // Try bundled first
    const personasDir = resolvePersonasDir();
    let persona = await loadPersonaBySlug(personasDir, slug);

    if ("error" in persona) {
      // Fall back to hub-installed
      const hubResult = await loadHubPersonaBySlug(slug);
      if (hubResult) {
        persona = hubResult.parsed;
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, persona.error));
        return;
      }
    }

    const result = await expandPersona(persona, { agentName, agentId, overrides });
    if ("error" in result) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, result.error));
      return;
    }

    respond(
      true,
      {
        agentMd: result.agentMd,
        workspaceFiles: result.workspaceFiles.map((f) => ({
          name: f.name,
          content: f.content,
          size: f.content.length,
        })),
      },
      undefined,
    );
  },

  /**
   * Apply a different persona to an existing agent (re-assignment).
   * Backs up workspace, re-expands, writes new files.
   * Checks bundled then hub-installed.
   * Params: { agentId: string, slug: string, agentName?: string, overrides?: object }
   */
  "personas.apply": async ({ params, respond }) => {
    const agentId = typeof params.agentId === "string" ? params.agentId.trim() : "";
    const slug = typeof params.slug === "string" ? params.slug.trim() : "";

    if (!agentId || !slug) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Missing required parameters: agentId, slug"),
      );
      return;
    }

    const cfg = loadConfig();
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const agentDir = join(resolvePersonasDir(), "..", agentId);
    const agentName = typeof params.agentName === "string" ? params.agentName.trim() : agentId;
    const overrides =
      params.overrides && typeof params.overrides === "object"
        ? (params.overrides as Record<string, unknown>)
        : undefined;

    // Try bundled first
    const personasDir = resolvePersonasDir();
    let persona = await loadPersonaBySlug(personasDir, slug);

    if ("error" in persona) {
      // Fall back to hub-installed
      const hubResult = await loadHubPersonaBySlug(slug);
      if (hubResult) {
        persona = hubResult.parsed;
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, persona.error));
        return;
      }
    }

    // Backup existing workspace
    const backupDir = await backupWorkspace(workspaceDir);

    // Expand and write
    const expansion = await expandPersona(persona, { agentName, agentId, overrides });
    if ("error" in expansion) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, expansion.error));
      return;
    }

    await writeExpansionResult({ agentDir, workspaceDir, expansion });

    respond(
      true,
      {
        ok: true,
        agentId,
        persona: slug,
        backupDir,
        filesWritten: ["AGENT.md", ...expansion.workspaceFiles.map((f) => f.name)],
      },
      undefined,
    );
  },
};
