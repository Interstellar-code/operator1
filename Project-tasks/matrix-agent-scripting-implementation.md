# Matrix Agent Scripting Implementation Guide

**Created:** 2026-03-06  
**Author:** Neo (CTO)  
**Status:** Draft  
**Related:** `Project-tasks/matrix/`, `~/dev/operator1/scripts/`

---

## 1. Problem Statement

### The Consistency Gap

Operator1's instructions in `SOUL.md` and `AGENTS.md` are comprehensive, but LLMs don't always follow them strictly. This manifests as:

1. **Missed steps** — Agent skips reading required files before starting
2. **Drift from protocol** — Delegation rules followed inconsistently
3. **Context loss** — Session-to-session continuity breaks
4. **Format variations** — Output structure differs between sessions
5. **Self-assessment bypass** — The mandatory "which department?" check gets skipped

### Why Instructions Alone Aren't Enough

| Issue                                     | Root Cause                    | Script Solution                              |
| ----------------------------------------- | ----------------------------- | -------------------------------------------- |
| Agent doesn't read `memory/YYYY-MM-DD.md` | "Just do it" isn't enforced   | Script fails if memory check not done        |
| Project setup missing files               | Steps forgotten               | Script creates all required files atomically |
| Gateway config typos                      | Manual JSON editing           | Script generates valid JSON from template    |
| Inconsistent agent labels                 | No naming convention enforced | Script generates unique labels automatically |

### The Goal

**Scripts become the enforcement layer.** Instructions describe _what_ and _why_. Scripts ensure _how_.

---

## 2. Proposed Solution: Script-Augmented Operations

### Philosophy

```
Instructions = Intent
Scripts = Enforcement
Agent = Orchestrator (calls scripts, doesn't improvise)
```

When an operation has a script, the agent MUST use it. The script becomes the single source of truth for that operation's execution.

### Benefits

1. **Determinism** — Same input → same output, regardless of agent
2. **Validation** — Scripts catch errors before they propagate
3. **Auditability** — Script logs show exactly what was done
4. **Evolution** — Improve process by updating one script, not retraining agents
5. **Safety** — Dangerous operations require script invocation (with flags)

### When to Script vs. When to Instruct

| Script It                  | Keep as Instructions      |
| -------------------------- | ------------------------- |
| Multi-step file operations | Decision frameworks       |
| Configuration generation   | Communication style       |
| Template instantiation     | Delegation philosophy     |
| Validation/verification    | Cross-department protocol |
| Idempotent setup tasks     | Ad-hoc reasoning          |

---

## 3. Candidate Operations for Scripting

### Tier 1: High-Impact, Frequent Operations

| Operation                  | Script Name           | Trigger                         |
| -------------------------- | --------------------- | ------------------------------- |
| New project setup          | `project-setup.ts`    | Operator1 registers new project |
| Agent workspace bootstrap  | `agent-bootstrap.ts`  | New agent added to matrix       |
| Memory file initialization | `init-memory.ts`      | New agent workspace created     |
| PROJECTS.md registration   | `register-project.ts` | Project folder discovered       |

### Tier 2: Configuration Operations

| Operation                 | Script Name                 | Trigger                         |
| ------------------------- | --------------------------- | ------------------------------- |
| Gateway config generation | `gen-gateway-config.ts`     | Agent hierarchy changes         |
| Collocated agent config   | `gen-collocated-config.ts`  | Multiple agents on same gateway |
| Independent agent config  | `gen-independent-config.ts` | Agent on separate gateway       |
| Agent spawn template      | `gen-spawn-template.ts`     | New worker agent type needed    |

### Tier 3: Maintenance Operations

| Operation                | Script Name             | Trigger                |
| ------------------------ | ----------------------- | ---------------------- |
| Memory consolidation     | `consolidate-memory.ts` | Heartbeat or scheduled |
| Session registry cleanup | `cleanup-sessions.ts`   | Periodic               |
| Agent health check       | `agent-health.ts`       | Heartbeat              |
| Context sync             | `sync-context.ts`       | Before delegation      |

### Tier 4: Domain-Specific Operations (Future)

| Domain                 | Script Name                | Trigger           |
| ---------------------- | -------------------------- | ----------------- |
| CRM invoice generation | `crm-gen-invoice.ts`       | Trinity workflow  |
| CRM expense logging    | `crm-log-expense.ts`       | Trinity workflow  |
| Content calendar sync  | `content-calendar-sync.ts` | Morpheus workflow |
| Deploy prep checklist  | `deploy-prep.ts`           | Neo workflow      |

---

## 4. Script Architecture

### Location

```
~/dev/operator1/
├── scripts/
│   ├── matrix/                    # Matrix-specific scripts
│   │   ├── project-setup.ts       # Tier 1
│   │   ├── agent-bootstrap.ts     # Tier 1
│   │   ├── init-memory.ts         # Tier 1
│   │   ├── register-project.ts    # Tier 1
│   │   ├── gen-gateway-config.ts  # Tier 2
│   │   ├── gen-spawn-template.ts  # Tier 2
│   │   ├── consolidate-memory.ts  # Tier 3
│   │   └── agent-health.ts        # Tier 3
│   └── lib/                       # Shared utilities
│       ├── matrix-helpers.ts      # Common functions
│       ├── validators.ts          # Input validation
│       └── templates/             # File templates
│           ├── AGENTS.md.tpl
│           ├── SOUL.md.tpl
│           ├── MEMORY.md.tpl
│           └── PROJECTS.md.entry.tpl
```

### Naming Conventions

| Pattern         | Meaning                             | Example                 |
| --------------- | ----------------------------------- | ----------------------- |
| `setup-*.ts`    | Idempotent initialization           | `setup-project.ts`      |
| `gen-*.ts`      | Generate output (to stdout or file) | `gen-gateway-config.ts` |
| `init-*.ts`     | Create from template                | `init-memory.ts`        |
| `validate-*.ts` | Check and report issues             | `validate-config.ts`    |
| `cleanup-*.ts`  | Remove stale state                  | `cleanup-sessions.ts`   |
| `sync-*.ts`     | Two-way reconciliation              | `sync-context.ts`       |
| `*-health.ts`   | Health/status check                 | `agent-health.ts`       |

### Script Interface Standard

All scripts follow this interface:

```bash
# Standard flags (all scripts should support these)
--dry-run         # Show what would be done, don't execute
--json            # Output as JSON (for agent parsing)
--verbose         # Detailed logging
--help            # Usage documentation

# Example invocation
npx tsx scripts/matrix/project-setup.ts \
  --name "my-app" \
  --type "web" \
  --path "~/dev/my-app" \
  --dry-run
```

### How Agents Invoke Scripts

Agents use the `exec` tool:

```typescript
// In agent's task execution
const result = await exec({
  command: `npx tsx ~/dev/operator1/scripts/matrix/project-setup.ts --name "subzero" --type "saas" --json`,
  workdir: "~/dev/operator1",
});

// Parse JSON output
const output = JSON.parse(result.stdout);
if (output.success) {
  // Continue with project context
} else {
  // Handle error, report to user
}
```

### Validation & Error Handling

Scripts must:

1. **Validate inputs** — Fail fast with clear error messages
2. **Check preconditions** — E.g., path exists, required files present
3. **Be idempotent** — Running twice produces same result
4. **Atomic operations** — All-or-nothing file creation
5. **Structured output** — JSON for programmatic consumption

Error output format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Project name contains invalid characters",
    "field": "name",
    "validPattern": "^[a-z0-9-]+$"
  }
}
```

Success output format:

```json
{
  "success": true,
  "created": ["~/dev/subzero-app/.openclaw/AGENTS.md", "~/dev/subzero-app/.openclaw/SOUL.md"],
  "registered": {
    "projectId": "subzero",
    "path": "~/dev/subzero-app"
  }
}
```

---

## 5. Implementation Phases

### Phase 1: Project Setup Script (Week 1)

**Goal:** Eliminate manual project registration errors

**Deliverables:**

- `scripts/matrix/project-setup.ts`
- `scripts/lib/templates/AGENTS.md.tpl`
- `scripts/lib/templates/PROJECTS.md.entry.tpl`

**What it does:**

1. Validates project name and path
2. Creates `.openclaw/` directory structure
3. Instantiates role-appropriate `AGENTS.md` from template
4. Creates initial `memory/YYYY-MM-DD.md`
5. Appends entry to `PROJECTS.md`
6. Returns structured success/error

**Usage:**

```bash
npx tsx scripts/matrix/project-setup.ts \
  --name "acme-dashboard" \
  --path "~/dev/acme-dashboard" \
  --type "web" \
  --owner "neo"
```

### Phase 2: Gateway Config Scripts (Week 2)

**Goal:** Eliminate JSON typos in multi-agent configurations

**Deliverables:**

- `scripts/matrix/gen-gateway-config.ts`
- `scripts/matrix/gen-collocated-config.ts`
- `scripts/matrix/gen-independent-config.ts`

**What they do:**

1. Read agent definitions from template
2. Generate valid OpenClaw config JSON
3. Validate against schema
4. Support both collocated and distributed setups

**Usage:**

```bash
# Generate config for collocated Matrix setup
npx tsx scripts/matrix/gen-collocated-config.ts \
  --agents "neo,morpheus,trinity" \
  --workers "tank,dozer,mouse,niobe,switch,rex,oracle,seraph,zee" \
  --output ~/.openclaw/matrix-agents.json
```

### Phase 3: Agent Spawning Helpers (Week 3)

**Goal:** Consistent delegation with proper context passing

**Deliverables:**

- `scripts/matrix/gen-spawn-template.ts`
- `scripts/matrix/sync-context.ts`

**What they do:**

1. Generate properly formatted task strings with project context
2. Create unique labels (timestamp-based)
3. Sync context from parent to child session
4. Validate delegation chain depth

**Usage:**

```bash
# Generate spawn context for Tank
npx tsx scripts/matrix/gen-spawn-template.ts \
  --agent "tank" \
  --project "subzero" \
  --task "Add rate limiting to API" \
  --classification "medium"
```

### Phase 4: Domain-Specific Scripts (Week 4+)

**Goal:** Consistency in department-specific operations

**Deliverables (examples):**

- `scripts/crm/gen-invoice.ts` (Trinity's domain)
- `scripts/crm/log-expense.ts` (Trinity's domain)
- `scripts/content/sync-calendar.ts` (Morpheus's domain)
- `scripts/deploy/prep-checklist.ts` (Neo's domain)

These scripts are owned by respective department heads and invoked via delegation.

---

## 6. Examples

### Example 1: `project-setup.ts`

```typescript
#!/usr/bin/env npx tsx
/**
 * project-setup.ts - Initialize a new project for Matrix agent operations
 *
 * Usage:
 *   npx tsx project-setup.ts --name <name> --path <path> [--type <type>] [--owner <agent>]
 *
 * Flags:
 *   --name     Project identifier (lowercase, hyphens only)
 *   --path     Absolute or ~-relative path to project root
 *   --type     Project type (web, api, mobile, cli, library) [default: web]
 *   --owner    Primary agent responsible [default: neo]
 *   --dry-run  Show what would be created without writing
 *   --json     Output as JSON
 *   --verbose  Detailed logging
 */

import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync, existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve, expandTilde } from "../lib/path-helpers";
import { validateProjectName, validatePath } from "../lib/validators";

const TEMPLATES = {
  AGENTS_MD: `# AGENTS.md — {projectName}

## Project Context

- **Type:** {projectType}
- **Owner:** {owner}
- **Created:** {date}

## Conventions

*Project-specific conventions go here.*

## Memory

Daily notes: \`memory/YYYY-MM-DD.md\`
`,

  MEMORY_ENTRY: `# {date}

## Project Initialized

- Type: {projectType}
- Owner: {owner}
- Setup: Automated via project-setup.ts
`,
};

interface ProjectSetupResult {
  success: boolean;
  created?: string[];
  registered?: {
    projectId: string;
    path: string;
  };
  error?: {
    code: string;
    message: string;
    field?: string;
  };
}

async function main(): Promise<ProjectSetupResult> {
  const { values } = parseArgs({
    options: {
      name: { type: "string", short: "n" },
      path: { type: "string", short: "p" },
      type: { type: "string", default: "web" },
      owner: { type: "string", default: "neo" },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`Usage: npx tsx project-setup.ts --name <name> --path <path>`);
    process.exit(0);
  }

  // Validation
  const nameError = validateProjectName(values.name);
  if (nameError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: nameError, field: "name" },
    };
  }

  const pathError = validatePath(values.path);
  if (pathError) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: pathError, field: "path" },
    };
  }

  const projectPath = resolve(expandTilde(values.path!));
  const openclawPath = `${projectPath}/.openclaw`;
  const memoryPath = `${openclawPath}/memory`;
  const today = new Date().toISOString().split("T")[0];
  const created: string[] = [];

  // Dry run - just report what would happen
  if (values["dry-run"]) {
    return {
      success: true,
      created: [
        `${openclawPath}/AGENTS.md`,
        `${openclawPath}/SOUL.md`,
        `${memoryPath}/${today}.md`,
      ],
      registered: {
        projectId: values.name!,
        path: projectPath,
      },
    };
  }

  // Create directories
  try {
    if (!existsSync(openclawPath)) {
      mkdirSync(openclawPath, { recursive: true });
      if (values.verbose) console.log(`Created: ${openclawPath}`);
    }

    if (!existsSync(memoryPath)) {
      mkdirSync(memoryPath, { recursive: true });
      if (values.verbose) console.log(`Created: ${memoryPath}`);
    }

    // Generate AGENTS.md
    const agentsContent = TEMPLATES.AGENTS_MD.replace("{projectName}", values.name!)
      .replace("{projectType}", values.type!)
      .replace("{owner}", values.owner!)
      .replace("{date}", today);

    const agentsPath = `${openclawPath}/AGENTS.md`;
    writeFileSync(agentsPath, agentsContent);
    created.push(agentsPath);
    if (values.verbose) console.log(`Created: ${agentsPath}`);

    // Generate initial memory file
    const memoryContent = TEMPLATES.MEMORY_ENTRY.replace("{date}", today)
      .replace("{projectType}", values.type!)
      .replace("{owner}", values.owner!);

    const memoryFile = `${memoryPath}/${today}.md`;
    writeFileSync(memoryFile, memoryContent);
    created.push(memoryFile);
    if (values.verbose) console.log(`Created: ${memoryFile}`);

    // Register in PROJECTS.md
    const projectsPath = resolve("~/dev/operator1/PROJECTS.md");
    if (existsSync(projectsPath)) {
      const entry = `\n| ${values.name} | ${values.type} | ${values.owner} | ${projectPath} | Active | - |\n`;
      appendFileSync(projectsPath, entry);
      if (values.verbose) console.log(`Registered in: ${projectsPath}`);
    }

    return {
      success: true,
      created,
      registered: {
        projectId: values.name!,
        path: projectPath,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: "EXECUTION_ERROR",
        message: err.message,
      },
    };
  }
}

// Run and output
main().then((result) => {
  const { values } = parseArgs({ options: { json: { type: "boolean" } } }, { strict: false });
  console.log(
    values.json
      ? JSON.stringify(result, null, 2)
      : result.success
        ? `✅ Project setup complete`
        : `❌ ${result.error?.message}`,
  );
  process.exit(result.success ? 0 : 1);
});
```

### Example 2: How Operator1 Would Use It

**Before (instruction-only, error-prone):**

```
Operator1 receives: "Set up a new project called subzero at ~/dev/subzero-app"

Operator1 thinks:
1. I need to create folder structure
2. Write AGENTS.md with project context
3. Create memory directory
4. Register in PROJECTS.md
5. [forgets step 3]
6. [makes typo in PROJECTS.md]
```

**After (script-augmented, deterministic):**

```
Operator1 receives: "Set up a new project called subzero at ~/dev/subzero-app"

Operator1:
1. Recognizes this is a project setup operation
2. Invokes script: exec("npx tsx scripts/matrix/project-setup.ts --name subzero --path ~/dev/subzero-app --type saas --json")
3. Script handles all steps atomically
4. Operator1 receives JSON result:
   {
     "success": true,
     "created": ["~/dev/subzero-app/.openclaw/AGENTS.md", "~/dev/subzero-app/.openclaw/memory/2026-03-06.md"],
     "registered": { "projectId": "subzero", "path": "/Users/rohits/dev/subzero-app" }
   }
5. Operator1 reports to CEO: "✅ Project 'subzero' initialized at ~/dev/subzero-app"
```

### Example 3: Delegation Context Generation

```bash
# Generate spawn context with proper formatting
npx tsx scripts/matrix/gen-spawn-template.ts \
  --agent "tank" \
  --project "subzero" \
  --path "/Users/rohits/dev/subzero-app" \
  --task "Add rate limiting to the API" \
  --classification "medium" \
  --json
```

**Output:**

```json
{
  "success": true,
  "spawnContext": {
    "label": "tank-subzero-ratelimit-1709712060000",
    "task": "[Project: subzero | Path: /Users/rohits/dev/subzero-app]\n[Tagged for this session]\n[Task]: Add rate limiting to the API\n\nClassification: Medium\n\nRead the project's .openclaw/AGENTS.md for conventions before starting.\nWhen you spawn sub-agents, pass the project info forward.\nFor ACP sessions, use cwd: /Users/rohits/dev/subzero-app.",
    "cwd": "/Users/rohits/dev/subzero-app",
    "runTimeoutSeconds": 900
  }
}
```

Operator1 copies `spawnContext` directly into the `sessions_spawn` call.

---

## 7. Integration with Agent Workflows

### Updating SOUL.md to Reference Scripts

Add to Operator1's `SOUL.md`:

```markdown
## Script-Augmented Operations

The following operations MUST be performed via scripts:

| Operation         | Script                  | Location                          |
| ----------------- | ----------------------- | --------------------------------- |
| New project setup | `project-setup.ts`      | `~/dev/operator1/scripts/matrix/` |
| Agent bootstrap   | `agent-bootstrap.ts`    | `~/dev/operator1/scripts/matrix/` |
| Gateway config    | `gen-gateway-config.ts` | `~/dev/operator1/scripts/matrix/` |

When a script exists for an operation, DO NOT improvise. Use the script.

### Script Invocation Pattern

\`\`\`typescript
const result = await exec({
command: \`npx tsx ~/dev/operator1/scripts/matrix/{script-name}.ts {args} --json\`,
workdir: "~/dev/operator1"
});

const output = JSON.parse(result.stdout);
if (!output.success) {
// Report error, do not continue
}
\`\`\`
```

### Updating AGENTS.md for Project Detection

Add script reference to the Project Detection section:

```markdown
### Project Registration

When discovering a new project, use the registration script:

\`\`\`bash
npx tsx ~/dev/operator1/scripts/matrix/register-project.ts --path {path} --json
\`\`\`

Do NOT manually edit PROJECTS.md.
```

---

## 8. Monitoring & Maintenance

### Script Health Checks

Add to heartbeat:

```markdown
## Periodic Checks

- [ ] Run `agent-health.ts` to verify agent workspaces
- [ ] Run `validate-config.ts` on gateway configs
```

### Version Control

All scripts live in `~/dev/operator1/scripts/` which is git-tracked. Changes to scripts are:

1. PR-reviewed
2. Tested via `--dry-run`
3. Documented in CHANGELOG

### Deprecation Process

When a script becomes obsolete:

1. Add deprecation warning to script output
2. Update agent instructions to use replacement
3. Remove after 2 weeks of no usage

---

## 9. Success Metrics

| Metric                     | How to Measure                               |
| -------------------------- | -------------------------------------------- |
| Fewer project setup errors | Compare PROJECTS.md corrections before/after |
| Consistent agent labels    | Audit spawn logs for pattern compliance      |
| Reduced manual JSON edits  | Git diff on config files                     |
| Faster onboarding          | Time from "add agent" to "agent operational" |

---

## 10. Open Questions

1. **Script language:** TypeScript vs. Bash?
   - Recommendation: TypeScript for complex logic, Bash for simple file ops
2. **Script dependencies:** How to handle npm packages?
   - Recommendation: Use `npx tsx` for TS scripts, minimize dependencies

3. **Cross-platform:** Windows support?
   - Recommendation: Phase 1-2 focus on macOS/Linux, add Windows later if needed

4. **Agent autonomy:** Can agents modify scripts?
   - Recommendation: No. Scripts are infrastructure. Changes require human review.

---

## Appendix A: File Templates

### AGENTS.md Template

```markdown
# AGENTS.md — {projectName}

## Project Context

- **Type:** {projectType}
- **Owner:** {owner}
- **Created:** {date}

## Conventions

_Add project-specific conventions here._

## Memory

Daily notes: `memory/YYYY-MM-DD.md`
```

### PROJECTS.md Entry Template

```markdown
| {id} | {type} | {owner} | {path} | Active | - |
```

---

## Appendix B: Error Codes

| Code                  | Meaning                   | Resolution                   |
| --------------------- | ------------------------- | ---------------------------- |
| `VALIDATION_ERROR`    | Input validation failed   | Check field in error details |
| `EXECUTION_ERROR`     | Script execution failed   | Check permissions, paths     |
| `PRECONDITION_FAILED` | Required state not met    | Run prerequisite scripts     |
| `NOT_FOUND`           | Required resource missing | Create resource first        |
| `ALREADY_EXISTS`      | Resource already exists   | Use --force to overwrite     |

---

_End of Implementation Guide_
