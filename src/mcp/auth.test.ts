import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAuth } from "./auth.js";

describe("resolveAuth", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns undefined when auth is undefined", () => {
    expect(resolveAuth(undefined)).toBeUndefined();
  });

  it("resolves bearer token from env var", () => {
    process.env.MY_TOKEN = "secret123";
    const result = resolveAuth({ type: "bearer", token_env: "MY_TOKEN" });
    expect(result).toEqual({
      headers: { Authorization: "Bearer secret123" },
    });
  });

  it("returns undefined when bearer env var is not set", () => {
    delete process.env.MY_TOKEN;
    const result = resolveAuth({ type: "bearer", token_env: "MY_TOKEN" });
    expect(result).toBeUndefined();
  });

  it("returns undefined when bearer token_env is missing", () => {
    const result = resolveAuth({ type: "bearer" });
    expect(result).toBeUndefined();
  });

  it("resolves OAuth token from client_secret_env", () => {
    process.env.OAUTH_SECRET = "oauth-token-123";
    const result = resolveAuth({ type: "oauth", client_secret_env: "OAUTH_SECRET" });
    expect(result).toEqual({
      headers: { Authorization: "Bearer oauth-token-123" },
    });
  });

  it("returns undefined when OAuth env var is not set", () => {
    delete process.env.OAUTH_SECRET;
    const result = resolveAuth({ type: "oauth", client_secret_env: "OAUTH_SECRET" });
    expect(result).toBeUndefined();
  });

  it("returns undefined when OAuth has no client_secret_env", () => {
    const result = resolveAuth({ type: "oauth", client_id: "my-client" });
    expect(result).toBeUndefined();
  });

  it("returns undefined for unknown auth type", () => {
    const result = resolveAuth({ type: "unknown" as "bearer" });
    expect(result).toBeUndefined();
  });
});
