import { useCallback } from "react";
import {
  useVisualizeStore,
  type AgentActivity,
  type AgentTokenUsage,
  type TeamRunEntry,
} from "@/store/visualize-store";
import type { AgentListResult } from "@/types/agents";
import { useGateway } from "./use-gateway";

type SessionEntry = {
  key: string;
  agentId?: string;
  state?: string;
  totalTokens?: number;
  [key: string]: unknown;
};

type SessionsListResult = {
  sessions: SessionEntry[];
};

type TeamRunMember = {
  agentId: string;
  [key: string]: unknown;
};

type TeamRunRpcEntry = {
  id: string;
  name: string;
  leader: string;
  members: TeamRunMember[];
  state: string;
  [key: string]: unknown;
};

type TeamRunsListResult = {
  teams: TeamRunRpcEntry[];
};

export function useVisualize() {
  const { sendRpc } = useGateway();
  const store = useVisualizeStore();

  const loadAgents = useCallback(async () => {
    try {
      const result = await sendRpc<AgentListResult>("agents.list");
      useVisualizeStore.getState().syncAgents(result.agents);
    } catch (err) {
      console.error("[visualize] failed to load agents:", err);
    }
  }, [sendRpc]);

  const pollTeamRuns = useCallback(async () => {
    try {
      const result = await sendRpc<TeamRunsListResult>("teamRuns.list", { state: "active" });
      const teams: TeamRunEntry[] = (result.teams ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        leader: t.leader,
        memberAgentIds: (t.members ?? []).map((m) => m.agentId),
        state: t.state,
      }));
      useVisualizeStore.getState().setActiveTeams(teams);
    } catch (err) {
      console.error("[visualize] failed to poll team runs:", err);
    }
  }, [sendRpc]);

  const pollSessions = useCallback(async () => {
    try {
      const result = await sendRpc<SessionsListResult>("sessions.list", { limit: 200 });
      const activeAgentIds = new Set<string>();
      const tokenMap: Record<string, AgentTokenUsage> = {};
      for (const session of result.sessions ?? []) {
        if (session.agentId && session.state === "running") {
          activeAgentIds.add(session.agentId);
        }
        // Aggregate token counts per agent
        if (session.agentId && typeof session.totalTokens === "number") {
          const existing = tokenMap[session.agentId] ?? { totalTokens: 0, sessionsCount: 0 };
          existing.totalTokens += session.totalTokens;
          existing.sessionsCount += 1;
          tokenMap[session.agentId] = existing;
        }
      }

      const vizStore = useVisualizeStore.getState();
      const updated: Record<string, AgentActivity> = { ...vizStore.agentActivity };
      const { pushAgentEvent } = vizStore;
      for (const agent of vizStore.agents) {
        const currentActivity = updated[agent.agentId] || "idle";

        if (activeAgentIds.has(agent.agentId)) {
          // If agent is active and currently idle, set to thinking.
          // If they are 'typing', leave them as 'typing'.
          if (currentActivity === "idle") {
            updated[agent.agentId] = "thinking";
            pushAgentEvent(agent.agentId, "session", "Session started");
          }
        } else {
          // If agent is NOT active but they are marked as 'thinking',
          // they might have just finished their session. So we revert them to 'idle'.
          // WARNING: We must NOT clear 'typing' here because 'typing' events flow independently
          // through the chat gateway and can occasionally flicker if poll arrives during a tiny session gap.
          if (currentActivity === "thinking") {
            updated[agent.agentId] = "idle";
            pushAgentEvent(agent.agentId, "session", "Session ended");
          }
        }
      }

      useVisualizeStore.setState({ agentActivity: updated, agentTokens: tokenMap });
    } catch (err) {
      console.error("[visualize] failed to poll sessions:", err);
    }
  }, [sendRpc]);

  return {
    loadAgents,
    pollSessions,
    pollTeamRuns,
    isActive: store.isActive,
    agents: store.agents,
    agentActivity: store.agentActivity,
    selectedAgentId: store.selectedAgentId,
    zoom: store.zoom,
    totalActiveCount: store.totalActiveCount,
    totalTokens: store.totalTokens,
  };
}
