import {
  checkSqlReadOnly,
  DEFAULT_QUERY_LIMIT,
  executeReadOnlyQuery,
  exportAllTablesFromDb,
  exportTableFromDb,
  getDbInfo,
  getSettingFromDb,
  getTableSchema,
  getTableStats,
  inspectTable,
  listSettingsFromDb,
  queryAuditTrail,
  SENSITIVE_TABLES,
  setSettingInDb,
  type SettingsStore,
} from "../../infra/state-db/inspect-sqlite.js";
/**
 * Gateway RPC handlers for the state.* namespace.
 *
 * Provides structured, read-only (and limited write for settings) access to
 * the operator1 SQLite state database. This is a core internal tool designed
 * to let agents and the UI introspect live state without shelling out to
 * `openclaw state` CLI commands.
 *
 * Methods:
 *   state.info              — DB path, size, schema version, integrity
 *   state.tables            — All tables with row counts
 *   state.schema            — CREATE TABLE DDL for a table
 *   state.inspect           — Paginated row browser for a table
 *   state.query             — Read-only arbitrary SQL (SELECT only)
 *   state.settings.list     — List all settings in a store/scope
 *   state.settings.get      — Read a single setting
 *   state.settings.set      — Write a setting (ADMIN scope)
 *   state.audit             — Query the audit_state trail
 *   state.export            — Export one or all tables as JSON
 */
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateStateAuditParams,
  validateStateExportParams,
  validateStateInfoParams,
  validateStateInspectParams,
  validateStateQueryParams,
  validateStateSchemaParams,
  validateStateSettingsGetParams,
  validateStateSettingsListParams,
  validateStateSettingsSetParams,
  validateStateTablesParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

export const stateHandlers: GatewayRequestHandlers = {
  // ── state.info ─────────────────────────────────────────────────────────────

  "state.info": ({ params, respond }) => {
    if (!validateStateInfoParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.info params: ${formatValidationErrors(validateStateInfoParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const info = getDbInfo();
      respond(true, info);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.info failed: ${String(err)}`),
      );
    }
  },

  // ── state.tables ───────────────────────────────────────────────────────────

  "state.tables": ({ params, respond }) => {
    if (!validateStateTablesParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.tables params: ${formatValidationErrors(validateStateTablesParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const tables = getTableStats();
      respond(true, { tables });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.tables failed: ${String(err)}`),
      );
    }
  },

  // ── state.schema ───────────────────────────────────────────────────────────

  "state.schema": ({ params, respond }) => {
    if (!validateStateSchemaParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.schema params: ${formatValidationErrors(validateStateSchemaParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const tableName = params.table;
      const ddl = getTableSchema(tableName);
      if (ddl === null) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, `table not found: ${tableName}`),
        );
        return;
      }
      respond(true, { table: tableName, ddl });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.schema failed: ${String(err)}`),
      );
    }
  },

  // ── state.inspect ──────────────────────────────────────────────────────────

  "state.inspect": ({ params, respond }) => {
    if (!validateStateInspectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.inspect params: ${formatValidationErrors(validateStateInspectParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const tableName = params.table;
      const rows = inspectTable(tableName, {
        limit: params.limit,
        offset: params.offset,
        columns: params.columns as string[] | undefined,
      });
      respond(true, {
        table: tableName,
        count: rows.length,
        rows,
        sensitive: SENSITIVE_TABLES.has(tableName),
      });
    } catch (err) {
      const msg = String(err);
      const code = msg.includes("table not found") ? ErrorCodes.NOT_FOUND : ErrorCodes.UNAVAILABLE;
      respond(false, undefined, errorShape(code, `state.inspect failed: ${msg}`));
    }
  },

  // ── state.query ────────────────────────────────────────────────────────────

  "state.query": ({ params, respond }) => {
    if (!validateStateQueryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.query params: ${formatValidationErrors(validateStateQueryParams.errors)}`,
        ),
      );
      return;
    }
    const sql = params.sql;

    // Pre-validate before hitting the DB
    const safetyError = checkSqlReadOnly(sql);
    if (safetyError) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, safetyError));
      return;
    }

    try {
      const rows = executeReadOnlyQuery(sql, {
        limit: params.limit ?? DEFAULT_QUERY_LIMIT,
      });
      respond(true, { count: rows.length, rows });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.query failed: ${String(err)}`),
      );
    }
  },

  // ── state.settings.list ────────────────────────────────────────────────────

  "state.settings.list": ({ params, respond }) => {
    if (!validateStateSettingsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.settings.list params: ${formatValidationErrors(validateStateSettingsListParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const store = params.store as SettingsStore;
      const scope = params.scope;
      const settings = listSettingsFromDb(store, scope);
      respond(true, { store, scope, settings });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.settings.list failed: ${String(err)}`),
      );
    }
  },

  // ── state.settings.get ─────────────────────────────────────────────────────

  "state.settings.get": ({ params, respond }) => {
    if (!validateStateSettingsGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.settings.get params: ${formatValidationErrors(validateStateSettingsGetParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const store = params.store as SettingsStore;
      const scope = params.scope;
      const key = params.key;
      const entry = getSettingFromDb(store, scope, key);
      if (entry === null) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND, `setting not found: ${store}/${scope}/${key}`),
        );
        return;
      }
      respond(true, entry);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.settings.get failed: ${String(err)}`),
      );
    }
  },

  // ── state.settings.set ─────────────────────────────────────────────────────

  "state.settings.set": ({ params, respond }) => {
    if (!validateStateSettingsSetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.settings.set params: ${formatValidationErrors(validateStateSettingsSetParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const store = params.store as SettingsStore;
      const scope = params.scope;
      const key = params.key;
      const value = params.value;
      setSettingInDb(store, scope, key, value);
      respond(true, { store, scope, key, updated: true });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.settings.set failed: ${String(err)}`),
      );
    }
  },

  // ── state.audit ────────────────────────────────────────────────────────────

  "state.audit": ({ params, respond }) => {
    if (!validateStateAuditParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.audit params: ${formatValidationErrors(validateStateAuditParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const entries = queryAuditTrail({
        table: params.table,
        action: params.action,
        since: params.since,
        limit: params.limit,
      });
      respond(true, { count: entries.length, entries });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `state.audit failed: ${String(err)}`),
      );
    }
  },

  // ── state.export ───────────────────────────────────────────────────────────

  "state.export": ({ params, respond }) => {
    if (!validateStateExportParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid state.export params: ${formatValidationErrors(validateStateExportParams.errors)}`,
        ),
      );
      return;
    }
    try {
      const tableName = params.table;
      if (tableName) {
        const rows = exportTableFromDb(tableName);
        respond(true, { table: tableName, count: rows.length, rows });
      } else {
        const data = exportAllTablesFromDb();
        const tableNames = Object.keys(data);
        const totalRows = tableNames.reduce((sum, t) => sum + data[t].length, 0);
        respond(true, { tables: tableNames, totalRows, data });
      }
    } catch (err) {
      const msg = String(err);
      const code = msg.includes("table not found") ? ErrorCodes.NOT_FOUND : ErrorCodes.UNAVAILABLE;
      respond(false, undefined, errorShape(code, `state.export failed: ${msg}`));
    }
  },
};
