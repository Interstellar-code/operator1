"use client";

import { ZoomIn, ZoomOut, Maximize2, Minimize2, Focus, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onToggleLock: () => void;
  isLocked: boolean;
}

export function Controls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitView,
  onToggleFullscreen,
  isFullscreen,
  onToggleLock,
  isLocked,
}: ControlsProps) {
  return (
    <div className="absolute bottom-14 right-4 flex flex-col gap-1 z-10">
      <Button
        variant="outline"
        size="icon"
        onClick={onZoomIn}
        disabled={zoom >= 3}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <ZoomIn className="h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={onZoomOut}
        disabled={zoom <= 0.25}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <ZoomOut className="h-4 w-4" />
      </Button>

      <Button
        variant={isLocked ? "default" : "outline"}
        size="icon"
        onClick={onToggleLock}
        aria-label={isLocked ? "Unlock canvas pan/zoom" : "Lock canvas pan/zoom"}
        title={isLocked ? "Unlock canvas" : "Lock canvas"}
      >
        {isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={onFitView}
        aria-label="Fit to view"
        title="Fit to view"
      >
        <Focus className="h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={onToggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
      </Button>
    </div>
  );
}
