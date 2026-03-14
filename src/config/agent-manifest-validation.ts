/**
 * Agent manifest validation utilities.
 *
 * Validates agent manifests and AGENT.md files, enforces tier
 * dependencies, and checks permission escalation rules.
 *
 * Supports two formats:
 * - **Unified** (preferred): single AGENT.md with YAML frontmatter + markdown body
 * - **Legacy**: separate agent.yaml + AGENT.md (no frontmatter)
 */
import { readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { AgentManifestSchema, type AgentManifest } from "./zod-schema.agent-manifest.js";

export type { AgentManifest };

// ── AGENT.md frontmatter parsing ─────────────────────────────────────────────

const FRONTMATTER_RE = /^---\s*\n/;
const FRONTMATTER_SPLIT_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

/**
 * Check whether an AGENT.md file contains YAML frontmatter.
 */
export function hasAgentMdFrontmatter(content: string): boolean {
  return FRONTMATTER_RE.test(content);
}

/**
 * Parse a unified AGENT.md file (YAML frontmatter + markdown body).
 * Returns the parsed frontmatter object and the markdown body, or an error.
 */
export function parseUnifiedAgentMd(content: string):
  | {
      frontmatter: Record<string, unknown>;
      body: string;
    }
  | { error: string } {
  const match = FRONTMATTER_SPLIT_RE.exec(content);
  if (!match) {
    return { error: "AGENT.md has opening --- but missing closing --- delimiter" };
  }
  const [, yamlBlock, body] = match;
  let frontmatter: unknown;
  try {
    frontmatter = parseYaml(yamlBlock);
  } catch (err) {
    return { error: `Invalid YAML in AGENT.md frontmatter: ${(err as Error).message}` };
  }
  if (!frontmatter || typeof frontmatter !== "object") {
    return { error: "AGENT.md frontmatter must be a YAML object" };
  }
  return { frontmatter: frontmatter as Record<string, unknown>, body: body.trimStart() };
}

/**
 * Validate that a legacy AGENT.md file contains only prompt content
 * (no YAML frontmatter). In legacy mode, all structured metadata lives
 * in agent.yaml.
 */
export function validateLegacyAgentMd(content: string): { valid: boolean; error?: string } {
  if (FRONTMATTER_RE.test(content)) {
    return {
      valid: false,
      error:
        "AGENT.md contains YAML frontmatter but no agent.yaml was found. " +
        "Either use unified format (frontmatter in AGENT.md) or legacy format (agent.yaml + plain AGENT.md).",
    };
  }
  return { valid: true };
}

/**
 * @deprecated Use `validateLegacyAgentMd` instead. Kept for backward compatibility.
 */
export const validateAgentMd = validateLegacyAgentMd;

// ── agent.yaml validator ─────────────────────────────────────────────────────

export interface ManifestValidationResult {
  valid: boolean;
  manifest?: AgentManifest;
  errors: string[];
}

/**
 * Parse and validate an agent.yaml file against the manifest schema.
 */
export function validateManifestYaml(yamlContent: string): ManifestValidationResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (err) {
    return { valid: false, errors: [`Invalid YAML: ${(err as Error).message}`] };
  }

  const result = AgentManifestSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    return { valid: false, errors };
  }

  return { valid: true, manifest: result.data, errors: [] };
}

// ── Tier enforcement ─────────────────────────────────────────────────────────

export interface TierValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate tier dependencies across a set of installed agents.
 *
 * Rules:
 * - Tier 1 (core): always present, cannot be removed
 * - Tier 2: can be installed independently
 * - Tier 3: requires parent Tier 2 agent to be installed
 */
export function validateTierDependencies(agents: AgentManifest[]): TierValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  for (const agent of agents) {
    if (agent.tier === 3 && agent.requires) {
      const parent = agentMap.get(agent.requires);
      if (!parent) {
        errors.push(
          `Agent "${agent.id}" (Tier 3) requires "${agent.requires}" which is not installed`,
        );
      } else if (parent.tier !== 2) {
        errors.push(
          `Agent "${agent.id}" requires "${agent.requires}" which is Tier ${parent.tier}, not Tier 2`,
        );
      }
    }

    if (agent.deprecated) {
      warnings.push(
        `Agent "${agent.id}" is deprecated` +
          (agent.sunset_date ? ` (sunset: ${agent.sunset_date})` : "") +
          (agent.replacement ? `. Replacement: ${agent.replacement}` : ""),
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Check whether an agent can be safely removed without breaking dependents.
 * Returns the list of agents that depend on it.
 */
export function findDependents(agentId: string, agents: AgentManifest[]): AgentManifest[] {
  return agents.filter((a) => a.requires === agentId);
}

/**
 * Check whether installing an agent would satisfy its tier dependencies,
 * given the currently installed agents.
 */
export function canInstall(
  manifest: AgentManifest,
  installedAgents: AgentManifest[],
): { ok: boolean; missingDep?: string } {
  if (manifest.tier === 3 && manifest.requires) {
    const parentInstalled = installedAgents.some((a) => a.id === manifest.requires);
    if (!parentInstalled) {
      return { ok: false, missingDep: manifest.requires };
    }
  }
  return { ok: true };
}

// ── Permission escalation check (for extends) ───────────────────────────────

/**
 * Validate that a child agent does not escalate permissions beyond the
 * parent agent's tools.allow list. Child agents can only restrict, not expand.
 */
export function validatePermissionEscalation(
  child: AgentManifest,
  parent: AgentManifest,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const parentAllow = new Set(parent.tools?.allow ?? []);

  if (child.overrides?.tools?.allow) {
    for (const tool of child.overrides.tools.allow) {
      if (!parentAllow.has(tool)) {
        errors.push(
          `Child agent "${child.id}" cannot grant tool "${tool}" — parent "${parent.id}" does not allow it`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Load agent from directory ────────────────────────────────────────────────

export interface LoadAgentResult {
  manifest?: AgentManifest;
  promptContent?: string;
  /** Whether the agent was loaded from unified AGENT.md format (true) or legacy two-file format (false). */
  unified?: boolean;
  errors: string[];
}

/**
 * Load and validate an agent from a directory.
 *
 * Tries unified format first (AGENT.md with YAML frontmatter), then falls
 * back to legacy two-file format (agent.yaml + plain AGENT.md).
 */
export async function loadAgentFromDir(agentDir: string): Promise<LoadAgentResult> {
  // Try AGENT.md first
  let mdContent: string | undefined;
  try {
    mdContent = await readFile(join(agentDir, "AGENT.md"), "utf-8");
  } catch {
    // No AGENT.md at all
  }

  // If AGENT.md has frontmatter, use unified format
  if (mdContent !== undefined && hasAgentMdFrontmatter(mdContent)) {
    return loadUnifiedAgent(mdContent, agentDir);
  }

  // Otherwise, try legacy format (agent.yaml + optional plain AGENT.md)
  return loadLegacyAgent(mdContent, agentDir);
}

/**
 * Load agent from unified AGENT.md (frontmatter + body).
 */
function loadUnifiedAgent(mdContent: string, _agentDir: string): LoadAgentResult {
  const parsed = parseUnifiedAgentMd(mdContent);
  if ("error" in parsed) {
    return { errors: [parsed.error] };
  }

  const result = AgentManifestSchema.safeParse(parsed.frontmatter);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
    return { errors };
  }

  return {
    manifest: result.data,
    promptContent: parsed.body,
    unified: true,
    errors: [],
  };
}

/**
 * Load agent from legacy two-file format (agent.yaml + optional plain AGENT.md).
 */
async function loadLegacyAgent(
  mdContent: string | undefined,
  agentDir: string,
): Promise<LoadAgentResult> {
  const errors: string[] = [];

  // Load agent.yaml
  let yamlContent: string;
  try {
    yamlContent = await readFile(join(agentDir, "agent.yaml"), "utf-8");
  } catch {
    if (mdContent !== undefined) {
      return {
        errors: [`AGENT.md in ${basename(agentDir)} has no frontmatter and no agent.yaml found`],
      };
    }
    return { errors: [`Missing agent.yaml in ${basename(agentDir)}`] };
  }

  const yamlResult = validateManifestYaml(yamlContent);
  if (!yamlResult.valid) {
    return { errors: yamlResult.errors };
  }

  // Validate AGENT.md is plain content (no frontmatter) in legacy mode
  let promptContent: string | undefined;
  if (mdContent !== undefined) {
    const mdResult = validateLegacyAgentMd(mdContent);
    if (!mdResult.valid) {
      errors.push(mdResult.error!);
    } else {
      promptContent = mdContent;
    }
  }

  return { manifest: yamlResult.manifest, promptContent, unified: false, errors };
}
