---
title: "HEARTBEAT.md Template"
summary: "Workspace template for HEARTBEAT.md"
read_when:
  - Bootstrapping a workspace manually
---

# HEARTBEAT.md

# Keep this file empty (or with only comments) to skip heartbeat API calls.

# Add tasks below when you want the agent to check something periodically.

# The agent picks 1-2 tasks per heartbeat cycle (default: every 30 minutes).

## Checks

### QMD Keepalive (EVERY heartbeat)

- Run: `memory_search` with a recent topic query
- Verify: response includes `provider: "qmd"` (not builtin fallback)
- If QMD is down: reply with alert — "QMD provider unavailable, using FTS5 fallback"

### Memory Distillation (weekly — Sunday or when daily notes exceed 10 files)

- Read all `memory/YYYY-MM-DD.md` files from the last 7 days
- Extract: key decisions, commitments, learnings, people, deadlines
- UPDATE MEMORY.md — merge new insights into existing sections (do NOT just append)
- CRITICAL: MEMORY.md must stay under 180 lines (system truncates at 200)
- If MEMORY.md exceeds 180 lines after update: summarize older entries, move detail to `memory/archive-YYYY-QN.md`
- After distillation: daily notes older than 30 days are auto-archived to `memory/.archive/`

### Memory Health Check (daily)

- Verify MEMORY.md exists and is not empty
- Check: has MEMORY.md been updated in the last 7 days? If not, flag for distillation
- Count daily note files in `memory/` — if > 20 unprocessed, trigger distillation early
