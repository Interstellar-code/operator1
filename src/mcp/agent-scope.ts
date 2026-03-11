/**
 * MCP per-agent server scoping.
 *
 * If agentScopes is configured and the agent is listed, only those servers are available.
 * If the agent is not listed, all servers are available (default open).
 */

/** Check if a server is accessible to an agent. */
export function isServerAccessible(
  serverKey: string,
  agentId: string | undefined,
  agentScopes: Record<string, string[]> | undefined,
): boolean {
  if (!agentId || !agentScopes) {
    return true;
  }
  if (!(agentId in agentScopes)) {
    return true;
  } // Not listed = all access
  return agentScopes[agentId].includes(serverKey);
}

/** Filter server keys based on agent scope. */
export function filterServersByAgent(
  serverKeys: string[],
  agentId: string | undefined,
  agentScopes: Record<string, string[]> | undefined,
): string[] {
  if (!agentId || !agentScopes) {
    return serverKeys;
  }
  if (!(agentId in agentScopes)) {
    return serverKeys;
  }
  const allowed = new Set(agentScopes[agentId]);
  return serverKeys.filter((key) => allowed.has(key));
}
