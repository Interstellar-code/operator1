import type { PluginRegistry } from "../plugins/registry.js";
import type { PluginHookSubagentSpawningEvent } from "../plugins/types.js";

/**
 * Built-in subagent_spawning hook for the webchat channel.
 *
 * Webchat has no physical threads (unlike Discord). The hook simply acknowledges
 * the spawn request so `ensureThreadBindingForSubagentSpawn` succeeds. Delivery
 * falls back to injecting into the parent session, which is the correct behavior.
 */
async function webchatSubagentSpawningHandler(
  event: PluginHookSubagentSpawningEvent,
): Promise<{ status: "ok"; threadBindingReady: boolean } | undefined> {
  if (!event.threadRequested) {
    return;
  }

  const channel = event.requester?.channel?.trim().toLowerCase();
  if (channel !== "webchat") {
    // Not a webchat request — pass through to other handlers (e.g. Discord).
    return;
  }

  return { status: "ok", threadBindingReady: true };
}

/**
 * Register built-in webchat subagent hooks on the plugin registry.
 * Call after `loadOpenClawPlugins()` so hooks are visible to the global hook runner.
 */
export function registerWebchatSubagentHooks(registry: PluginRegistry): void {
  registry.typedHooks.push({
    pluginId: "webchat-builtin",
    hookName: "subagent_spawning",
    handler: webchatSubagentSpawningHandler,
    priority: 0,
    source: "builtin",
  });
}
