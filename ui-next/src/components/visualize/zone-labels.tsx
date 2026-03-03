"use client";

export interface ZoneLabelProps {
  zones: Array<{
    name: string;
    color: string;
    x: number;
    y: number;
    agentCount: number;
  }>;
}

export function ZoneLabels({ zones }: ZoneLabelProps) {
  return (
    <>
      {zones.map((zone) => (
        <div
          key={zone.name}
          className="absolute pointer-events-none select-none z-[5]"
          style={{
            left: zone.x,
            top: zone.y,
            transform: "translate(0, -50%)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="text-sm font-bold tracking-widest uppercase"
              style={{
                color: zone.color,
                textShadow: `0 0 4px ${zone.color}, 0 2px 4px rgba(0,0,0,0.8)`,
              }}
            >
              {zone.name}
            </div>
            <div
              className="text-xs font-mono font-semibold"
              style={{
                color: "rgba(255,255,255,0.7)",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              }}
            >
              {zone.agentCount} {zone.agentCount === 1 ? "AGENT" : "AGENTS"}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
