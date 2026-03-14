---
# -- Dart AI metadata ----------------------------------------------------------
title: "Upstream Selective Sync Process"
description: "Process doc for cherry-picking fixes and features from upstream openclaw into operator1"
dartboard: "Operator1/Tasks"
type: Project
status: "Active"
priority: high
assignee: "rohit sharma"
tags: [process, upstream, sync, git]
startAt:
dueAt:
dart_project_id:
# -------------------------------------------------------------------------------
---

# Upstream Selective Sync Process

**Created:** 2026-03-13
**Status:** Active
**Replaces:** Full `git merge upstream/main` approach

---

## 1. Overview

Operator1 has diverged significantly from upstream openclaw (135+ custom
commits covering SQLite migration, commands system, memory improvements,
hub concept, UI changes). Full upstream merges are no longer practical —
they pull in hundreds of unwanted refactors, cause widespread conflicts,
and risk breaking operator1-specific systems.

This doc defines the **selective cherry-pick pipeline**: we decide what
comes in from upstream, not the other way around.

---

## 2. Principles

- **We choose what lands.** No change enters operator1 without explicit review.
- **Security fixes first.** Always prioritize security patches.
- **Branch from upstream, merge into ours.** Review branches are based on
  pure upstream tags — never branched off operator1 `main`.
- **One review branch per upstream release.** Keeps changes traceable.
- **Test before merge.** Every cherry-pick batch is validated before landing on `main`.

---

## 3. Git Topology

```
upstream/main (pure openclaw — fetch only, never push)
  │
  │  identify commits from CHANGELOG / git log
  │
  │  git cherry-pick <sha>   ← directly onto main
  │         │
  ▼         ▼
origin/main (operator1)
  ├── cherry-pick: security fix A
  ├── cherry-pick: bug fix B
  ├── pnpm build && pnpm test
  └── done
```

**Key:** No extra branches. `upstream` remote is the pure openclaw fork
(fetch-only, never push). We cherry-pick directly from upstream commits
onto our `main`. Conflicts resolve inline. Test. Push. Done.

### One-time setup: Disable push to upstream

Prevent accidental pushes to the real openclaw repo:

```bash
git remote set-url --push upstream FETCH_ONLY_NO_PUSH
```

This makes any `git push upstream` fail with a clear error. Verify with
`git remote -v` — push URL should show `FETCH_ONLY_NO_PUSH`.

---

## 4. Change Classification

Every upstream change falls into one of four buckets:

| Bucket       | Priority | Action                                                | SLA                  |
| ------------ | -------- | ----------------------------------------------------- | -------------------- |
| **Security** | Critical | Cherry-pick immediately                               | Same day             |
| **Bug fix**  | High     | Cherry-pick if we're affected or likely to be         | Within release cycle |
| **Feature**  | Medium   | Evaluate — adopt, adapt, or skip                      | Per-release review   |
| **Refactor** | Low      | Usually skip unless it unblocks a fix/feature we want | Skip by default      |

### How to classify

1. Read upstream `CHANGELOG.md` diff between our last synced tag and the target
2. Check upstream GitHub releases for highlighted security/breaking changes
3. For each entry, ask:
   - Does this fix a bug we've seen or could hit? → **Bug fix**
   - Does this address a security advisory? → **Security**
   - Does this add something we want? → **Feature**
   - Is this restructuring code we've already modified? → **Refactor** (skip)

---

## 5. Step-by-Step Process

### Phase 1: Identify (30 min)

```bash
# 1. Fetch upstream
git fetch upstream --tags

# 2. Find our last synced tag
# Always use the sync log (§7) as ground truth — NOT git merge-base.
# merge-base is unreliable for cherry-pick workflows (returns old
# historical commits, not the actual sync point).
# Example: sync log says v2026.3.8 → that's your base.

# 3. Identify target release
git tag -l 'v20*' --sort=-version:refname | grep -v beta | head -5

# 4. Read the changelog diff
git diff v2026.3.8..v2026.3.12 -- CHANGELOG.md

# 5. List commits between releases
git log --oneline v2026.3.8..v2026.3.12 --no-merges | wc -l
git log --oneline v2026.3.8..v2026.3.12 --no-merges
```

### Phase 2: Review & Select (1-2 hrs for large releases)

**Pre-filter by scope:** Before reviewing individual commits, narrow down
to files you care about. This cuts hundreds of commits to a manageable set:

```bash
# Only show commits touching areas we use
git log --oneline v2026.3.8..v2026.3.12 --no-merges -- \
  src/agents/ src/auto-reply/ src/gateway/ extensions/ \
  src/infra/ src/media/ src/channels/ src/routing/
```

For each CHANGELOG entry or commit of interest:

```bash
# Find the commit(s) for a specific fix
git log upstream/main --oneline --grep="WebSocket reconnect"

# View the full diff of a commit
git show <sha> --stat    # files changed
git show <sha>           # full diff

# Check if it touches files we've heavily modified
git show <sha> --stat | grep -f <(echo -e "system-prompt.ts\ncommands-core.ts\nstate-db/schema.ts")

# Detect dependency chains: check if a target commit depends on
# something we're skipping (does the target sit downstream of the skip?)
git log --oneline --ancestry-path <skipped-sha>..<target-sha>
# If output is non-empty, the target depends on the skipped commit.
# Options: cherry-pick the chain, adapt manually, or defer.
```

Classify each into the sync log (see §7).

### Phase 3: Cherry-pick onto main

```bash
# Make sure we're on main
git checkout main

# Cherry-pick selected commits directly (chronological order)
git cherry-pick <sha1>
# → if conflict: resolve, then git cherry-pick --continue
# → if too messy: git cherry-pick --abort and skip
git cherry-pick <sha2>
git cherry-pick <sha3>

# If a cherry-pick depends on a commit we skipped, either:
#   a) cherry-pick the dependency too
#   b) adapt the fix manually (write our own version)
#   c) skip and note in sync log
```

### Phase 4: Validate & Push

```bash
pnpm install && pnpm build && pnpm test
cd ui-next && pnpm build && cd ..

# If all good, push
git push

# Update the sync log in this doc
```

### Phase 5: Rollback (if needed)

If a cherry-picked commit causes a regression after push:

```bash
# Revert creates a new commit — safe for shared branches
git revert <cherry-picked-sha>
git push

# Note the revert in the sync log with reason
```

Never use `git reset --hard` or force-push to undo cherry-picks on `main`.

---

## 6. What to Watch For

### Files we've heavily modified (conflict-prone)

These files have significant operator1 customizations. Cherry-picks touching
them need extra care:

| File                                     | Conflict strategy                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/system-prompt.ts`            | Take theirs for new prompt logic, keep our custom sections intact. Merge by appending upstream additions around our blocks. |
| `src/auto-reply/reply/commands-core.ts`  | Keep our handler pipeline order. Take theirs for new command registrations only.                                            |
| `src/gateway/server-methods.ts`          | Append-only — take theirs for new handlers, keep ours. Both sides should coexist.                                           |
| `src/gateway/server-methods-list.ts`     | Append-only — merge both method lists.                                                                                      |
| `src/gateway/method-scopes.ts`           | Append-only — merge both scope entries.                                                                                     |
| `src/gateway/protocol/schema/*.ts`       | Take theirs for new types. Keep our custom types. If same type modified, manual merge.                                      |
| `src/infra/state-db/schema.ts`           | **Our version always wins on migration number.** Take theirs for new table/column logic, keep our version bump.             |
| `ui-next/src/app.tsx`                    | Keep our custom routes. Take theirs for shared component updates only.                                                      |
| `ui-next/src/components/app-sidebar.tsx` | Keep our custom navigation. Manual merge if both sides modify.                                                              |

### Files safe to cherry-pick freely

These are less likely to conflict:

- `src/agents/tools/*` — individual tool implementations
- `src/agents/model-*.ts` — model definitions, forward-compat
- `src/agents/pi-embedded-helpers/errors.ts` — error classification
- `src/agents/openai-ws-connection.ts` — WebSocket management
- `extensions/*` — plugin code (we don't modify these).
  **Caveat:** Verify before assuming no local changes:
  `git log --oneline main -- extensions/<name>`. If we've patched an
  extension, it becomes conflict-prone.
- `docs/*` — documentation (we maintain separately)

### Security advisories

- Watch: https://github.com/openclaw/openclaw/security/advisories
- Also check commits tagged with `fix:` + `security`, `GHSA`, `CVE`, `XSS`, `injection`

---

## 7. Sync Log

Track every sync decision here. One section per upstream release reviewed.

### Last synced to: v2026.3.8 (2026-03-09)

Full merge — last time we did a complete upstream sync.

---

### v2026.3.11 (2026-03-12) — 235 commits

**Status:** Pending review

#### Adopted

_(none yet — review needed)_

#### Skipped

_(none yet — review needed)_

#### Deferred

_(none yet — review needed)_

---

### v2026.3.12 (2026-03-13) — 197 additional commits since v2026.3.11

Verify delta: `git log --oneline v2026.3.11..v2026.3.12 --no-merges | wc -l`

**Status:** Pending review

#### Adopted

_(none yet — review needed)_

#### Skipped

_(none yet — review needed)_

#### Deferred

_(none yet — review needed)_

---

## 8. When to Do a Full Merge Instead

If **all** of these are true, consider a full merge as a "rebase checkpoint":

- We're 5+ stable releases behind
- Cherry-pick burden exceeds a full merge effort
- Upstream has made foundational changes we need (e.g., new SDK version)
- We have time for a dedicated sync sprint (2-3 days)

Use the sync-lead/code-guard/qa-runner agents for full merges. Always on a
dedicated branch, never directly on `main`.

---

## 9. FAQ

**Q: Won't we fall behind on important upstream improvements?**
A: We review every release. Important fixes get cherry-picked. Features we
don't need are intentionally skipped. This is a feature, not a bug.

**Q: What if an upstream fix depends on a refactor we skipped?**
A: Either cherry-pick the dependency chain, or adapt the fix to work with
our codebase. If the dependency chain is too large, defer and flag it.

**Q: How often should we review upstream?**
A: Every stable release (roughly weekly). Security advisories: immediately.

**Q: Can we automate any of this?**
A: The identify phase (CHANGELOG diff, commit listing) can be scripted.
The classification and cherry-pick decisions are human/AI judgment calls.

---

## 10. References

- Previous sync process: sync-lead/code-guard/qa-runner agents (still available for full merges)
- Upstream repo: https://github.com/openclaw/openclaw
- Post-sync checklist (for full merges): see MEMORY.md "Post-Upstream-Sync Checklist"
- Key source files:
  - `src/gateway/server-methods.ts` — handler registry (append-only)
  - `src/gateway/server-methods-list.ts` — method names (append-only)
  - `src/gateway/method-scopes.ts` — scope registry (append-only)

---

_Process version: 1.1 — 2026-03-13 (incorporated senior dev review feedback)_
