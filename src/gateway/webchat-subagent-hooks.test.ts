import { describe, expect, it } from "vitest";
import type { PluginRegistry } from "../plugins/registry.js";
import { registerWebchatSubagentHooks } from "./webchat-subagent-hooks.js";

function makeMinimalRegistry(): PluginRegistry {
  return { typedHooks: [] } as unknown as PluginRegistry;
}

function makeEvent(channel?: string) {
  return {
    childSessionKey: "child-123",
    agentId: "neo",
    mode: "session" as const,
    threadRequested: true,
    requester: { channel },
  };
}

describe("webchat subagent hooks", () => {
  describe("registerWebchatSubagentHooks", () => {
    it("pushes a subagent_spawning hook entry onto the registry", () => {
      const registry = makeMinimalRegistry();
      registerWebchatSubagentHooks(registry);

      expect(registry.typedHooks).toHaveLength(1);
      expect(registry.typedHooks[0]).toMatchObject({
        pluginId: "webchat-builtin",
        hookName: "subagent_spawning",
        source: "builtin",
        priority: 0,
      });
      expect(typeof registry.typedHooks[0].handler).toBe("function");
    });
  });

  describe("handler", () => {
    function getHandler() {
      const registry = makeMinimalRegistry();
      registerWebchatSubagentHooks(registry);
      return registry.typedHooks[0].handler as (
        event: ReturnType<typeof makeEvent>,
      ) => Promise<{ status: "ok"; threadBindingReady: boolean } | undefined>;
    }

    it("returns ok with threadBindingReady for webchat channel", async () => {
      const handler = getHandler();
      const result = await handler(makeEvent("webchat"));
      expect(result).toEqual({ status: "ok", threadBindingReady: true });
    });

    it("handles mixed-case webchat channel", async () => {
      const handler = getHandler();
      const result = await handler(makeEvent("  WebChat  "));
      expect(result).toEqual({ status: "ok", threadBindingReady: true });
    });

    it("returns undefined for non-webchat channels", async () => {
      const handler = getHandler();
      expect(await handler(makeEvent("discord"))).toBeUndefined();
      expect(await handler(makeEvent("telegram"))).toBeUndefined();
      expect(await handler(makeEvent("slack"))).toBeUndefined();
    });

    it("returns undefined when channel is undefined", async () => {
      const handler = getHandler();
      expect(await handler(makeEvent(undefined))).toBeUndefined();
    });

    it("returns undefined when channel is empty string", async () => {
      const handler = getHandler();
      expect(await handler(makeEvent(""))).toBeUndefined();
    });

    it("returns undefined when threadRequested is false", async () => {
      const handler = getHandler();
      const event = { ...makeEvent("webchat"), threadRequested: false };
      expect(await handler(event)).toBeUndefined();
    });
  });
});
