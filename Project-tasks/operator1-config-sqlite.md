# Operator1 Config SQLite Migration

**Status:** Draft
**Created:** 2026-03-05
**Author:** Operator1 (from Rohit's request)

---

## Summary

Move OpenClaw configuration from `openclaw.json` (JSON5 file) to SQLite database while maintaining easy upstream merge compatibility.

---

## Motivation

| Current (JSON)                | Proposed (SQLite)            |
| ----------------------------- | ---------------------------- |
| File corruption risk on crash | Atomic writes, journaling    |
| Full file rewrite on change   | Row-level updates            |
| No concurrent access          | Safe concurrent reads/writes |
| No audit trail                | Built-in change tracking     |
| Manual backup management      | Database backup tools        |
| 20KB file grows linearly      | Efficient storage, indexing  |

---

## Backward Compatibility

**Everything works automatically.** No UI changes required.

### Why Nothing Breaks

All config access goes through the gateway RPC layer:

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   Old UI ──────┐                                            │
│                │                                            │
│   New UI ──────┼──► Gateway RPC ──► config.get/set()       │
│                │         │                                  │
│   CLI ─────────┘         │                                  │
│                          ▼                                  │
│                    loadConfig()                             │
│                          │                                  │
│                          ▼                                  │
│                   ConfigIO Adapter  ◄── ONLY CHANGE        │
│                    ╱         ╲                              │
│                   ╱           ╲                             │
│              SQLite         JSON                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Gateway RPC Methods

The UI doesn't read JSON directly. It calls gateway RPC:

| Method          | Purpose             |
| --------------- | ------------------- |
| `config.get`    | Read current config |
| `config.set`    | Write full config   |
| `config.apply`  | Apply changes       |
| `config.patch`  | Merge patch         |
| `config.schema` | Get config schema   |

All these handlers use `loadConfig()` which goes through the adapter:

```typescript
// src/gateway/server-methods/config.ts
import { loadConfig } from "../../config/config.js";
// This will automatically use SQLite if available
```

### What Works Without Changes

| Component | Works? | Why                 |
| --------- | ------ | ------------------- |
| Old UI    | ✅ Yes | Calls gateway RPC   |
| New UI    | ✅ Yes | Same path           |
| Gateway   | ✅ Yes | Uses `loadConfig()` |
| CLI       | ✅ Yes | Uses same API       |
| Agents    | ✅ Yes | Same                |

---

## Architecture

### Current State

```
src/config/
├── types.ts          # OpenClawConfig interface
├── validation.ts     # Config validation
├── defaults.ts       # Default values
├── io.ts             # JSON5 read/write
└── config.ts         # Exports loadConfig, writeConfig
```

### Proposed State

```
src/config/
├── types.ts              # OpenClawConfig interface (UNCHANGED)
├── validation.ts         # Config validation (UNCHANGED)
├── defaults.ts           # Default values (UNCHANGED)
├── io-interface.ts       # NEW: ConfigIO interface
├── io-json.ts            # RENAMED from io.ts (upstream impl)
├── io-sqlite.ts          # NEW: SQLite implementation
├── sqlite-schema.ts      # NEW: Table definitions
├── sqlite-migrate.ts     # NEW: JSON → SQLite migration
└── config.ts             # FORKED: Adapter selection
```

---

## ConfigIO Interface

```typescript
// src/config/io-interface.ts

import type { OpenClawConfig } from "./types.js";

export interface ConfigIO {
  /** Load full configuration */
  read(): Promise<OpenClawConfig>;

  /** Write full configuration */
  write(config: OpenClawConfig): Promise<void>;

  /** Watch for external changes (optional) */
  watch?(callback: (config: OpenClawConfig) => void): () => void;

  /** Get config file path (for compatibility) */
  getConfigPath?(): string;
}
```

---

## SQLite Schema

```sql
-- Main configuration tables

-- Key-value store for top-level settings
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT,                    -- JSON for complex values
  schema_type TEXT DEFAULT 'json',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agents
CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  department TEXT,
  role TEXT,
  is_default BOOLEAN DEFAULT 0,
  identity_json TEXT,            -- { name, emoji }
  subagents_json TEXT,           -- { allowAgents: [...] }
  workspace TEXT,
  agent_dir TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Channels (Telegram, BlueBubbles, etc.)
CREATE TABLE channels (
  id TEXT PRIMARY KEY,           -- 'telegram', 'bluebubbles'
  enabled BOOLEAN DEFAULT 1,
  config_json TEXT,              -- Full channel config
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Channel groups (for Telegram groups, Discord guilds)
CREATE TABLE channel_groups (
  channel_id TEXT,
  group_id TEXT,                 -- Telegram group ID, Discord guild ID
  config_json TEXT,              -- Per-group config
  PRIMARY KEY (channel_id, group_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id)
);

-- Models
CREATE TABLE model_providers (
  provider TEXT PRIMARY KEY,
  base_url TEXT,
  api_type TEXT,
  config_json TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE models (
  provider TEXT,
  model_id TEXT,
  name TEXT,
  config_json TEXT,              -- contextWindow, maxTokens, cost, etc.
  PRIMARY KEY (provider, model_id),
  FOREIGN KEY (provider) REFERENCES model_providers(provider)
);

-- Plugins
CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT 1,
  config_json TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Hooks
CREATE TABLE hooks (
  scope TEXT PRIMARY KEY,        -- 'internal', 'external'
  config_json TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Audit log
CREATE TABLE config_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT,
  record_id TEXT,
  action TEXT,                   -- 'INSERT', 'UPDATE', 'DELETE'
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,               -- 'ui', 'cli', 'agent', 'migration'
  changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Gateway settings
CREATE TABLE gateway_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Environment variables (sensitive)
CREATE TABLE env_vars (
  key TEXT PRIMARY KEY,
  value TEXT,
  is_secret BOOLEAN DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_agents_department ON agents(department);
CREATE INDEX idx_config_audit_table ON config_audit(table_name, changed_at);
```

---

## SQLite Implementation

```typescript
// src/config/io-sqlite.ts

import Database from "better-sqlite3";
import type { OpenClawConfig } from "./types.js";
import type { ConfigIO } from "./io-interface.js";

const DB_PATH = "~/.openclaw/openclaw.db";

export const SQLiteConfigIO: ConfigIO = {
  async read(): Promise<OpenClawConfig> {
    const db = new Database(DB_PATH);

    // Reconstruct OpenClawConfig from tables
    const config: OpenClawConfig = {
      meta: this.readMeta(db),
      env: this.readEnv(db),
      agents: this.readAgents(db),
      channels: this.readChannels(db),
      models: this.readModels(db),
      plugins: this.readPlugins(db),
      gateway: this.readGateway(db),
      memory: this.readMemory(db),
      // ... other sections
    };

    db.close();
    return config;
  },

  async write(config: OpenClawConfig): Promise<void> {
    const db = new Database(DB_PATH);

    // Use transaction for atomic write
    const write = db.transaction(() => {
      this.writeMeta(db, config.meta);
      this.writeAgents(db, config.agents);
      this.writeChannels(db, config.channels);
      // ... other sections
    });

    write();
    db.close();
  },

  // ... helper methods for each section
};
```

---

## Adapter Selection

```typescript
// src/config/config.ts

import { JSONConfigIO } from "./io-json.js";
import { SQLiteConfigIO } from "./io-sqlite.js";
import type { ConfigIO } from "./io-interface.js";

// Detect which backend to use
function detectBackend(): ConfigIO {
  // Check for SQLite DB first
  const dbPath = path.join(resolveRequiredHomeDir(), "openclaw.db");
  if (fs.existsSync(dbPath)) {
    return SQLiteConfigIO;
  }

  // Fall back to JSON
  return JSONConfigIO;
}

// Export single IO instance
const configIO = detectBackend();

export const loadConfig = () => configIO.read();
export const writeConfig = (c: OpenClawConfig) => configIO.write(c);
export const watchConfig = (cb: (c: OpenClawConfig) => void) => configIO.watch?.(cb) ?? (() => {});
```

---

## Migration Script

```typescript
// src/config/sqlite-migrate.ts

import { loadConfig } from "./config.js";
import Database from "better-sqlite3";

export async function migrateJsonToSQLite(jsonPath: string): Promise<void> {
  // 1. Load existing JSON config
  const config = loadConfig(jsonPath);

  // 2. Create SQLite database
  const db = new Database(DB_PATH);

  // 3. Run schema migrations
  db.exec(SCHEMA_SQL);

  // 4. Populate tables
  const migrate = db.transaction(() => {
    migrateMeta(db, config.meta);
    migrateAgents(db, config.agents);
    migrateChannels(db, config.channels);
    migrateModels(db, config.models);
    // ... other sections
  });

  migrate();

  // 5. Log migration in audit
  db.prepare(
    `
    INSERT INTO config_audit (table_name, record_id, action, changed_by)
    VALUES (?, ?, ?, ?)
  `,
  ).run("migration", "full", "MIGRATE", "migration-script");

  db.close();

  console.log("Migration complete. Original JSON backed up to:", `${jsonPath}.backup`);
}
```

---

## CLI Command

```bash
# Migrate from JSON to SQLite
openclaw config migrate --to sqlite

# Export SQLite back to JSON (for backup or local gateway)
openclaw config export --format json

# Check which backend is active
openclaw config backend
# Output: sqlite (~/openclaw/openclaw.db)
```

---

## Merge Strategy with Upstream

### Files that Merge Cleanly (No Conflicts)

| File            | Why                                   |
| --------------- | ------------------------------------- |
| `types.ts`      | Same interface definition             |
| `validation.ts` | Same validation logic                 |
| `defaults.ts`   | Same default values                   |
| `io-json.ts`    | Renamed from `io.ts`, tracks upstream |

### Files with Minimal Conflicts

| File        | Conflict                | Resolution                 |
| ----------- | ----------------------- | -------------------------- |
| `config.ts` | One-line adapter switch | Manual resolve, 30 seconds |

### New Files (No Conflicts)

| File                | Notes               |
| ------------------- | ------------------- |
| `io-interface.ts`   | Your abstraction    |
| `io-sqlite.ts`      | Your implementation |
| `sqlite-schema.ts`  | Your schema         |
| `sqlite-migrate.ts` | Your migration      |

---

## Implementation Phases

### Phase 1: Abstraction (2 days)

- [ ] Create `io-interface.ts` with `ConfigIO` interface
- [ ] Rename `io.ts` → `io-json.ts`
- [ ] Update `config.ts` to use interface
- [ ] Verify all existing tests pass

### Phase 2: SQLite Implementation (3 days)

- [ ] Create `sqlite-schema.ts` with table definitions
- [ ] Implement `io-sqlite.ts` with full read/write
- [ ] Add `better-sqlite3` dependency
- [ ] Unit tests for SQLite IO

### Phase 3: Migration Tooling (2 days)

- [ ] Implement `sqlite-migrate.ts`
- [ ] Add CLI command `openclaw config migrate`
- [ ] Add export command for JSON backup
- [ ] Test migration on existing configs

### Phase 4: Testing & Polish (2 days)

- [ ] Test all config operations through old UI
- [ ] Test all config operations through new UI
- [ ] Verify gateway RPC methods work
- [ ] Update documentation

**Total: ~9 days** (reduced from 10 — UI works automatically)

---

## Rollback Plan

If SQLite causes issues:

1. Export to JSON: `openclaw config export --format json`
2. Delete `openclaw.db`
3. System automatically falls back to JSON

---

## Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  }
}
```

---

## Open Questions

1. **Database location:** `~/.openclaw/openclaw.db` or `~/.openclaw/data/config.db`?
2. **Encryption:** Should sensitive values (API keys) be encrypted at rest?
3. **Backup frequency:** Automatic backup on every write, or periodic?
4. **Multi-process locking:** Use WAL mode for better concurrency?

---

## Success Criteria

- [ ] All existing functionality works with SQLite
- [ ] JSON export produces identical config to input
- [ ] Upstream merges require < 5 minutes of manual resolution
- [ ] No data loss during migration
- [ ] UI can read/write all config sections
- [ ] Audit log captures all changes

---

## References

- Current config: `~/.openclaw/openclaw.json`
- Config types: `src/config/types.ts`
- Current IO: `src/config/io.ts`

---

_Last updated: 2026-03-05_
