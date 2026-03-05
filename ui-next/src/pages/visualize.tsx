import { useEffect, useRef, useCallback, useState } from "react";
import { AgentDetailPanel } from "@/components/visualize/agent-detail-panel";
import { Controls } from "@/components/visualize/controls";
import { LogTerminalPanel, type TerminalMeta } from "@/components/visualize/log-terminal-panel";
import {
  MatrixCanvas,
  type AgentCharacter,
  type MatrixCanvasHandle,
} from "@/components/visualize/matrix-canvas";
import { MatrixRainBackground } from "@/components/visualize/matrix-rain-background";
import { StatusBar } from "@/components/visualize/status-bar";
import { TeamOverlay } from "@/components/visualize/team-overlay";
import { ZoneLabels } from "@/components/visualize/zone-labels";
import { useVisualize } from "@/hooks/use-visualize";
import { ZOOM_MIN, ZOOM_MAX, TILE_SIZE } from "@/lib/pixel-engine/constants";
import { ZONE_DEFINITIONS } from "@/lib/pixel-engine/layout/zone-layouts";
import { useGatewayStore } from "@/store/gateway-store";
import { useVisualizeStore } from "@/store/visualize-store";

const POLL_INTERVAL_MS = 5000;
const ZOOM_STEP = 0.5;
const DEFAULT_ZOOM = 1;

export function VisualizePage() {
  const isConnected = useGatewayStore((s) => s.connectionStatus === "connected");
  const { loadAgents, pollSessions, pollTeamRuns } = useVisualize();
  const agents = useVisualizeStore((s) => s.agents);
  const agentActivity = useVisualizeStore((s) => s.agentActivity);
  const selectedAgentId = useVisualizeStore((s) => s.selectedAgentId);
  const zoom = useVisualizeStore((s) => s.zoom);
  const totalActiveCount = useVisualizeStore((s) => s.totalActiveCount);
  const totalTokens = useVisualizeStore((s) => s.totalTokens);
  const activeTeams = useVisualizeStore((s) => s.activeTeams);
  const setZoom = useVisualizeStore((s) => s.setZoom);
  const setSelectedAgentId = useVisualizeStore((s) => s.setSelectedAgentId);
  const setActive = useVisualizeStore((s) => s.setActive);
  const isLocked = useVisualizeStore((s) => s.isLocked);
  const setIsLocked = useVisualizeStore((s) => s.setIsLocked);

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [selectedTerminalId, setSelectedTerminalId] = useState<string | null>(null);
  const [agentTerminalMeta, setAgentTerminalMeta] = useState<TerminalMeta | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<MatrixCanvasHandle>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Activate on mount, deactivate on unmount
  useEffect(() => {
    setActive(true);
    return () => {
      setActive(false);
    };
  }, [setActive]);

  // Load agents and start polling when connected
  useEffect(() => {
    if (!isConnected) {
      return;
    }

    void loadAgents();
    void pollSessions();
    void pollTeamRuns();

    pollRef.current = setInterval(() => {
      void loadAgents();
      void pollSessions();
      void pollTeamRuns();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isConnected, loadAgents, pollSessions, pollTeamRuns]);

  // Map store agents to canvas characters
  const canvasAgents: AgentCharacter[] = agents.map((a) => {
    const activity = agentActivity[a.agentId] ?? "idle";
    let statusMessage = null;
    if (activity === "thinking") {
      statusMessage = "Thinking...";
    } else if (activity === "typing") {
      statusMessage = "Answering...";
    }

    return {
      id: a.characterId,
      name: a.name,
      isActive: activity !== "idle",
      currentTool: activity === "typing" ? "typing" : null,
      statusMessage,
    };
  });

  const handleCharacterClick = useCallback(
    (characterId: number) => {
      const agent = agents.find((a) => a.characterId === characterId);
      if (agent) {
        setSelectedTerminalId(null); // close terminal panel before opening agent panel
        setAgentTerminalMeta(null);
        setSelectedAgentId(agent.agentId);
      }
    },
    [agents, setSelectedAgentId],
  );

  const handleViewAgentLogs = useCallback(
    (agentName: string) => {
      // Close detail panel, open LogTerminalPanel filtered for this agent
      setSelectedAgentId(null);
      const nameLower = agentName.toLowerCase();
      setAgentTerminalMeta({
        label: agentName.toUpperCase(),
        accentClass: "text-cyan-400 border-cyan-500/40",
        keywords: [nameLower, `agent/${nameLower}`, `session/${nameLower}`, agentName],
      });
      setSelectedTerminalId(`agent-${nameLower}`);
    },
    [setSelectedAgentId],
  );

  const handleZoomIn = useCallback(() => {
    if (isLocked) {
      return;
    }
    setZoom(Math.min(ZOOM_MAX, zoom + ZOOM_STEP));
  }, [zoom, setZoom, isLocked]);

  const handleZoomOut = useCallback(() => {
    if (isLocked) {
      return;
    }
    setZoom(Math.max(ZOOM_MIN, zoom - ZOOM_STEP));
  }, [zoom, setZoom, isLocked]);

  const handleFitView = useCallback(() => {
    if (isLocked) {
      return;
    }
    setZoom(DEFAULT_ZOOM);
  }, [setZoom, isLocked]);

  const handleToggleLock = useCallback(() => {
    setIsLocked(!isLocked);
  }, [isLocked, setIsLocked]);

  const handleToggleFullscreen = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    if (!document.fullscreenElement) {
      void containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Listen for fullscreen exit via Escape (browser handles it)
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }

      switch (e.key) {
        case "Escape":
          if (selectedTerminalId) {
            setSelectedTerminalId(null);
          } else {
            setSelectedAgentId(null);
          }
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
        case "0":
          handleFitView();
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setSelectedAgentId, handleZoomIn, handleZoomOut, handleFitView]);

  // Build zone label data based on current agent assignments
  const zoneLabels = ZONE_DEFINITIONS.map((zone) => {
    const agentCount = agents.filter((a) => a.zone === zone.id).length;
    return {
      name: zone.name,
      color: zone.color,
      // Position labels cleanly on the left side of the top border wall
      x: (zone.col + 0.5) * TILE_SIZE * zoom,
      y: (zone.row + 0.5) * TILE_SIZE * zoom,
      agentCount,
    };
  });

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col bg-black">
      {/* Canvas fills available space */}
      <div
        className="relative flex-1 overflow-hidden"
        role="img"
        aria-label="Matrix agent visualization canvas"
      >
        <MatrixRainBackground />

        <MatrixCanvas
          ref={canvasRef}
          agents={canvasAgents}
          zoom={zoom}
          onZoomChange={setZoom}
          onCharacterClick={handleCharacterClick}
          onTerminalClick={(id) => {
            setAgentTerminalMeta(null);
            setSelectedTerminalId(id);
          }}
          isLocked={isLocked}
        >
          {/* Zone labels overlay */}
          <ZoneLabels zones={zoneLabels} />
        </MatrixCanvas>

        {/* Active team runs overlay */}
        <TeamOverlay teams={activeTeams} />

        {/* Controls overlay */}
        <Controls
          zoom={zoom}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitView={handleFitView}
          onToggleFullscreen={handleToggleFullscreen}
          isFullscreen={isFullscreen}
          onToggleLock={handleToggleLock}
          isLocked={isLocked}
        />

        {/* Log Terminal Panel */}
        {selectedTerminalId && (
          <LogTerminalPanel
            terminalId={selectedTerminalId}
            meta={agentTerminalMeta ?? undefined}
            onClose={() => {
              setSelectedTerminalId(null);
              setAgentTerminalMeta(null);
            }}
          />
        )}
      </div>

      {/* Status bar at bottom */}
      <StatusBar activeCount={totalActiveCount} totalTokens={totalTokens} zoom={zoom} />

      {/* Agent detail panel (sheet overlay) */}
      <AgentDetailPanel
        agentId={selectedAgentId}
        onClose={() => setSelectedAgentId(null)}
        onViewLogs={handleViewAgentLogs}
      />
    </div>
  );
}
