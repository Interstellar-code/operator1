/**
 * CLI commands for Operator1Hub — browse, install, and manage hub items.
 *
 * All commands proxy through the gateway via RPC so the gateway handles
 * sync, integrity checks, and file placement consistently.
 */
import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { visibleWidth } from "../terminal/ansi.js";
import { formatDocsLink } from "../terminal/links.js";
import { colorize, isRich, theme } from "../terminal/theme.js";
import { addGatewayClientOptions, callGatewayFromCli, type GatewayRpcOpts } from "./gateway-rpc.js";
import { formatHelpExamples } from "./help-format.js";

// ── Types (mirror gateway responses) ─────────────────────────────────────────

type HubItemType = "skill" | "agent" | "command";

interface HubCatalogItem {
  slug: string;
  name: string;
  type: HubItemType;
  category: string;
  description: string | null;
  version: string;
  emoji: string | null;
  tags: string[];
  bundled: boolean;
  installed?: boolean;
  installedVersion?: string;
}

interface HubInstalledItem {
  slug: string;
  type: HubItemType;
  version: string;
  installPath: string;
  agentId: string | null;
  installedAt: number;
}

interface HubUpdateItem {
  slug: string;
  name: string;
  type: HubItemType;
  installedVersion: string;
  availableVersion: string;
  emoji: string | null;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function typeBadge(type: HubItemType, rich: boolean): string {
  const labels: Record<HubItemType, string> = {
    skill: "skill  ",
    agent: "agent  ",
    command: "command",
  };
  const colors: Record<HubItemType, (s: string) => string> = {
    skill: theme.accent,
    agent: theme.info,
    command: theme.accentDim,
  };
  return colorize(rich, colors[type], labels[type]);
}

function formatCatalogTable(items: HubCatalogItem[], opts: { json?: boolean }): void {
  if (opts.json) {
    defaultRuntime.log(JSON.stringify(items, null, 2));
    return;
  }

  const rich = isRich();
  const muted = (s: string) => colorize(rich, theme.muted, s);
  const success = (s: string) => colorize(rich, theme.success, s);
  const warn = (s: string) => colorize(rich, theme.warn, s);
  const heading = (s: string) => colorize(rich, theme.heading, s);

  if (items.length === 0) {
    defaultRuntime.log(muted("No items found. Run `operator1 hub sync` to fetch the catalog."));
    return;
  }

  const lines: string[] = [];
  lines.push(
    `${heading("TYPE   ")}  ${heading("SLUG")}${" ".repeat(28)}${heading("VERSION")}  ${heading("STATUS")}`,
  );
  lines.push(muted("─".repeat(72)));

  for (const item of items) {
    const emojiPrefix = item.emoji ? `${item.emoji} ` : "";
    const label = `${emojiPrefix}${item.name}`;
    // Use visibleWidth for ANSI-aware padding — muted() adds escape codes that break .padEnd()
    const rawName = item.slug + "  " + muted(label);
    const nameCol = rawName + " ".repeat(Math.max(0, 40 - visibleWidth(rawName)));

    let status = muted("available");
    if (item.bundled) {
      status = muted("bundled");
    } else if (item.installed) {
      const updateAvail = item.installedVersion && item.installedVersion !== item.version;
      status = updateAvail
        ? warn(`installed (${item.installedVersion} → ${item.version})`)
        : success("installed");
    }

    lines.push(
      `${typeBadge(item.type, rich)}  ${nameCol}  ${colorize(rich, theme.muted, item.version.padEnd(9))}  ${status}`,
    );

    if (item.description) {
      lines.push(`         ${muted(item.description)}`);
    }
  }

  defaultRuntime.log(lines.join("\n"));
}

function formatUpdates(items: HubUpdateItem[], opts: { json?: boolean }): void {
  if (opts.json) {
    defaultRuntime.log(JSON.stringify(items, null, 2));
    return;
  }

  const rich = isRich();
  const muted = (s: string) => colorize(rich, theme.muted, s);
  const warn = (s: string) => colorize(rich, theme.warn, s);
  const heading = (s: string) => colorize(rich, theme.heading, s);

  if (items.length === 0) {
    defaultRuntime.log(muted("All installed hub items are up to date."));
    return;
  }

  const lines: string[] = [];
  lines.push(
    `${heading("TYPE   ")}  ${heading("SLUG")}${" ".repeat(28)}${heading("INSTALLED")}  ${heading("AVAILABLE")}`,
  );
  lines.push(muted("─".repeat(72)));

  for (const item of items) {
    const emojiPrefix = item.emoji ? `${item.emoji} ` : "";
    const rawSlug = `${emojiPrefix}${item.slug}`;
    const slugCol = rawSlug + " ".repeat(Math.max(0, 32 - visibleWidth(rawSlug)));
    lines.push(
      `${typeBadge(item.type, rich)}  ${slugCol}  ${muted(item.installedVersion.padEnd(11))}  ${warn(item.availableVersion)}`,
    );
  }

  defaultRuntime.log(lines.join("\n"));
}

function formatInstalled(items: HubInstalledItem[], opts: { json?: boolean }): void {
  if (opts.json) {
    defaultRuntime.log(JSON.stringify(items, null, 2));
    return;
  }

  const rich = isRich();
  const muted = (s: string) => colorize(rich, theme.muted, s);
  const heading = (s: string) => colorize(rich, theme.heading, s);

  if (items.length === 0) {
    defaultRuntime.log(muted("Nothing installed from the hub yet."));
    return;
  }

  const lines: string[] = [];
  lines.push(
    `${heading("TYPE   ")}  ${heading("SLUG")}${" ".repeat(28)}${heading("VERSION")}  ${heading("AGENT")}`,
  );
  lines.push(muted("─".repeat(72)));

  for (const item of items) {
    const date = new Date(item.installedAt * 1000).toLocaleDateString();
    const agentLabel = item.agentId ? item.agentId : muted("global");
    lines.push(
      `${typeBadge(item.type, rich)}  ${item.slug.padEnd(32)}  ${colorize(rich, theme.muted, item.version.padEnd(9))}  ${agentLabel}  ${muted(date)}`,
    );
  }

  defaultRuntime.log(lines.join("\n"));
}

// ── Action helpers ────────────────────────────────────────────────────────────

async function runHubRpc<T>(
  method: string,
  params: Record<string, unknown>,
  opts: GatewayRpcOpts,
): Promise<T | null> {
  try {
    const result = await callGatewayFromCli(method, opts, params);
    return result as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    defaultRuntime.error(`hub error: ${msg}`);
    process.exitCode = 1;
    return null;
  }
}

// ── Register CLI ──────────────────────────────────────────────────────────────

export function registerHubCli(program: Command) {
  // C4: add gateway options to parent so default action and all subcommands can use them
  const hub = addGatewayClientOptions(
    program.command("hub").description("Browse, install, and manage Operator1Hub items"),
  ).addHelpText(
    "after",
    () =>
      `\n${theme.heading("Examples:")}\n${formatHelpExamples([
        ["operator1 hub sync", "Refresh the catalog from the hub registry."],
        ["operator1 hub list", "Show all available items."],
        ["operator1 hub list --type skill", "Show only skills."],
        ["operator1 hub search 'security'", "Search catalog by keyword."],
        ["operator1 hub install code-reviewer", "Install a skill."],
        ["operator1 hub install security-engineer --agent myagent", "Install an agent persona."],
        ["operator1 hub remove code-reviewer", "Remove an installed item."],
        ["operator1 hub installed", "List installed hub items."],
        ["operator1 hub updates", "Show available updates for installed items."],
      ])}\n\n${theme.muted("Docs:")} ${formatDocsLink("/cli/hub", "docs.openclaw.ai/cli/hub")}\n`,
  );

  // ── hub sync ──────────────────────────────────────────────────────────────

  addGatewayClientOptions(
    hub
      .command("sync")
      .description("Fetch latest catalog from the hub registry")
      .option("--force", "Force sync even if catalog is fresh", false)
      .option("--json", "Output as JSON", false),
  ).action(async (opts: GatewayRpcOpts & { force?: boolean }) => {
    const rich = isRich();
    const result = await runHubRpc<{
      synced: boolean;
      syncedAt: string;
      totalItems: number;
      bundledAgents: number;
      collections: number;
    }>("hub.sync", { force: Boolean(opts.force) }, opts);
    if (!result) {
      return;
    }

    if (opts.json) {
      defaultRuntime.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.synced) {
      defaultRuntime.log(
        colorize(rich, theme.success, `Hub catalog synced — ${result.totalItems} items`),
      );
    } else {
      defaultRuntime.log(
        colorize(rich, theme.muted, `Hub catalog is up to date (${result.totalItems} items)`),
      );
    }
  });

  // ── hub list ──────────────────────────────────────────────────────────────

  addGatewayClientOptions(
    hub
      .command("list")
      .description("List available hub items")
      .option("--type <type>", "Filter by type: skill, agent, command")
      .option("--category <cat>", "Filter by category")
      .option("--json", "Output as JSON", false),
  ).action(async (opts: GatewayRpcOpts & { type?: string; category?: string }) => {
    const params: Record<string, unknown> = {};
    if (opts.type) {
      params.type = opts.type;
    }
    if (opts.category) {
      params.category = opts.category;
    }

    // C2: fetch catalog + installed in parallel, then cross-reference installed status
    const [catalogResult, installedResult] = await Promise.all([
      runHubRpc<{ items: HubCatalogItem[] }>("hub.catalog", params, opts),
      runHubRpc<{ items: HubInstalledItem[] }>("hub.installed", {}, opts),
    ]);
    if (!catalogResult) {
      return;
    }
    const installedMap = new Map((installedResult?.items ?? []).map((i) => [i.slug, i]));
    const items = (catalogResult.items ?? []).map((item) => ({
      ...item,
      installed: installedMap.has(item.slug),
      installedVersion: installedMap.get(item.slug)?.version,
    }));
    formatCatalogTable(items, opts);
  });

  // ── hub search ────────────────────────────────────────────────────────────

  addGatewayClientOptions(
    hub
      .command("search")
      .description("Search the hub catalog")
      .argument("<query>", "Search term")
      .option("--json", "Output as JSON", false),
  ).action(async (query: string, opts: GatewayRpcOpts) => {
    // C2: fetch search results + installed in parallel, then cross-reference
    const [searchResult, installedResult] = await Promise.all([
      runHubRpc<{ items: HubCatalogItem[] }>("hub.search", { query }, opts),
      runHubRpc<{ items: HubInstalledItem[] }>("hub.installed", {}, opts),
    ]);
    if (!searchResult) {
      return;
    }
    const installedMap = new Map((installedResult?.items ?? []).map((i) => [i.slug, i]));
    const items = (searchResult.items ?? []).map((item) => ({
      ...item,
      installed: installedMap.has(item.slug),
      installedVersion: installedMap.get(item.slug)?.version,
    }));
    formatCatalogTable(items, opts);
  });

  // ── hub install ───────────────────────────────────────────────────────────

  addGatewayClientOptions(
    hub
      .command("install")
      .description("Install a hub item")
      .argument("<slug>", "Item slug")
      .option("--agent <id>", "Agent ID to install into (default: default agent)")
      .option("--json", "Output as JSON", false),
  ).action(async (slug: string, opts: GatewayRpcOpts & { agent?: string }) => {
    const rich = isRich();
    const params: Record<string, unknown> = { slug };
    if (opts.agent) {
      params.agentId = opts.agent;
    }

    const result = await runHubRpc<{
      ok: boolean;
      slug: string;
      type: string;
      version: string;
      installPath: string;
      bundled?: boolean;
    }>("hub.install", params, opts);

    if (!result) {
      return;
    }
    if (opts.json) {
      defaultRuntime.log(JSON.stringify(result, null, 2));
      return;
    }
    if (result.bundled) {
      defaultRuntime.log(
        colorize(rich, theme.muted, `${slug} is bundled — already available locally`),
      );
    } else {
      defaultRuntime.log(
        colorize(rich, theme.success, `Installed ${result.type} "${slug}" v${result.version}`),
      );
      defaultRuntime.log(colorize(rich, theme.muted, `  → ${result.installPath}`));
    }
  });

  // ── hub remove ────────────────────────────────────────────────────────────

  addGatewayClientOptions(
    hub
      .command("remove")
      .description("Remove an installed hub item")
      .argument("<slug>", "Item slug")
      .option("--json", "Output as JSON", false),
  ).action(async (slug: string, opts: GatewayRpcOpts) => {
    const rich = isRich();
    const result = await runHubRpc<{ ok: boolean; slug: string }>("hub.remove", { slug }, opts);
    if (!result) {
      return;
    }
    if (opts.json) {
      defaultRuntime.log(JSON.stringify(result, null, 2));
      return;
    }
    defaultRuntime.log(colorize(rich, theme.success, `Removed "${slug}"`));
  });

  // ── hub installed ─────────────────────────────────────────────────────────

  addGatewayClientOptions(
    hub
      .command("installed")
      .description("List installed hub items")
      .option("--json", "Output as JSON", false),
  ).action(async (opts: GatewayRpcOpts) => {
    const result = await runHubRpc<{ items: HubInstalledItem[] }>("hub.installed", {}, opts);
    if (!result) {
      return;
    }
    formatInstalled(result.items ?? [], opts);
  });

  // ── hub updates ───────────────────────────────────────────────────────────

  addGatewayClientOptions(
    hub
      .command("updates")
      .description("Show available updates for installed hub items")
      .option("--json", "Output as JSON", false),
  ).action(async (opts: GatewayRpcOpts) => {
    const result = await runHubRpc<{ updates: HubUpdateItem[] }>("hub.updates", {}, opts);
    if (!result) {
      return;
    }
    formatUpdates(result.updates ?? [], opts);
  });

  // C4: Default action — uses gateway options registered on the parent hub command
  hub.action(async (opts: GatewayRpcOpts) => {
    const rich = isRich();
    // C2: cross-reference with installed
    const [catalogResult, installedResult] = await Promise.all([
      runHubRpc<{ items: HubCatalogItem[] }>("hub.catalog", {}, opts),
      runHubRpc<{ items: HubInstalledItem[] }>("hub.installed", {}, opts),
    ]);
    if (!catalogResult) {
      return;
    }
    const installedMap = new Map((installedResult?.items ?? []).map((i) => [i.slug, i]));
    const items = (catalogResult.items ?? []).map((item) => ({
      ...item,
      installed: installedMap.has(item.slug),
      installedVersion: installedMap.get(item.slug)?.version,
    }));
    formatCatalogTable(items, opts);
    if (items.length === 0) {
      defaultRuntime.log(
        colorize(rich, theme.muted, "\nRun `operator1 hub sync` to fetch the catalog."),
      );
    }
  });
}
