/**
 * Matrix-themed zone layouts for the Visualize page.
 *
 * Defines a multi-zone world with themed areas connected by corridors.
 * Each zone houses a group of agents with zone-specific floor coloring.
 */

import { TileType, FurnitureType } from "../types.js";
import type {
  TileType as TileTypeVal,
  OfficeLayout,
  PlacedFurniture,
  FloorColor,
} from "../types.js";

// -- Zone Definitions ---------------------------------------------------------

export interface ZoneDefinition {
  id: string;
  name: string;
  description: string;
  /** Hue for floor tint (0-360) */
  hue: number;
  /** Grid position (top-left corner of zone) */
  col: number;
  row: number;
  /** Zone dimensions in tiles */
  width: number;
  height: number;
  /** CSS color for UI labels */
  color: string;
}

export const ZONE_DEFINITIONS: ZoneDefinition[] = [
  {
    id: "broadcast",
    name: "The Broadcast",
    description: "Signal transmission hub",
    hue: 0,
    col: 12,
    row: 14,
    width: 9,
    height: 9,
    color: "#ffffff",
  },
  {
    id: "machine-city",
    name: "Machine City",
    description: "Heart of the machines",
    hue: 120,
    col: 23,
    row: 14,
    width: 9,
    height: 9,
    color: "#00ff41",
  },
  {
    id: "zion",
    name: "Zion",
    description: "Last human city",
    hue: 220,
    col: 1,
    row: 14,
    width: 9,
    height: 9,
    color: "#4488ff",
  },
  {
    id: "construct",
    name: "The Construct",
    description: "Central loading program",
    hue: 280,
    col: 1,
    row: 24,
    width: 31,
    height: 6,
    color: "#cc66ff",
  },
  {
    id: "matrix",
    name: "The Matrix Core",
    description: "Cyberpunk Digital Frontier",
    hue: 180,
    col: 1,
    row: 2,
    width: 31,
    height: 9,
    color: "#ff0033",
  },
];

// -- Zone-Agent Mapping -------------------------------------------------------

export interface ZoneAgentEntry {
  agentName: string;
  zone: string;
  /** Deterministic palette index */
  palette: number;
  /** Hue shift for zone coloring */
  hueShift: number;
}

/**
 * Map of agent names to their zone assignments.
 * Keys are agent display names; values are zone metadata.
 */
export const ZONE_AGENT_MAP: Record<string, ZoneAgentEntry> = {
  // The Broadcast (center, id="broadcast") — Operator1 only
  Operator1: { agentName: "Operator1", zone: "broadcast", palette: 6, hueShift: 0 },

  // Machine City (Tier 3/Subagents) — Tank, Dozer, Mouse + Niobe, Switch, Rex + Oracle, Seraph, Zee
  Tank: { agentName: "Tank", zone: "machine-city", palette: 2, hueShift: 45 },
  Dozer: { agentName: "Dozer", zone: "machine-city", palette: 3, hueShift: 45 },
  Mouse: { agentName: "Mouse", zone: "machine-city", palette: 4, hueShift: 45 },
  Niobe: { agentName: "Niobe", zone: "machine-city", palette: 5, hueShift: 45 },
  Switch: { agentName: "Switch", zone: "machine-city", palette: 1, hueShift: 60 },
  Rex: { agentName: "Rex", zone: "machine-city", palette: 0, hueShift: 60 },
  Oracle: { agentName: "Oracle", zone: "machine-city", palette: 1, hueShift: 90 },
  Seraph: { agentName: "Seraph", zone: "machine-city", palette: 2, hueShift: 90 },
  Zee: { agentName: "Zee", zone: "machine-city", palette: 3, hueShift: 90 },

  // Zion (Tier 2) — Neo, Morpheus, Trinity
  Neo: { agentName: "Neo", zone: "zion", palette: 7, hueShift: 90 },
  Morpheus: { agentName: "Morpheus", zone: "zion", palette: 8, hueShift: 90 },
  Trinity: { agentName: "Trinity", zone: "zion", palette: 9, hueShift: 90 },
};

/** Get zone assignment for an agent name, or default to machine-city */
export function getAgentZone(agentName: string): ZoneAgentEntry {
  return (
    ZONE_AGENT_MAP[agentName] ?? {
      agentName,
      zone: "machine-city",
      palette: hashString(agentName) % 6,
      hueShift: 0,
    }
  );
}

/** Get zone definition by id */
export function getZoneById(zoneId: string): ZoneDefinition | undefined {
  return ZONE_DEFINITIONS.find((z) => z.id === zoneId);
}

// -- Layout Builder -----------------------------------------------------------

const COLS = 32;
const ROWS = 32;

/** Zone floor color configs */
const ZONE_COLORS: Record<string, FloorColor> = {
  broadcast: { h: 0, s: 0, b: 30, c: 10, colorize: true },
  "machine-city": { h: 120, s: 40, b: 10, c: 5, colorize: true },
  zion: { h: 220, s: 35, b: 5, c: 5, colorize: true },
  construct: { h: 280, s: 35, b: 5, c: 5, colorize: true },
  matrix: { h: 180, s: 0, b: -20, c: 5, colorize: true },
  corridor: { h: 0, s: 0, b: -10, c: 0 },
};

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Build the Matrix world layout.
 *
 * Grid is 32x20 with 4 zones connected by corridors:
 *   - Zion (left, rows 2-9)
 *   - The Construct (center, rows 3-9)
 *   - Machine City (right, rows 2-9)
 *   - The Broadcast (bottom, rows 13-18)
 *   - Corridors connect all zones
 */
function buildWorldLayout(): OfficeLayout {
  const W = TileType.WALL;
  const F1 = TileType.FLOOR_1;
  const F2 = TileType.FLOOR_2;
  const F3 = TileType.FLOOR_3;
  const F4 = TileType.FLOOR_4;
  const F5 = TileType.FLOOR_5;
  const V = TileType.VOID;

  // Floor pattern pool for varied zones (creates a mosaic effect)
  const FLOOR_PATTERNS = [F1, F2, F3, F4, F5];

  // Initialize all tiles as void
  const tiles: TileTypeVal[] = Array.from({ length: COLS * ROWS }, () => V);
  const tileColors: Array<FloorColor | null> = Array.from({ length: COLS * ROWS }, () => null);

  // Helper to fill a rectangular zone
  function fillZone(
    zoneCol: number,
    zoneRow: number,
    w: number,
    h: number,
    zoneId: string,
    wallBorder = true,
    variedFloor = false,
  ) {
    const color = ZONE_COLORS[zoneId] ?? ZONE_COLORS.corridor;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const gr = zoneRow + r;
        const gc = zoneCol + c;
        if (gr < 0 || gr >= ROWS || gc < 0 || gc >= COLS) {
          continue;
        }
        const idx = gr * COLS + gc;
        if (wallBorder && (r === 0 || r === h - 1 || c === 0 || c === w - 1)) {
          tiles[idx] = W;
          tileColors[idx] = null;
        } else {
          // Use varied floor patterns for a mosaic effect
          if (variedFloor) {
            const patIdx = (r * 7 + c * 3 + r * c) % FLOOR_PATTERNS.length;
            tiles[idx] = FLOOR_PATTERNS[patIdx];
          } else {
            tiles[idx] = F1;
          }
          tileColors[idx] = color;
        }
      }
    }
  }

  // Helper to carve a corridor (overwrite walls with floor)
  function carveFloor(col: number, row: number, w: number, h: number, zoneId: string) {
    const color = ZONE_COLORS[zoneId] ?? ZONE_COLORS.corridor;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const gr = row + r;
        const gc = col + c;
        if (gr < 0 || gr >= ROWS || gc < 0 || gc >= COLS) {
          continue;
        }
        const idx = gr * COLS + gc;
        tiles[idx] = F1;
        tileColors[idx] = color;
      }
    }
  }

  // 1. Build zone rooms
  fillZone(1, 2, 31, 9, "matrix");

  // Zion: col 1, row 14, 9x9
  fillZone(1, 14, 9, 9, "zion", true, true);
  // The Broadcast: col 12, row 14, 9x9
  fillZone(12, 14, 9, 9, "broadcast");
  // Machine City: col 23, row 14, 9x9
  fillZone(23, 14, 9, 9, "machine-city");
  // The Construct: col 1, row 24, 31x6
  fillZone(1, 24, 31, 6, "construct");

  // 2. Carve corridors between zones
  // Matrix -> Broadcast (col 15-16, row 11-13)
  carveFloor(15, 11, 2, 3, "corridor");

  // Zion -> Broadcast (horizontal, row 18-19)
  carveFloor(10, 18, 2, 2, "corridor");
  // Broadcast -> Machine City (horizontal, row 18-19)
  carveFloor(21, 18, 2, 2, "corridor");
  // Broadcast -> Construct (vertical, col 15-16)
  carveFloor(15, 23, 2, 1, "corridor");
  // Zion -> Construct (vertical, col 5-6)
  carveFloor(5, 23, 2, 1, "corridor");
  // Machine City -> Construct (vertical, col 26-27)
  carveFloor(26, 23, 2, 1, "corridor");

  // 3. Place furniture in each zone
  const furniture: PlacedFurniture[] = [
    // -- The Matrix Core (top, red) --
    { uid: "m-desk-1", type: FurnitureType.DESK, col: 15, row: 8 },
    { uid: "m-chair-1", type: FurnitureType.CHAIR, col: 14, row: 8 },

    // -- The Broadcast (center) — single operator command station --
    { uid: "c-console-1", type: FurnitureType.BROADCAST_CONSOLE, col: 15, row: 16 },
    { uid: "c-chair-1", type: FurnitureType.BROADCAST_CHAIR, col: 16, row: 18 },
    // Flanking server racks
    { uid: "c-rack-1", type: FurnitureType.SERVER_RACK, col: 13, row: 16 },
    { uid: "c-rack-2", type: FurnitureType.SERVER_RACK, col: 19, row: 16 },
    // Back-wall cables: left rack → console → right rack (row 15)
    { uid: "c-cable-0", type: FurnitureType.CABLE_BUNDLE, col: 13, row: 15 },
    { uid: "c-cable-1", type: FurnitureType.CABLE_BUNDLE, col: 14, row: 15 },
    { uid: "c-cable-2", type: FurnitureType.CABLE_BUNDLE, col: 15, row: 15 },
    { uid: "c-cable-3", type: FurnitureType.CABLE_BUNDLE, col: 17, row: 15 },
    { uid: "c-cable-4", type: FurnitureType.CABLE_BUNDLE, col: 18, row: 15 },
    { uid: "c-cable-5", type: FurnitureType.CABLE_BUNDLE, col: 19, row: 15 },
    // Maintenance panel — behind console center (back-of-computer access)
    { uid: "c-panel-1", type: FurnitureType.MAINTENANCE_PANEL, col: 16, row: 15 },
    // Signal transmitter — right border, base sits on wall (row 13), dish pokes outward above
    { uid: "c-xmit-1", type: FurnitureType.SIGNAL_TRANSMITTER, col: 21, row: 12 },
    // Signal transmitter — left border, base sits on wall (row 13), dish pokes outward above
    { uid: "c-xmit-2", type: FurnitureType.SIGNAL_TRANSMITTER, col: 10, row: 12 },
    // Gateway RPC log terminals (row 21 — bottom of expanded zone)
    { uid: "c-log-ws", type: FurnitureType.LOG_TERMINAL, col: 13, row: 21 },
    { uid: "c-log-auth", type: FurnitureType.LOG_TERMINAL, col: 14, row: 21 },
    { uid: "c-log-agent", type: FurnitureType.LOG_TERMINAL, col: 15, row: 21 },
    { uid: "c-log-chan", type: FurnitureType.LOG_TERMINAL, col: 16, row: 21 },
    { uid: "c-log-sess", type: FurnitureType.LOG_TERMINAL, col: 17, row: 21 },
    { uid: "c-log-event", type: FurnitureType.LOG_TERMINAL, col: 18, row: 21 },
    { uid: "c-log-rpc", type: FurnitureType.LOG_TERMINAL, col: 19, row: 21 },

    // -- Machine City (right, green) --
    { uid: "mc-desk-1", type: FurnitureType.DESK, col: 26, row: 17 },
    { uid: "mc-pc-1", type: FurnitureType.PC, col: 26, row: 17 },

    // Chairs around the single desk
    { uid: "mc-chair-1", type: FurnitureType.CHAIR, col: 25, row: 17 }, // Left
    { uid: "mc-chair-2", type: FurnitureType.CHAIR, col: 27, row: 17 }, // Right
    { uid: "mc-chair-3", type: FurnitureType.CHAIR, col: 26, row: 16 }, // Top
    { uid: "mc-chair-4", type: FurnitureType.CHAIR, col: 26, row: 18 }, // Bottom
    { uid: "mc-chair-5", type: FurnitureType.CHAIR, col: 25, row: 16 }, // Top-Left
    { uid: "mc-chair-6", type: FurnitureType.CHAIR, col: 27, row: 16 }, // Top-Right
    { uid: "mc-chair-7", type: FurnitureType.CHAIR, col: 25, row: 18 }, // Bottom-Left
    { uid: "mc-chair-8", type: FurnitureType.CHAIR, col: 27, row: 18 }, // Bottom-Right

    // -- Zion (left, blue) — "Last Human City" resistance base --
    // Interior tiles: col 2-8, row 15-21 (7 cols × 7 rows)
    // Layout: Props pushed to edges, open middle restricted to 2 desks & 4 chairs.

    // === TOP BORDER ===
    { uid: "z-torch-1", type: FurnitureType.TORCH_BRAZIER, col: 2, row: 15 },
    { uid: "z-comms-1", type: FurnitureType.COMMS_RADIO, col: 5, row: 15 },
    { uid: "z-pipe-1", type: FurnitureType.WATER_PIPE, col: 6, row: 15 },
    { uid: "z-torch-2", type: FurnitureType.TORCH_BRAZIER, col: 8, row: 15 },

    // === LEFT BORDER ===
    { uid: "z-gen-1", type: FurnitureType.GENERATOR, col: 2, row: 16 },
    { uid: "z-crate-1", type: FurnitureType.SUPPLY_CRATE, col: 2, row: 17 },
    { uid: "z-hydro-1", type: FurnitureType.HYDRO_POD, col: 2, row: 18 },
    { uid: "z-hydro-2", type: FurnitureType.HYDRO_POD, col: 2, row: 19 },
    { uid: "z-food-1", type: FurnitureType.FOOD_STATION, col: 2, row: 20 },

    // === RIGHT BORDER ===
    { uid: "z-gen-2", type: FurnitureType.GENERATOR, col: 8, row: 16 },
    { uid: "z-crate-2", type: FurnitureType.SUPPLY_CRATE, col: 8, row: 17 },
    { uid: "z-hydro-3", type: FurnitureType.HYDRO_POD, col: 8, row: 18 },
    { uid: "z-hydro-4", type: FurnitureType.HYDRO_POD, col: 8, row: 19 },
    { uid: "z-food-2", type: FurnitureType.FOOD_STATION, col: 8, row: 20 },

    // === BOTTOM BORDER ===
    { uid: "z-med-1", type: FurnitureType.MED_STATION, col: 3, row: 21 },
    { uid: "z-weapon-1", type: FurnitureType.WEAPON_RACK, col: 4, row: 21 },
    { uid: "z-weapon-2", type: FurnitureType.WEAPON_RACK, col: 6, row: 21 },
    { uid: "z-med-2", type: FurnitureType.MED_STATION, col: 7, row: 21 },

    // === CENTER (One Desk, Four Chairs) ===
    { uid: "z-desk-1", type: FurnitureType.DESK, col: 5, row: 18 },
    { uid: "z-chair-1", type: FurnitureType.CHAIR, col: 4, row: 18 }, // Left
    { uid: "z-chair-2", type: FurnitureType.CHAIR, col: 6, row: 18 }, // Right
    { uid: "z-chair-3", type: FurnitureType.CHAIR, col: 5, row: 17 }, // Top
    { uid: "z-chair-4", type: FurnitureType.CHAIR, col: 5, row: 19 }, // Bottom

    // -- The Construct (bottom, purple) — intentionally empty --
  ];

  return {
    version: 1,
    cols: COLS,
    rows: ROWS,
    tiles,
    tileColors,
    furniture,
  };
}

/** The pre-built Matrix world layout. */
export const MATRIX_WORLD_LAYOUT: OfficeLayout = buildWorldLayout();
