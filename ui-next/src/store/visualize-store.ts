import { create } from "zustand";
import { getAgentZone } from "@/lib/pixel-engine/layout/zone-layouts";
import type { AgentRow } from "@/types/agents";

// --- Types ---

export type AgentActivity = "idle" | "typing" | "walking" | "thinking";

export type AgentEventEntry = {
  id: number;
  type: "chat" | "session" | "team" | "lifecycle";
  timestamp: number;
  message: string;
};

export type TeamRunEntry = {
  id: string;
  name: string;
  leader: string;
  memberAgentIds: string[];
  state: string;
};

export type AgentCharacter = {
  agentId: string;
  name: string;
  zone: string;
  seatIndex: number;
  hueShift: number;
  characterId: number;
  role?: string;
  department?: string;
  emoji?: string;
};

// --- Store ---

export type AgentTokenUsage = {
  totalTokens: number;
  sessionsCount: number;
};

export type VisualizeState = {
  isActive: boolean;
  agents: AgentCharacter[];
  agentActivity: Record<string, AgentActivity>;
  agentEvents: Record<string, AgentEventEntry[]>;
  agentTokens: Record<string, AgentTokenUsage>;
  activeTeams: TeamRunEntry[];
  selectedAgentId: string | null;
  zoom: number;
  totalActiveCount: number;
  totalTokens: number;
  isLocked: boolean;

  // Actions
  syncAgents: (agentList: AgentRow[]) => void;
  updateActivity: (agentId: string, state: AgentActivity) => void;
  pushAgentEvent: (agentId: string, type: AgentEventEntry["type"], message: string) => void;
  setAgentTokens: (tokens: Record<string, AgentTokenUsage>) => void;
  setActiveTeams: (teams: TeamRunEntry[]) => void;
  handleAgentEvent: (payload: unknown) => void;
  handlePresenceEvent: (payload: unknown) => void;
  handleChatEvent: (payload: unknown) => void;
  setActive: (isActive: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;
  setZoom: (zoom: number) => void;
  setIsLocked: (locked: boolean) => void;
  reset: () => void;
};

const ZOOM_STORAGE_KEY = "visualize-zoom";

function loadPersistedZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  return 1;
}

const MAX_EVENTS_PER_AGENT = 50;
let eventIdCounter = 0;

const initialState = {
  isActive: false,
  agents: [] as AgentCharacter[],
  agentActivity: {} as Record<string, AgentActivity>,
  agentEvents: {} as Record<string, AgentEventEntry[]>,
  agentTokens: {} as Record<string, AgentTokenUsage>,
  activeTeams: [] as TeamRunEntry[],
  selectedAgentId: null as string | null,
  zoom: loadPersistedZoom(),
  totalActiveCount: 0,
  totalTokens: 0,
  isLocked: false,
};

/** Immutable helper: append an event to a per-agent events record. */
function pushEvent(
  events: Record<string, AgentEventEntry[]>,
  agentId: string,
  type: AgentEventEntry["type"],
  message: string,
): Record<string, AgentEventEntry[]> {
  const existing = events[agentId] ?? [];
  const entry: AgentEventEntry = { id: ++eventIdCounter, type, timestamp: Date.now(), message };
  return { ...events, [agentId]: [...existing, entry].slice(-MAX_EVENTS_PER_AGENT) };
}

/** Track per-zone seat indices for deterministic character placement */
function mapAgentsToCharacters(agentList: AgentRow[]): AgentCharacter[] {
  const zoneSeatCounters: Record<string, number> = {};

  return agentList.map((agent, idx) => {
    const name = agent.name ?? agent.id;
    const zoneEntry = getAgentZone(name);
    const zone = zoneEntry.zone;

    const seatIndex = zoneSeatCounters[zone] ?? 0;
    zoneSeatCounters[zone] = seatIndex + 1;

    return {
      agentId: agent.id,
      name,
      zone,
      seatIndex,
      hueShift: zoneEntry.hueShift,
      characterId: idx,
      role: agent.role,
      department: agent.department,
      emoji: agent.identity?.emoji,
    };
  });
}

export const useVisualizeStore = create<VisualizeState>((set) => ({
  ...initialState,

  syncAgents: (agentList) =>
    set(() => {
      const agents = mapAgentsToCharacters(agentList);
      return {
        agents,
        totalActiveCount: agents.length,
      };
    }),

  updateActivity: (agentId, state) =>
    set((prev) => ({
      agentActivity: { ...prev.agentActivity, [agentId]: state },
    })),

  pushAgentEvent: (agentId, type, message) =>
    set((prev) => {
      const existing = prev.agentEvents[agentId] ?? [];
      const entry: AgentEventEntry = {
        id: ++eventIdCounter,
        type,
        timestamp: Date.now(),
        message,
      };
      const updated = [...existing, entry].slice(-MAX_EVENTS_PER_AGENT);
      return { agentEvents: { ...prev.agentEvents, [agentId]: updated } };
    }),

  setAgentTokens: (tokens) => set({ agentTokens: tokens }),

  setActiveTeams: (teams) => set({ activeTeams: teams }),

  handleAgentEvent: (payload) => {
    const evt = payload as
      | {
          type?: string;
          agentId?: string;
          agents?: AgentRow[];
        }
      | undefined;
    if (!evt) {
      return;
    }

    // Full agent list refresh
    if (evt.agents && Array.isArray(evt.agents)) {
      set(() => {
        const agents = mapAgentsToCharacters(evt.agents!);
        return { agents, totalActiveCount: agents.length };
      });
      return;
    }

    // Single agent lifecycle events
    if (evt.type === "stopped" && evt.agentId) {
      set((prev) => {
        const agents = prev.agents.filter((a) => a.agentId !== evt.agentId);
        const { [evt.agentId!]: _, ...activity } = prev.agentActivity;
        return {
          agents,
          agentActivity: activity,
          totalActiveCount: agents.length,
          selectedAgentId: prev.selectedAgentId === evt.agentId ? null : prev.selectedAgentId,
        };
      });
    }
  },

  handlePresenceEvent: (payload) => {
    const evt = payload as
      | {
          presence?: Array<{ clientId?: string; mode?: string }>;
        }
      | undefined;
    if (!evt?.presence || !Array.isArray(evt.presence)) {
      return;
    }

    set((prev) => ({
      totalActiveCount: Math.max(prev.agents.length, evt.presence!.length),
    }));
  },

  handleChatEvent: (payload) => {
    const evt = payload as
      | {
          agentId?: string;
          state?: string;
          runId?: string;
          sessionKey?: string;
        }
      | undefined;
    let agentId = evt?.agentId;
    if (!agentId && evt?.sessionKey) {
      // Try to infer from sessionKey (e.g. "agent:Operator1:main" -> "Operator1", or "main" -> "main")
      const parts = evt.sessionKey.split(":");
      if (parts.length >= 3 && parts[0] === "agent") {
        agentId = parts[1];
      } else if (parts.length === 1) {
        agentId = "main";
      }
    }

    if (!agentId) {
      return;
    }

    if (evt?.state === "started" || evt?.state === "delta") {
      set((prev) => {
        // Push event only on "started" (skip noisy deltas)
        const events =
          evt?.state === "started"
            ? pushEvent(prev.agentEvents, agentId, "chat", "Started processing message")
            : prev.agentEvents;
        return {
          agentActivity: { ...prev.agentActivity, [agentId]: "typing" },
          agentEvents: events,
        };
      });
    } else if (evt?.state === "final" || evt?.state === "error") {
      set((prev) => {
        const errorMessage: string =
          typeof (evt as Record<string, unknown>).errorMessage === "string"
            ? ((evt as Record<string, unknown>).errorMessage as string)
            : "unknown";
        const msg = evt?.state === "error" ? `Error: ${errorMessage}` : "Completed response";
        const events = pushEvent(prev.agentEvents, agentId, "chat", msg);
        // Only clear if we are currently typing - if we are 'thinking' due to
        // pollSessions, we should leave it as 'thinking'.
        const current = prev.agentActivity[agentId];
        if (current === "typing") {
          return {
            agentActivity: { ...prev.agentActivity, [agentId]: "thinking" },
            agentEvents: events,
          };
        }
        return { agentEvents: events };
      });
    }
  },

  setActive: (isActive) => set({ isActive }),

  setSelectedAgentId: (id) => set({ selectedAgentId: id }),

  setZoom: (zoom) => {
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      // ignore storage errors
    }
    set({ zoom });
  },

  setIsLocked: (locked) => set({ isLocked: locked }),

  reset: () => set(initialState),
}));
