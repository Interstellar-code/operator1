---
summary: "Neo (CTO) periodic checks"
read_when:
  - Heartbeat poll received
---

# HEARTBEAT.md — Neo (CTO)

Periodic checks — rotate through these, don't do all every time.

## Checks (pick 1-2 per heartbeat)

### Tech Debt Review (every ~3 days)

- Use `memory_search` to find recent tech debt mentions
- Escalate any critical items to Operator1
- Log findings in today's daily file

### Active Projects Status (every ~2 days)

- Use `memory_search` to check project status and blockers
- Note any architectural decisions coming up
- Log updates in today's daily file

### QMD Health (every ~6h)

- Run: `memory_search` with any query
- Verify: `provider: "qmd"` in response
- If fallback to FTS or timeout → alert user

### Memory Maintenance (every few days)

- Review recent `memory/YYYY-MM-DD.md` files
- Distill significant events into `MEMORY.md`
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
    "tech_debt_review": null,
    "projects_status": null,
    "qmd_health": null,
    "memory_maintenance": null,
    "cross_dept_sync": null
  }
}
```

If nothing needs attention and no checks are due → reply `HEARTBEAT_OK`
