---
summary: "Morpheus (CMO) periodic checks"
read_when:
  - Heartbeat poll received
---

# HEARTBEAT.md — Morpheus (CMO)

Periodic checks — rotate through these, don't do all every time.

## Checks (pick 1-2 per heartbeat)

### Content Calendar Review (every ~2 days)

- Check for upcoming deadlines or content gaps
- Note any time-sensitive topics or trending opportunities
- Flag calendar gaps to Operator1 if nothing is scheduled this week

### Competitive Monitor (every ~3 days)

- Quick web search for competitor activity
- Note any positioning moves, launches, or content plays
- Log findings in today's daily file

### Brand Consistency Check (weekly)

- Review recent content output for voice consistency
- Flag any drift from established brand guidelines
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
    "content_calendar": null,
    "competitive_monitor": null,
    "brand_consistency": null,
    "qmd_health": null,
    "memory_maintenance": null,
    "cross_dept_sync": null
  }
}
```

If nothing needs attention and no checks are due → reply `HEARTBEAT_OK`
