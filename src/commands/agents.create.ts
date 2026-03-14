/**
 * CLI command: `openclaw agents create`
 *
 * Interactive wizard for creating a new agent from a persona template.
 * Browses persona categories, picks a persona, expands files, and writes
 * AGENT.md + workspace bootstrap files to disk.
 */
import fs from "node:fs/promises";
import { join } from "node:path";
import { expandPersona, loadPersonaBySlug } from "../agents/persona-expansion.js";
import { normalizeAgentId, DEFAULT_AGENT_ID } from "../routing/session-key.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { createClackPrompter } from "../wizard/clack-prompter.js";
import { WizardCancelledError } from "../wizard/prompts.js";

function resolvePersonasDir(): string {
  return join(import.meta.dirname, "..", "..", "agents", "personas");
}

function resolveAgentsRoot(): string {
  return join(import.meta.dirname, "..", "..", "agents");
}

type IndexEntry = {
  slug: string;
  name: string;
  description: string;
  category: string;
  emoji: string;
  tags?: string[];
};

type CategoryEntry = { slug: string; name: string; count: number };

async function loadIndex(): Promise<{
  personas: IndexEntry[];
  categories: CategoryEntry[];
} | null> {
  try {
    const content = await fs.readFile(join(resolvePersonasDir(), "_index.json"), "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const DANGEROUS_TOOLS = new Set(["exec", "browser"]);

export async function agentsCreateCommand(runtime: RuntimeEnv = defaultRuntime) {
  const prompter = createClackPrompter();

  try {
    await prompter.intro("Create a new agent");

    // ── Load persona index ──────────────────────────────────────────────
    const index = await loadIndex();
    if (!index) {
      runtime.error("Persona index not found. Run the persona indexer first.");
      runtime.exit(1);
      return;
    }

    // ── Pick category or skip ───────────────────────────────────────────
    const categoryOptions = [
      { value: "__skip__", label: "Skip persona", hint: "Create a blank agent" },
      ...index.categories.map((c) => ({
        value: c.slug,
        label: c.name,
        hint: `${c.count} personas`,
      })),
    ];

    const category = await prompter.select({
      message: "Choose a persona category",
      options: categoryOptions,
    });

    let personaSlug: string | null = null;

    if (category !== "__skip__") {
      // ── Pick persona from category ──────────────────────────────────
      const filtered = index.personas.filter((p) => p.category === category);
      if (filtered.length === 0) {
        runtime.error(`No personas found in category "${category}".`);
        runtime.exit(1);
        return;
      }

      const personaChoice = await prompter.select({
        message: "Choose a persona",
        options: filtered.map((p) => ({
          value: p.slug,
          label: `${p.emoji} ${p.name}`,
          hint: p.description,
        })),
      });
      personaSlug = String(personaChoice);
    }

    // ── Agent name + id ─────────────────────────────────────────────────
    const nameInput = await prompter.text({
      message: "Agent name",
      placeholder: personaSlug ?? "my-agent",
      validate: (value) => {
        if (!value?.trim()) {
          return "Required";
        }
        const normalized = normalizeAgentId(value);
        if (normalized === DEFAULT_AGENT_ID) {
          return `"${DEFAULT_AGENT_ID}" is reserved.`;
        }
        return undefined;
      },
    });

    const agentName = String(nameInput).trim();
    const agentId = normalizeAgentId(agentName);
    if (agentName !== agentId) {
      await prompter.note(`Normalized id to "${agentId}".`, "Agent id");
    }

    // ── Blank agent (no persona) ────────────────────────────────────────
    if (!personaSlug) {
      const agentDir = join(resolveAgentsRoot(), agentId);
      const agentMdPath = join(agentDir, "AGENT.md");
      const blankMd = `---\nid: ${agentId}\nname: ${agentName}\n---\n\n# ${agentName}\n\nCustomize this agent.\n`;

      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(agentMdPath, blankMd, "utf-8");
      await prompter.outro(`Agent "${agentId}" created at agents/${agentId}/AGENT.md`);
      return;
    }

    // ── Load and expand persona ─────────────────────────────────────────
    const personasDir = resolvePersonasDir();
    const persona = await loadPersonaBySlug(personasDir, personaSlug);
    if ("error" in persona) {
      runtime.error(persona.error);
      runtime.exit(1);
      return;
    }

    // Show confirmation
    const fm = persona.frontmatter;
    await prompter.note(
      [
        `Persona: ${fm.emoji} ${fm.name}`,
        `Role: ${fm.role}`,
        `Department: ${fm.department}`,
        fm.tools?.length ? `Tools: ${fm.tools.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      "Selected persona",
    );

    // ── Dangerous tool warning ──────────────────────────────────────────
    const dangerous = (fm.tools ?? []).filter((t) => DANGEROUS_TOOLS.has(t));
    if (dangerous.length > 0) {
      const proceed = await prompter.confirm({
        message: `This persona uses powerful tools (${dangerous.join(", ")}). Continue?`,
        initialValue: true,
      });
      if (!proceed) {
        await prompter.outro("Cancelled.");
        return;
      }
    }

    // ── Expand persona files ────────────────────────────────────────────
    const progress = prompter.progress("Expanding persona...");
    const result = await expandPersona(persona, { agentName, agentId });
    progress.stop("Persona expanded.");

    if ("error" in result) {
      runtime.error(result.error);
      runtime.exit(1);
      return;
    }

    // ── Write files ─────────────────────────────────────────────────────
    const agentDir = join(resolveAgentsRoot(), agentId);
    await fs.mkdir(agentDir, { recursive: true });

    // AGENT.md
    const agentMdPath = join(agentDir, "AGENT.md");
    await fs.writeFile(agentMdPath, result.agentMd, "utf-8");
    runtime.log(`  agents/${agentId}/AGENT.md`);

    // Workspace files
    for (const file of result.workspaceFiles) {
      const filePath = join(agentDir, file.name);
      await fs.writeFile(filePath, file.content, "utf-8");
      runtime.log(`  agents/${agentId}/${file.name}`);
    }

    await prompter.outro(`Agent "${agentId}" created with ${fm.name} persona.`);
  } catch (err) {
    if (err instanceof WizardCancelledError) {
      runtime.exit(1);
      return;
    }
    throw err;
  }
}
