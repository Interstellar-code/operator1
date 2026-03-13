---
summary: "Slash commands — user-defined and built-in prompt shortcuts invoked with / in chat"
read_when:
  - You want to create a reusable prompt shortcut
  - You want to know how to invoke a command in chat
  - You want to manage the command registry
title: "Slash Commands"
---

# Slash Commands

Slash commands are named prompt shortcuts that expand into full instructions when invoked with `/name` in chat or any connected channel. Built-in commands are seeded on startup; users can create, edit, and delete their own commands from the **Commands** page in the control UI or by placing `.md` files in `~/.openclaw/commands/`.

## Invoking a Command

Type `/` in the chat input to open the autocomplete menu. Commands are grouped by category. Select with arrow keys or click, then press Enter.

```
/status
/agents list all active agents
/build --target=production
```

Arguments can be passed positionally or as `--key=value` pairs. Inside the command body, use `{{argname}}` to reference them.

## Creating a Command

### From the UI

1. Open **Commands** in the sidebar.
2. Click **New Command**.
3. Fill in name (lowercase, hyphens allowed), description, body, emoji, and category.
4. Save — the command is immediately available in chat.

### From a file

Create `~/.openclaw/commands/<name>.md` with YAML frontmatter:

```markdown
---
name: standup
description: Generate a standup summary for today
emoji: 📋
category: productivity
user-command: true
model-invocation: false
args:
  - name: date
    type: string
    required: false
    default: "today"
---

Generate a concise standup update for {{date}}. Include:

- What I worked on
- What I'm working on today
- Any blockers
```

The gateway scanner picks up new files automatically on the next startup. The file is the source of truth; the SQLite registry mirrors it.

## Argument Substitution

Inside the body, `{{argname}}` is replaced at invocation time:

| Syntax        | Meaning                      |
| ------------- | ---------------------------- |
| `{{project}}` | Required arg named `project` |
| `{{env}}`     | Positional or named arg      |

Named args are passed as `--key=value`; positional args map to the `args` list in declaration order.

## Built-in Commands

The following commands are seeded on startup and cannot be deleted or modified:

| Command   | Description                        |
| --------- | ---------------------------------- |
| `/status` | Gateway and session status summary |
| `/agents` | List configured agents             |
| `/logs`   | Recent gateway log entries         |
| `/build`  | Run the project build              |
| `/help`   | List available commands            |

## Long-running Commands

Mark a command with `long-running: true` in frontmatter (or toggle in the form) when it triggers tasks that may take several minutes. This flag is informational and surfaced as a badge in the Commands UI.

## Export / Import

From the **Commands** page, use **Export** to download all user-created commands as JSON, and **Import** to load a JSON file. Built-in commands and skill-backed commands are excluded from exports.

## Gateway RPC

The commands system exposes RPC methods on the gateway:

| Method             | Scope | Description                                     |
| ------------------ | ----- | ----------------------------------------------- |
| `commands.list`    | read  | List commands (scope: `user` / `agent` / `all`) |
| `commands.get`     | read  | Get a command by name                           |
| `commands.getBody` | read  | Get the expanded body of a command              |
| `commands.invoke`  | write | Expand a command into an instruction            |
| `commands.create`  | admin | Create a new user command                       |
| `commands.update`  | admin | Update an existing user command                 |
| `commands.delete`  | admin | Delete a user command                           |

`commands.list` also merges workspace skill entries when `agentId` is provided, so the autocomplete always shows both commands and eligible skills.

## Storage

Commands are stored in the SQLite state database (`operator1.db`, table `op1_commands`). Each invocation is logged to `op1_command_invocations` for audit and analytics.
