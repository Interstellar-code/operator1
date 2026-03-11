import os from "node:os";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { resolveCliSpawnInvocation, runCliCommand } from "../../memory/qmd-process.js";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { ToolInputError, readStringParam } from "./common.js";

const MCPORTER_TIMEOUT_MS = 30_000;
const MCPORTER_MAX_OUTPUT_CHARS = 200_000;
const ZREAD_SERVER = "zai-zread";

const GithubReadSchema = Type.Object({
  action: stringEnum(["search_doc", "read_file", "get_repo_structure"], {
    description:
      "search_doc: search docs/issues/commits; read_file: get file content; get_repo_structure: list directory tree",
  }),
  repo: Type.String({
    description: 'GitHub repository in owner/repo format (e.g. "vitejs/vite")',
  }),
  query: Type.Optional(
    Type.String({
      description: "Search keywords or question (required for search_doc)",
    }),
  ),
  file_path: Type.Optional(
    Type.String({
      description: 'Relative file path (required for read_file, e.g. "src/index.ts")',
    }),
  ),
  dir_path: Type.Optional(
    Type.String({
      description: 'Directory path to inspect for get_repo_structure (default: "/")',
    }),
  ),
  language: optionalStringEnum(["en", "zh"], {
    description: "Response language for search_doc (default: en)",
  }),
});

export function createGithubReadTool(): AnyAgentTool {
  return {
    name: "github_read",
    label: "github_read",
    description:
      "Explore GitHub repositories: search docs/issues/commits, read file contents, or browse directory structure. Powered by Z.AI zread.",
    parameters: GithubReadSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const repo = readStringParam(params, "repo", { required: true });

      if (!action || !["search_doc", "read_file", "get_repo_structure"].includes(action)) {
        throw new ToolInputError(
          "action must be one of: search_doc, read_file, get_repo_structure",
        );
      }
      if (!repo.includes("/")) {
        throw new ToolInputError('repo must be in owner/repo format (e.g. "vitejs/vite")');
      }

      // Build mcporter call args
      const callArgs: string[] = ["call", `${ZREAD_SERVER}.${action}`, `repo_name=${repo}`];

      if (action === "search_doc") {
        const query = readStringParam(params, "query");
        if (!query) {
          throw new ToolInputError("query is required for search_doc");
        }
        callArgs.push(`query=${query}`);
        const language = readStringParam(params, "language");
        if (language) {
          callArgs.push(`language=${language}`);
        }
      } else if (action === "read_file") {
        const filePath = readStringParam(params, "file_path");
        if (!filePath) {
          throw new ToolInputError("file_path is required for read_file");
        }
        callArgs.push(`file_path=${filePath}`);
      } else if (action === "get_repo_structure") {
        const dirPath = readStringParam(params, "dir_path");
        if (dirPath) {
          callArgs.push(`dir_path=${dirPath}`);
        }
      }

      // Augment PATH so mcporter can find node when gateway runs as a mac app
      // (launchd gives a minimal PATH that may not include node or pnpm bins).
      const nodeBinDir = path.dirname(process.execPath);
      const pnpmBinDir = path.join(os.homedir(), "Library", "pnpm");
      const augmentedPath = [nodeBinDir, pnpmBinDir, process.env.PATH ?? ""]
        .filter(Boolean)
        .join(path.delimiter);
      const spawnEnv = { ...process.env, PATH: augmentedPath };

      const spawnInvocation = resolveCliSpawnInvocation({
        command: "mcporter",
        args: callArgs,
        env: spawnEnv,
        packageName: "mcporter",
      });

      const { stdout } = await runCliCommand({
        commandSummary: `mcporter ${callArgs.join(" ")}`,
        spawnInvocation,
        env: spawnEnv,
        cwd: process.cwd(),
        timeoutMs: MCPORTER_TIMEOUT_MS,
        maxOutputChars: MCPORTER_MAX_OUTPUT_CHARS,
      });

      // mcporter outputs a JSON-encoded string — unwrap one layer if needed
      let result = stdout.trim();
      try {
        const parsed = JSON.parse(result);
        if (typeof parsed === "string") {
          result = parsed;
        }
      } catch {
        // not JSON, use raw stdout
      }

      return {
        content: [{ type: "text", text: result }],
        details: { action, repo },
      };
    },
  };
}
