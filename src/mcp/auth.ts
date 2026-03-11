import type { McpAuthConfig } from "./types.js";

export interface ResolvedAuth {
  headers: Record<string, string>;
}

/** Resolve auth config to HTTP headers. */
export function resolveAuth(auth: McpAuthConfig | undefined): ResolvedAuth | undefined {
  if (!auth) {
    return undefined;
  }

  if (auth.type === "bearer") {
    return resolveBearerAuth(auth);
  }

  if (auth.type === "oauth") {
    return resolveOAuthAuth(auth);
  }

  return undefined;
}

/** Resolve bearer token from environment variable. */
function resolveBearerAuth(auth: McpAuthConfig): ResolvedAuth | undefined {
  if (!auth.token_env) {
    return undefined;
  }
  const token = process.env[auth.token_env];
  if (!token) {
    console.log(`[mcp] auth: bearer token env "${auth.token_env}" is not set`);
    return undefined;
  }
  return {
    headers: { Authorization: `Bearer ${token}` },
  };
}

/**
 * Resolve OAuth — Phase 4 MVP: read cached token from env var.
 * Full OAuth flow (browser redirect, token refresh) is Phase 5.
 */
function resolveOAuthAuth(auth: McpAuthConfig): ResolvedAuth | undefined {
  // MVP: use client_secret_env as a pre-obtained access token.
  // Full OAuth PKCE flow would require a local HTTP server for callback.
  if (auth.client_secret_env) {
    const token = process.env[auth.client_secret_env];
    if (!token) {
      console.log(`[mcp] auth: OAuth token env "${auth.client_secret_env}" is not set`);
      return undefined;
    }
    return {
      headers: { Authorization: `Bearer ${token}` },
    };
  }

  console.log("[mcp] auth: OAuth configured but no token env provided — skipping");
  return undefined;
}
