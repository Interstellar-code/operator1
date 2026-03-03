import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { theme } from "../terminal/theme.js";
import { runCommandWithRuntime } from "./cli-utils.js";
import { formatHelpExamples } from "./help-format.js";

export function registerMatrixCli(program: Command) {
  const matrix = program
    .command("matrix")
    .description("Initialize the Matrix multi-agent hierarchy")
    .addHelpText(
      "after",
      () =>
        `\n${theme.muted("Docs:")} ${formatDocsLink("/concepts/multi-agent", "docs.openclaw.ai/concepts/multi-agent")}\n`,
    );

  matrix
    .command("init")
    .description("Create all 13 Matrix agents and bootstrap workspaces")
    .option("--non-interactive", "Skip confirmation prompts", false)
    .option("--json", "Output JSON summary", false)
    .option("--with-cron", "Deploy daily memory cron jobs (requires running gateway)", false)
    .addHelpText(
      "after",
      () =>
        `
${theme.heading("Examples:")}
${formatHelpExamples([
  ["openclaw matrix init", "Set up the full Matrix agent hierarchy."],
  ["openclaw matrix init --non-interactive", "Skip confirmation prompts."],
  ["openclaw matrix init --json", "Output setup summary as JSON."],
  ["openclaw matrix init --with-cron", "Also deploy memory maintenance + sync cron jobs."],
])}

${theme.heading("Hierarchy:")}
  Operator1 (Tier 1 — Orchestrator)
  ├── Neo       (Tier 2 — CTO, Engineering)
  ├── Morpheus  (Tier 2 — CMO, Marketing)
  └── Trinity   (Tier 2 — CFO, Finance)
        Tank, Dozer, Mouse, Niobe, Switch, Rex, Oracle, Seraph, Zee (Tier 3 — Workers)
`,
    )
    .action(async (opts) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { matrixInitCommand } = await import("../commands/matrix-init.js");
        await matrixInitCommand(
          {
            nonInteractive: Boolean(opts.nonInteractive),
            json: Boolean(opts.json),
            withCron: Boolean(opts.withCron),
          },
          defaultRuntime,
        );
      });
    });

  matrix.action(async () => {
    matrix.outputHelp();
  });
}
