"use client";

import {
  ExternalLink,
  Clock,
  Layers,
  Play,
  Users,
  GitBranch,
  ChevronUp,
  Activity,
  MessageSquare,
  Zap,
  AlertCircle,
  Coins,
  Hash,
  Terminal,
  Bot,
  User,
  Wrench,
  CircleAlert,
  Loader2,
} from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useGateway } from "@/hooks/use-gateway";
import { getAgentTierInfo, getTierBadgeLabel, DEPARTMENT_COLORS } from "@/lib/matrix-tier-map";
import { getZoneById } from "@/lib/pixel-engine/layout/zone-layouts";
import { cn } from "@/lib/utils";
import {
  useVisualizeStore,
  type AgentActivity,
  type AgentEventEntry,
} from "@/store/visualize-store";

type SessionLogEntry = {
  role?: string;
  type?: string;
  content?: string;
  name?: string;
  timestamp?: number;
  model?: string;
  tool_calls?: Array<{ function?: { name?: string } }>;
};

type SessionsListEntry = {
  key: string;
  agentId?: string;
  state?: string;
  [key: string]: unknown;
};

export interface AgentDetailPanelProps {
  agentId: string | null;
  onClose: () => void;
  /** Called when user clicks "View Logs" — parent should open LogTerminalPanel filtered for this agent. */
  onViewLogs?: (agentName: string) => void;
}

function formatTimeAgo(ms?: number): string {
  if (!ms) {
    return "n/a";
  }
  const diff = Date.now() - ms;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTokens(tokens?: number): string {
  if (tokens == null) {
    return "n/a";
  }
  if (tokens < 1000) {
    return `${tokens}`;
  }
  if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

const ACTIVITY_CONFIG: Record<AgentActivity, { label: string; color: string; dotClass: string }> = {
  idle: { label: "Idle", color: "text-muted-foreground", dotClass: "bg-gray-400" },
  thinking: { label: "Thinking", color: "text-amber-400", dotClass: "bg-amber-400" },
  typing: { label: "Answering", color: "text-green-400", dotClass: "bg-green-400" },
  walking: { label: "Active", color: "text-blue-400", dotClass: "bg-blue-400" },
};

export function AgentDetailPanel({ agentId, onClose, onViewLogs }: AgentDetailPanelProps) {
  const { sendRpc } = useGateway();
  const agents = useVisualizeStore((s) => s.agents);
  const agentActivity = useVisualizeStore((s) => s.agentActivity);
  const agentEvents = useVisualizeStore((s) => s.agentEvents);
  const agentTokens = useVisualizeStore((s) => s.agentTokens);
  const activeTeams = useVisualizeStore((s) => s.activeTeams);
  const setSelectedAgentId = useVisualizeStore((s) => s.setSelectedAgentId);

  // Find agent from the store (already loaded via agents.list)
  const agent = agentId ? agents.find((a) => a.agentId === agentId) : null;
  const activity: AgentActivity = agentActivity[agentId ?? ""] ?? "idle";
  const activityCfg = ACTIVITY_CONFIG[activity];

  // Tier info
  const tierInfo = agent ? getAgentTierInfo(agent.name) : null;
  const zoneDef = agent ? getZoneById(agent.zone) : null;

  // Team participation
  const agentTeams = agentId
    ? activeTeams.filter((t) => t.memberAgentIds.includes(agentId) || t.leader === agentId)
    : [];

  // Child agents with their activity status
  const childAgents = tierInfo
    ? tierInfo.children.map((childName) => {
        const childAgent = agents.find((a) => a.name === childName);
        const childActivity = childAgent ? (agentActivity[childAgent.agentId] ?? "idle") : "idle";
        return { name: childName, activity: childActivity, agentId: childAgent?.agentId ?? null };
      })
    : [];

  // Parent agent
  const parentAgent = tierInfo?.parent ? agents.find((a) => a.name === tierInfo.parent) : null;

  // Recent live events (last 10, newest first)
  const events = agentId ? (agentEvents[agentId] ?? []).slice(-10).toReversed() : [];

  // Load recent activity logs from the agent's most recent session
  const [activityLogs, setActivityLogs] = useState<SessionLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadActivityLogs = useCallback(
    async (aid: string) => {
      setLogsLoading(true);
      setActivityLogs([]);
      try {
        // Find the most recent session for this agent
        const sessResult = await sendRpc<{ sessions: SessionsListEntry[] }>("sessions.list", {
          agentId: aid,
          limit: 1,
        });
        const sessions = sessResult.sessions ?? [];
        if (sessions.length === 0) {
          setLogsLoading(false);
          return;
        }
        // Load transcript entries from that session
        const logsResult = await sendRpc<{ logs: SessionLogEntry[] }>("sessions.usage.logs", {
          key: sessions[0].key,
          limit: 10,
        });
        setActivityLogs(logsResult.logs ?? []);
      } catch {
        // silent — not critical
      } finally {
        setLogsLoading(false);
      }
    },
    [sendRpc],
  );

  useEffect(() => {
    if (agentId) {
      void loadActivityLogs(agentId);
    } else {
      setActivityLogs([]);
    }
  }, [agentId, loadActivityLogs]);

  return (
    <Sheet
      open={agentId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {agent?.emoji && <span className="text-xl">{agent.emoji}</span>}
            <span className="font-mono">{agent?.name ?? agentId ?? "Agent"}</span>
          </SheetTitle>
          <SheetDescription>{agent?.role ?? "Agent details"}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4 overflow-auto flex-1 space-y-4">
          {agent ? (
            <>
              {/* Tier + Department badges */}
              {tierInfo && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-xs font-mono border-current"
                    style={{ color: tierInfo.color }}
                  >
                    {getTierBadgeLabel(tierInfo.tier)}
                  </Badge>
                  {agent.department && (
                    <Badge
                      variant="outline"
                      className="text-xs font-mono border-current capitalize"
                      style={{ color: DEPARTMENT_COLORS[agent.department] ?? "#888" }}
                    >
                      {agent.department}
                    </Badge>
                  )}
                </div>
              )}

              {/* Activity Status */}
              <DetailRow icon={Activity} label="Status">
                <div className="flex items-center gap-2">
                  <span className={cn("relative flex h-2.5 w-2.5")}>
                    <span
                      className={cn(
                        "absolute inline-flex h-full w-full rounded-full opacity-75",
                        activityCfg.dotClass,
                        activity !== "idle" && "animate-ping",
                      )}
                    />
                    <span
                      className={cn(
                        "relative inline-flex rounded-full h-2.5 w-2.5",
                        activityCfg.dotClass,
                      )}
                    />
                  </span>
                  <span className={cn("text-sm font-mono", activityCfg.color)}>
                    {activityCfg.label}
                  </span>
                </div>
              </DetailRow>

              {/* Zone */}
              {zoneDef && (
                <DetailRow icon={Layers} label="Zone">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: zoneDef.color }}
                    />
                    <span className="text-sm font-mono">{zoneDef.name}</span>
                  </div>
                </DetailRow>
              )}

              {/* Session state — show active if thinking/typing */}
              <DetailRow icon={Play} label="Session">
                {activity === "thinking" || activity === "typing" ? (
                  <Badge variant="default" className="bg-green-600 text-white text-xs">
                    Running
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">No active session</span>
                )}
              </DetailRow>

              {/* Token Usage */}
              {agentId && agentTokens[agentId] && (
                <>
                  <DetailRow icon={Coins} label="Tokens">
                    <span className="font-mono text-sm tabular-nums">
                      {formatTokens(agentTokens[agentId].totalTokens)}
                    </span>
                  </DetailRow>
                  <DetailRow icon={Hash} label="Sessions">
                    <span className="font-mono text-sm tabular-nums">
                      {agentTokens[agentId].sessionsCount}
                    </span>
                  </DetailRow>
                </>
              )}

              {/* Team Runs */}
              {agentTeams.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">Team Runs</span>
                  </div>
                  {agentTeams.map((team) => (
                    <div
                      key={team.id}
                      className="ml-6 rounded-md border border-border/50 px-3 py-2 text-xs space-y-1"
                    >
                      <div className="font-mono text-foreground">{team.name || team.id}</div>
                      <div className="text-muted-foreground">
                        {team.memberAgentIds.length} members &middot;{" "}
                        <span className="text-green-400">{team.state}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Parent (for Tier 2 & 3) */}
              {tierInfo && tierInfo.parent && (
                <DetailRow icon={ChevronUp} label="Reports to">
                  <button
                    type="button"
                    className="text-sm font-mono text-blue-400 hover:underline cursor-pointer"
                    onClick={() => {
                      if (parentAgent) {
                        setSelectedAgentId(parentAgent.agentId);
                      }
                    }}
                  >
                    {tierInfo.parent}
                  </button>
                </DetailRow>
              )}

              {/* Children (for Tier 1 & 2) */}
              {childAgents.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <GitBranch className="h-4 w-4" />
                    <span className="text-sm">
                      {tierInfo?.tier === 1 ? "Manages" : "Subagents"}
                      <span className="ml-1 text-xs text-muted-foreground/60">
                        ({childAgents.filter((c) => c.activity !== "idle").length}/
                        {childAgents.length} active)
                      </span>
                    </span>
                  </div>
                  <div className="ml-6 grid grid-cols-2 gap-1">
                    {childAgents.map((child) => {
                      const childCfg = ACTIVITY_CONFIG[child.activity];
                      return (
                        <button
                          type="button"
                          key={child.name}
                          className="flex items-center gap-1.5 text-xs font-mono py-1 px-1.5 rounded hover:bg-muted/50 cursor-pointer text-left"
                          onClick={() => {
                            if (child.agentId) {
                              setSelectedAgentId(child.agentId);
                            }
                          }}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", childCfg.dotClass)} />
                          <span className="truncate">{child.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Recent Activity</span>
                </div>

                {/* Live events (real-time, this browser session) */}
                {events.length > 0 && <ActivityFeed events={events} />}

                {/* Transcript activities loaded from backend */}
                {logsLoading ? (
                  <div className="ml-6 flex items-center gap-2 py-2">
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Loading activity...</span>
                  </div>
                ) : activityLogs.length > 0 ? (
                  <SessionLogsFeed logs={activityLogs} />
                ) : events.length === 0 ? (
                  <p className="ml-6 text-xs text-muted-foreground/60 italic">
                    No recent activity for this agent.
                  </p>
                ) : null}
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t space-y-2">
                {onViewLogs && agent && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => onViewLogs(agent.name)}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    View Agent Logs
                  </Button>
                )}
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a href="/usage">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Usage & Sessions
                  </a>
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No agent data available.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-sm">{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

// -- Live Activity Feed (real-time events) --

const EVENT_ICONS: Record<AgentEventEntry["type"], React.ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  session: Zap,
  team: Users,
  lifecycle: AlertCircle,
};

const EVENT_COLORS: Record<AgentEventEntry["type"], string> = {
  chat: "text-blue-400",
  session: "text-amber-400",
  team: "text-purple-400",
  lifecycle: "text-red-400",
};

function ActivityFeed({ events }: { events: AgentEventEntry[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events.length]);

  return (
    <div
      ref={scrollRef}
      className="ml-6 max-h-48 overflow-auto space-y-1 rounded-md border border-border/30 p-2"
    >
      {events.map((evt) => {
        const Icon = EVENT_ICONS[evt.type];
        const color = EVENT_COLORS[evt.type];
        return (
          <div
            key={evt.id}
            className="flex items-start gap-2 py-1 text-xs animate-in fade-in duration-300"
          >
            <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", color)} />
            <span className="font-mono text-muted-foreground flex-1">{evt.message}</span>
            <span className="text-muted-foreground/50 tabular-nums shrink-0">
              {formatTimeAgo(evt.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// -- Session Transcript Feed --

const LOG_ROLE_CONFIG: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  user: { icon: User, color: "text-blue-400", label: "User" },
  assistant: { icon: Bot, color: "text-green-400", label: "Assistant" },
  tool: { icon: Wrench, color: "text-orange-400", label: "Tool" },
  system: { icon: CircleAlert, color: "text-purple-400", label: "System" },
};

function truncateContent(content: string | undefined, maxLen = 120): string {
  if (!content) {
    return "";
  }
  const cleaned = content.replace(/\n+/g, " ").trim();
  if (cleaned.length <= maxLen) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLen)}...`;
}

function SessionLogsFeed({ logs }: { logs: SessionLogEntry[] }) {
  // Show last 5, newest at bottom
  const displayLogs = logs.slice(-5);

  return (
    <div className="ml-6 space-y-1 rounded-md border border-border/30 p-2 max-h-56 overflow-auto">
      {displayLogs.map((log, idx) => {
        const role = log.role ?? log.type ?? "system";
        const cfg = LOG_ROLE_CONFIG[role] ?? LOG_ROLE_CONFIG.system;
        const Icon = cfg.icon;

        let text = "";
        if (log.content) {
          text = truncateContent(log.content);
        } else if (log.tool_calls?.length) {
          const toolNames = log.tool_calls
            .map((tc) => tc.function?.name)
            .filter(Boolean)
            .join(", ");
          text = `Tool call: ${toolNames}`;
        } else if (log.name) {
          text = `[${log.name}]`;
        }

        if (!text) {
          return null;
        }

        return (
          <div key={idx} className="flex items-start gap-2 py-1 text-xs">
            <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", cfg.color)} />
            <div className="flex-1 min-w-0">
              <span className={cn("text-[10px] font-mono", cfg.color)}>{cfg.label}</span>
              <p className="font-mono text-muted-foreground leading-relaxed break-words">{text}</p>
            </div>
            {log.timestamp && (
              <span className="text-muted-foreground/40 tabular-nums shrink-0 text-[10px]">
                {formatTimeAgo(log.timestamp)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
