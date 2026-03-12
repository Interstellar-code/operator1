import { describe, expect, it } from "vitest";
import { resolveApiKeyForProfile } from "./oauth.js";
import type { AuthProfileStore } from "./types.js";

describe("resolveApiKeyForProfile mode/type compatibility", () => {
  async function resolveOauthProfileForConfiguredMode(mode: "token" | "api_key") {
    const profileId = "anthropic:default";
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        [profileId]: {
          type: "oauth",
          provider: "anthropic",
          access: "oauth-token",
          refresh: "refresh-token",
          expires: Date.now() + 60_000,
        },
      },
    };

    const result = await resolveApiKeyForProfile({
      cfg: {
        auth: {
          profiles: {
            [profileId]: {
              provider: "anthropic",
              mode,
            },
          },
        },
      },
      store,
      profileId,
    });

    return result;
  }

  it("accepts mode=token + type=oauth for legacy compatibility", async () => {
    const result = await resolveOauthProfileForConfiguredMode("token");

    expect(result?.apiKey).toBe("oauth-token");
  });

  it("accepts mode=oauth + type=token (regression)", async () => {
    const profileId = "anthropic:default";
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        [profileId]: {
          type: "token",
          provider: "anthropic",
          token: "static-token",
          expires: Date.now() + 60_000,
        },
      },
    };

    const result = await resolveApiKeyForProfile({
      cfg: {
        auth: {
          profiles: {
            [profileId]: {
              provider: "anthropic",
              mode: "oauth",
            },
          },
        },
      },
      store,
      profileId,
    });

    expect(result?.apiKey).toBe("static-token");
  });

  it("rejects true mode/type mismatches", async () => {
    const result = await resolveOauthProfileForConfiguredMode("api_key");

    expect(result).toBeNull();
  });
});
