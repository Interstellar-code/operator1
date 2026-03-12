import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import { saveAuthProfileStoreToDb } from "./auth-profiles-sqlite.js";
import { resolveSessionAuthProfileOverride } from "./session-override.js";
import { useAuthProfilesTestDb } from "./test-helpers.auth-profiles.js";

describe("resolveSessionAuthProfileOverride", () => {
  useAuthProfilesTestDb();

  it("keeps user override when provider alias differs", async () => {
    saveAuthProfileStoreToDb({
      version: 1,
      profiles: {
        "zai:work": { type: "api_key", provider: "zai", key: "sk-test" },
      },
      order: {
        zai: ["zai:work"],
      },
    });

    const sessionEntry: SessionEntry = {
      sessionId: "s1",
      updatedAt: Date.now(),
      authProfileOverride: "zai:work",
      authProfileOverrideSource: "user",
    };
    const sessionStore = { "agent:main:main": sessionEntry };

    const resolved = await resolveSessionAuthProfileOverride({
      cfg: {} as OpenClawConfig,
      provider: "z.ai",
      agentDir: undefined,
      sessionEntry,
      sessionStore,
      sessionKey: "agent:main:main",
      storePath: undefined,
      isNewSession: false,
    });

    expect(resolved).toBe("zai:work");
    expect(sessionEntry.authProfileOverride).toBe("zai:work");
  });
});
