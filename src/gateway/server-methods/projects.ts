import fs from "node:fs";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { ProjectEntry, ProjectDetails, ProjectStore } from "./projects.types.js";
import type { GatewayRequestHandlers } from "./types.js";

// ── Session Bindings (in-memory, not persisted) ─────────────────────

const sessionBindings = new Map<string, string>();

// ── MarkdownProjectStore ────────────────────────────────────────────

function resolveProjectsPath(): string {
  const cfg = loadConfig();
  const agentId = resolveDefaultAgentId(cfg);
  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  return path.join(workspaceDir, "PROJECTS.md");
}

/**
 * Parse a PROJECTS.md file into ProjectEntry objects.
 *
 * Expected format:
 * ```
 * # Active Projects
 *
 * ## project-id
 * - **Path:** ~/dev/project
 * - **Type:** web app
 * - **Tech:** TypeScript, React
 * - **Status:** Active development
 * - **Default:** true
 * - **Keywords:** keyword1, keyword2
 *
 * # Archived Projects
 *
 * ## old-project
 * ...
 * ```
 */
function parseProjectsMd(content: string): ProjectEntry[] {
  const entries: ProjectEntry[] = [];
  const lines = content.split("\n");

  let currentId: string | null = null;
  let current: Partial<ProjectEntry> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    // H2 = project ID
    const h2Match = trimmed.match(/^## (.+)$/);
    if (h2Match) {
      // Save previous entry if any
      if (currentId && current.path) {
        entries.push(finalizeEntry(currentId, current));
      }
      currentId = h2Match[1].trim();
      current = {};
      continue;
    }

    // H1 resets (e.g., "# Archived Projects")
    if (trimmed.startsWith("# ")) {
      if (currentId && current.path) {
        entries.push(finalizeEntry(currentId, current));
      }
      currentId = null;
      current = {};
      continue;
    }

    if (!currentId) {
      continue;
    }

    // Parse bullet fields
    const fieldMatch = trimmed.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
    if (fieldMatch) {
      const key = fieldMatch[1].toLowerCase();
      const value = fieldMatch[2].trim();
      switch (key) {
        case "name":
          current.name = value;
          break;
        case "path":
          current.path = value;
          break;
        case "type":
          current.type = value;
          break;
        case "tech":
          current.tech = value;
          break;
        case "status":
          current.status = value;
          break;
        case "default":
          current.isDefault = value.toLowerCase() === "true";
          break;
        case "keywords":
          current.keywords = value
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean);
          break;
      }
    }
  }

  // Don't forget the last entry
  if (currentId && current.path) {
    entries.push(finalizeEntry(currentId, current));
  }

  return entries;
}

function finalizeEntry(id: string, partial: Partial<ProjectEntry>): ProjectEntry {
  return {
    id,
    name: partial.name ?? id,
    path: partial.path ?? "",
    type: partial.type ?? "",
    tech: partial.tech ?? "",
    status: partial.status ?? "active",
    isDefault: partial.isDefault ?? false,
    keywords: partial.keywords ?? [],
  };
}

function serializeProjectsMd(entries: ProjectEntry[]): string {
  const active = entries.filter((e) => e.status !== "archived");
  const archived = entries.filter((e) => e.status === "archived");

  let md = "# Active Projects\n";

  for (const e of active) {
    md += `\n## ${e.id}\n`;
    if (e.name && e.name !== e.id) {
      md += `- **Name:** ${e.name}\n`;
    }
    md += `- **Path:** ${e.path}\n`;
    md += `- **Type:** ${e.type}\n`;
    md += `- **Tech:** ${e.tech}\n`;
    md += `- **Status:** ${e.status}\n`;
    if (e.isDefault) {
      md += `- **Default:** true\n`;
    }
    if (e.keywords.length > 0) {
      md += `- **Keywords:** ${e.keywords.join(", ")}\n`;
    }
  }

  if (archived.length > 0) {
    md += "\n# Archived Projects\n";
    for (const e of archived) {
      md += `\n## ${e.id}\n`;
      if (e.name && e.name !== e.id) {
        md += `- **Name:** ${e.name}\n`;
      }
      md += `- **Path:** ${e.path}\n`;
      md += `- **Type:** ${e.type}\n`;
      md += `- **Tech:** ${e.tech}\n`;
      md += `- **Status:** ${e.status}\n`;
      if (e.keywords.length > 0) {
        md += `- **Keywords:** ${e.keywords.join(", ")}\n`;
      }
    }
  }

  return md;
}

function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(process.env.HOME ?? "/", p.slice(2));
  }
  return p;
}

function readOptionalFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function createMarkdownProjectStore(): ProjectStore {
  const filePath = resolveProjectsPath();

  function readEntries(): ProjectEntry[] {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return parseProjectsMd(content);
    } catch {
      return [];
    }
  }

  function writeEntries(entries: ProjectEntry[]): void {
    fs.writeFileSync(filePath, serializeProjectsMd(entries), "utf8");
  }

  return {
    async list() {
      return readEntries();
    },

    async get(id: string) {
      const entries = readEntries();
      const entry = entries.find((e) => e.id === id);
      if (!entry) {
        throw new ProjectStoreError("PROJECT_NOT_FOUND", `No project with id '${id}'`);
      }

      const projectPath = expandHome(entry.path);
      const openclawDir = path.join(projectPath, ".openclaw");

      if (!fs.existsSync(openclawDir)) {
        throw new ProjectStoreError(
          "NO_WORKSPACE",
          `Project '${id}' has no .openclaw/ directory at ${entry.path}`,
        );
      }

      const details: ProjectDetails = {
        ...entry,
        soul: readOptionalFile(path.join(openclawDir, "SOUL.md")),
        agents: readOptionalFile(path.join(openclawDir, "AGENTS.md")),
        tools: readOptionalFile(path.join(openclawDir, "TOOLS.md")),
      };

      return details;
    },

    async add(entry: ProjectEntry) {
      const entries = readEntries();
      if (entries.some((e) => e.id === entry.id)) {
        throw new ProjectStoreError("DUPLICATE_ID", `Project '${entry.id}' already exists`);
      }
      const realPath = expandHome(entry.path);
      if (!fs.existsSync(realPath)) {
        throw new ProjectStoreError("PATH_NOT_FOUND", `Path '${entry.path}' does not exist`);
      }
      if (entry.isDefault) {
        const existingDefault = entries.find((e) => e.isDefault);
        if (existingDefault) {
          throw new ProjectStoreError(
            "MULTIPLE_DEFAULTS",
            `Only one project can be default; '${existingDefault.id}' is already default`,
          );
        }
      }
      entries.push(entry);
      writeEntries(entries);
    },

    async update(id: string, patch: Partial<ProjectEntry>) {
      const entries = readEntries();
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) {
        throw new ProjectStoreError("PROJECT_NOT_FOUND", `No project with id '${id}'`);
      }

      if (patch.isDefault === true) {
        const existingDefault = entries.find((e) => e.isDefault && e.id !== id);
        if (existingDefault) {
          throw new ProjectStoreError(
            "MULTIPLE_DEFAULTS",
            `Only one project can be default; '${existingDefault.id}' is already default`,
          );
        }
      }

      entries[idx] = { ...entries[idx], ...patch, id };
      writeEntries(entries);
    },

    async archive(id: string) {
      const entries = readEntries();
      const idx = entries.findIndex((e) => e.id === id);
      if (idx === -1) {
        throw new ProjectStoreError("PROJECT_NOT_FOUND", `No project with id '${id}'`);
      }

      entries[idx].status = "archived";
      entries[idx].isDefault = false;
      writeEntries(entries);
    },
  };
}

class ProjectStoreError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ProjectStoreError";
  }
}

// ── Gateway Handlers ────────────────────────────────────────────────

let _store: ProjectStore | undefined;
function getStore(): ProjectStore {
  if (!_store) {
    _store = createMarkdownProjectStore();
  }
  return _store;
}

export const projectsHandlers: GatewayRequestHandlers = {
  "projects.list": async ({ respond }) => {
    try {
      const projects = await getStore().list();
      respond(true, { projects }, undefined);
    } catch (err) {
      respond(false, undefined, storeErrorToShape(err));
    }
  },

  "projects.get": async ({ params, respond }) => {
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      const project = await getStore().get(id);
      respond(true, project, undefined);
    } catch (err) {
      respond(false, undefined, storeErrorToShape(err));
    }
  },

  "projects.add": async ({ params, respond }) => {
    const p = params;
    const id = typeof p.id === "string" ? p.id.trim() : "";
    const projectPath = typeof p.path === "string" ? p.path.trim() : "";
    if (!id || !projectPath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id and path are required"));
      return;
    }
    const entry: ProjectEntry = {
      id,
      name: typeof p.name === "string" ? p.name.trim() : id,
      path: projectPath,
      type: typeof p.type === "string" ? p.type.trim() : "",
      tech: typeof p.tech === "string" ? p.tech.trim() : "",
      status: typeof p.status === "string" ? p.status.trim() : "active",
      isDefault: p.isDefault === true,
      keywords: Array.isArray(p.keywords)
        ? (p.keywords as unknown[]).filter((k): k is string => typeof k === "string")
        : [],
    };
    try {
      await getStore().add(entry);
      respond(true, { ok: true, id }, undefined);
    } catch (err) {
      respond(false, undefined, storeErrorToShape(err));
    }
  },

  "projects.update": async ({ params, respond }) => {
    const p = params;
    const id = typeof p.id === "string" ? p.id.trim() : "";
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    const patch: Partial<ProjectEntry> = {};
    if (typeof p.name === "string") {
      patch.name = p.name.trim();
    }
    if (typeof p.path === "string") {
      patch.path = p.path.trim();
    }
    if (typeof p.type === "string") {
      patch.type = p.type.trim();
    }
    if (typeof p.tech === "string") {
      patch.tech = p.tech.trim();
    }
    if (typeof p.status === "string") {
      patch.status = p.status.trim();
    }
    if (typeof p.isDefault === "boolean") {
      patch.isDefault = p.isDefault;
    }
    if (Array.isArray(p.keywords)) {
      patch.keywords = (p.keywords as unknown[]).filter((k): k is string => typeof k === "string");
    }
    try {
      await getStore().update(id, patch);
      respond(true, { ok: true, id }, undefined);
    } catch (err) {
      respond(false, undefined, storeErrorToShape(err));
    }
  },

  "projects.archive": async ({ params, respond }) => {
    const id = typeof params.id === "string" ? params.id.trim() : "";
    if (!id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
      return;
    }
    try {
      await getStore().archive(id);
      respond(true, { ok: true, id }, undefined);
    } catch (err) {
      respond(false, undefined, storeErrorToShape(err));
    }
  },

  "projects.bindSession": async ({ params, respond }) => {
    const p = params;
    const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey.trim() : "";
    const projectId = typeof p.projectId === "string" ? p.projectId.trim() : "";
    if (!sessionKey || !projectId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey and projectId are required"),
      );
      return;
    }
    try {
      const project = await getStore().get(projectId);
      sessionBindings.set(sessionKey, projectId);
      const injectedMessage = `[Session Init] Active project: ${projectId} | Path: ${project.path}`;
      respond(true, { projectId, path: project.path, injectedMessage }, undefined);
    } catch (err) {
      respond(false, undefined, storeErrorToShape(err));
    }
  },

  "projects.unbindSession": ({ params, respond }) => {
    const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
    if (!sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey is required"));
      return;
    }
    sessionBindings.delete(sessionKey);
    respond(true, { ok: true }, undefined);
  },

  "projects.getContext": async ({ params, respond }) => {
    const sessionKey = typeof params.sessionKey === "string" ? params.sessionKey.trim() : "";
    if (!sessionKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionKey is required"));
      return;
    }
    const projectId = sessionBindings.get(sessionKey);
    if (!projectId) {
      respond(true, null, undefined);
      return;
    }
    try {
      const entry = await getStore().list();
      const project = entry.find((e) => e.id === projectId) ?? null;
      respond(true, project, undefined);
    } catch (err) {
      respond(false, undefined, storeErrorToShape(err));
    }
  },
};

function storeErrorToShape(err: unknown) {
  if (err instanceof ProjectStoreError) {
    return errorShape(ErrorCodes.INVALID_REQUEST, err.message, { details: { code: err.code } });
  }
  const msg = err instanceof Error ? err.message : String(err);
  return errorShape(ErrorCodes.UNAVAILABLE, msg);
}
