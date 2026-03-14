/**
 * TypeBox schemas for the state.* gateway RPC namespace.
 *
 * These params define the request shapes for all state introspection
 * and settings-management methods.
 */
import { Type } from "@sinclair/typebox";

// ── Shared sub-types ─────────────────────────────────────────────────────────

const SettingsStoreSchema = Type.Union([Type.Literal("core"), Type.Literal("op1")]);

const AuditActionSchema = Type.Union([
  Type.Literal("INSERT"),
  Type.Literal("UPDATE"),
  Type.Literal("DELETE"),
]);

// ── state.info ───────────────────────────────────────────────────────────────

export const StateInfoParamsSchema = Type.Object({}, { additionalProperties: false });

// ── state.tables ─────────────────────────────────────────────────────────────

export const StateTablesParamsSchema = Type.Object({}, { additionalProperties: false });

// ── state.schema ─────────────────────────────────────────────────────────────

export const StateSchemaParamsSchema = Type.Object(
  {
    table: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

// ── state.inspect ────────────────────────────────────────────────────────────

export const StateInspectParamsSchema = Type.Object(
  {
    table: Type.String({ minLength: 1 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
    columns: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  },
  { additionalProperties: false },
);

// ── state.query ──────────────────────────────────────────────────────────────

export const StateQueryParamsSchema = Type.Object(
  {
    sql: Type.String({ minLength: 1 }),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  },
  { additionalProperties: false },
);

// ── state.settings.list ──────────────────────────────────────────────────────

export const StateSettingsListParamsSchema = Type.Object(
  {
    store: SettingsStoreSchema,
    scope: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

// ── state.settings.get ───────────────────────────────────────────────────────

export const StateSettingsGetParamsSchema = Type.Object(
  {
    store: SettingsStoreSchema,
    scope: Type.String({ minLength: 1 }),
    key: Type.String(),
  },
  { additionalProperties: false },
);

// ── state.settings.set ───────────────────────────────────────────────────────

export const StateSettingsSetParamsSchema = Type.Object(
  {
    store: SettingsStoreSchema,
    scope: Type.String({ minLength: 1 }),
    key: Type.String(),
    value: Type.Unknown(),
  },
  { additionalProperties: false },
);

// ── state.audit ──────────────────────────────────────────────────────────────

export const StateAuditParamsSchema = Type.Object(
  {
    table: Type.Optional(Type.String()),
    action: Type.Optional(AuditActionSchema),
    since: Type.Optional(Type.Integer({ minimum: 0 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 1000 })),
  },
  { additionalProperties: false },
);

// ── state.export ─────────────────────────────────────────────────────────────

export const StateExportParamsSchema = Type.Object(
  {
    table: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
