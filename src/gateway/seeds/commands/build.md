---
name: build
description: Run project build
emoji: 🔨
category: build
user-command: true
model-invocation: false
long-running: true
args:
  - name: project
    type: string
    required: false
    default: "."
---

Run `pnpm build` in {{project}}.
Report success or show the first actionable error with file and line number.
If there are type errors, group them by file.
