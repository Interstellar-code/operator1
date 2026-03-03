---
summary: "Trinity (CFO) periodic checks"
read_when:
  - Heartbeat poll received
---

# HEARTBEAT.md — Trinity (CFO)

Periodic checks — rotate through these, don't do all every time.

## Checks (pick 1-2 per heartbeat)

### Weekly Burn Check (every Monday or ~weekly)

- Current balance, burn rate, runway calculation
- Compare against last week
- Flag if burn rate increased >15% without explanation

### Subscription Audit (monthly)

- Use `memory_search` to review vendor and subscription mentions
- Flag services >$20/month unused in 30+ days
- Note upcoming renewals in next 14 days

### API Cost Review (every ~3 days)

- Check session token usage across agents
- Compute cost-per-agent if data available
- Flag outlier sessions (unusually high token burn)
- Log findings in today's daily file

### Goal Progress (weekly)

- Use `memory_search` to check financial goal progress
- Flag goals that are off-track
- Log updates in today's daily file

### QMD Health (every ~6h)

- Run: `memory_search` with any query
- Verify: `provider: "qmd"` in response
- If fallback to FTS or timeout → alert user

### Memory Maintenance (every few days)

- List the `memory/` directory to see what files exist (do NOT guess filenames)
- If daily files (`YYYY-MM-DD.md`) are present, read only the most recent 2-3
- If no daily files exist yet, skip this check — nothing to distill
- Distill significant events from daily files into `MEMORY.md`
- Remove outdated info from MEMORY.md

### Cross-Department Sync (every ~12h)

- Check outbox files from peers and workers (see AGENTS.md Memory Sync Protocol)
- Integrate relevant updates into your memory files
- Clear processed entries from source outbox files
- Write outbox entries for peers if you have cross-department updates

## State Tracking

Track last checks in `memory/heartbeat-state.json`:

```json
{
  "lastChecks": {
    "burn_check": null,
    "subscription_audit": null,
    "api_cost_review": null,
    "goal_progress": null,
    "qmd_health": null,
    "memory_maintenance": null,
    "cross_dept_sync": null
  }
}
```

If nothing needs attention and no checks are due → reply `HEARTBEAT_OK`
