/**
 * Furniture catalog: built-in furniture definitions with rotation/state support.
 */

import {
  DESK_SQUARE_SPRITE,
  BOOKSHELF_SPRITE,
  PLANT_SPRITE,
  COOLER_SPRITE,
  WHITEBOARD_SPRITE,
  CHAIR_SPRITE,
  PC_SPRITE,
  LAMP_SPRITE,
  BATCAVE_PILLAR_SPRITE,
  BATCAVE_CONSOLE_SPRITE,
  BROADCAST_CONSOLE_SPRITE,
  SERVER_RACK_SPRITE,
  CABLE_BUNDLE_SPRITE,
  SIGNAL_TRANSMITTER_SPRITE,
  MAINTENANCE_PANEL_SPRITE,
  LOG_TERMINAL_SPRITE,
  BROADCAST_CHAIR_SPRITE,
  HYDRO_POD_SPRITE,
  MED_STATION_SPRITE,
  WEAPON_RACK_SPRITE,
  GENERATOR_SPRITE,
  TORCH_BRAZIER_SPRITE,
  SUPPLY_CRATE_SPRITE,
  WATER_PIPE_SPRITE,
  COMMS_RADIO_SPRITE,
  SLEEPING_POD_SPRITE,
  VENT_DUCT_SPRITE,
  MAP_TABLE_SPRITE,
  FOOD_STATION_SPRITE,
  TOOL_BENCH_SPRITE,
  MEDITATION_MAT_SPRITE,
  CARGO_LIFT_SPRITE,
} from "../sprites/sprite-data.js";
import { FurnitureType } from "../types.js";
import type { FurnitureCatalogEntry, SpriteData } from "../types.js";

export interface LoadedAssetData {
  catalog: Array<{
    id: string;
    label: string;
    category: string;
    width: number;
    height: number;
    footprintW: number;
    footprintH: number;
    isDesk: boolean;
    groupId?: string;
    orientation?: string;
    state?: string;
    canPlaceOnSurfaces?: boolean;
    backgroundTiles?: number;
    canPlaceOnWalls?: boolean;
  }>;
  sprites: Record<string, SpriteData>;
}

export type FurnitureCategory =
  | "desks"
  | "chairs"
  | "storage"
  | "decor"
  | "electronics"
  | "wall"
  | "misc";

export interface CatalogEntryWithCategory extends FurnitureCatalogEntry {
  category: FurnitureCategory;
}

export const FURNITURE_CATALOG: CatalogEntryWithCategory[] = [
  {
    type: FurnitureType.BROADCAST_CHAIR,
    label: "Broadcast Chair",
    footprintW: 1,
    footprintH: 1,
    sprite: BROADCAST_CHAIR_SPRITE,
    isDesk: false,
    category: "chairs",
  },
  {
    type: FurnitureType.DESK,
    label: "Desk",
    footprintW: 2,
    footprintH: 2,
    sprite: DESK_SQUARE_SPRITE,
    isDesk: true,
    category: "desks",
  },
  {
    type: FurnitureType.BOOKSHELF,
    label: "Bookshelf",
    footprintW: 1,
    footprintH: 2,
    sprite: BOOKSHELF_SPRITE,
    isDesk: false,
    category: "storage",
  },
  {
    type: FurnitureType.PLANT,
    label: "Plant",
    footprintW: 1,
    footprintH: 1,
    sprite: PLANT_SPRITE,
    isDesk: false,
    category: "decor",
  },
  {
    type: FurnitureType.COOLER,
    label: "Cooler",
    footprintW: 1,
    footprintH: 1,
    sprite: COOLER_SPRITE,
    isDesk: false,
    category: "misc",
  },
  {
    type: FurnitureType.WHITEBOARD,
    label: "Whiteboard",
    footprintW: 2,
    footprintH: 1,
    sprite: WHITEBOARD_SPRITE,
    isDesk: false,
    category: "decor",
  },
  {
    type: FurnitureType.CHAIR,
    label: "Chair",
    footprintW: 1,
    footprintH: 1,
    sprite: CHAIR_SPRITE,
    isDesk: false,
    category: "chairs",
  },
  {
    type: FurnitureType.PC,
    label: "PC",
    footprintW: 1,
    footprintH: 1,
    sprite: PC_SPRITE,
    isDesk: false,
    category: "electronics",
  },
  {
    type: FurnitureType.LAMP,
    label: "Lamp",
    footprintW: 1,
    footprintH: 1,
    sprite: LAMP_SPRITE,
    isDesk: false,
    category: "decor",
  },
  {
    type: FurnitureType.BATCAVE_PILLAR,
    label: "Server Pillar",
    footprintW: 2,
    footprintH: 2,
    sprite: BATCAVE_PILLAR_SPRITE,
    isDesk: false, // The pillar is a wall blocker, not a desk
    category: "storage",
  },
  {
    type: FurnitureType.BATCAVE_CONSOLE,
    label: "Main Console",
    footprintW: 2,
    footprintH: 1,
    sprite: BATCAVE_CONSOLE_SPRITE,
    isDesk: true, // Treated as a desk so engine binds chairs to it
    category: "desks",
  },
  {
    type: FurnitureType.BROADCAST_CONSOLE,
    label: "Broadcast Console",
    footprintW: 3,
    footprintH: 2,
    sprite: BROADCAST_CONSOLE_SPRITE,
    isDesk: true, // Treated as a desk so engine binds chairs to it
    category: "desks",
  },
  {
    type: FurnitureType.SERVER_RACK,
    label: "Server Rack",
    footprintW: 1,
    footprintH: 2,
    sprite: SERVER_RACK_SPRITE,
    isDesk: false,
    category: "storage",
  },
  {
    type: FurnitureType.CABLE_BUNDLE,
    label: "Floor Cable",
    footprintW: 1,
    footprintH: 1,
    sprite: CABLE_BUNDLE_SPRITE,
    isDesk: false,
    category: "electronics",
  },
  {
    type: FurnitureType.SIGNAL_TRANSMITTER,
    label: "Signal Transmitter",
    footprintW: 2,
    footprintH: 2,
    sprite: SIGNAL_TRANSMITTER_SPRITE,
    isDesk: false,
    category: "electronics",
  },
  {
    type: FurnitureType.MAINTENANCE_PANEL,
    label: "Maintenance Panel",
    footprintW: 1,
    footprintH: 1,
    sprite: MAINTENANCE_PANEL_SPRITE,
    isDesk: false,
    category: "electronics",
  },
  {
    type: FurnitureType.LOG_TERMINAL,
    label: "Log Terminal",
    footprintW: 1,
    footprintH: 1,
    sprite: LOG_TERMINAL_SPRITE,
    isDesk: false,
    category: "electronics",
  },
  // -- Zion Props --
  {
    type: FurnitureType.HYDRO_POD,
    label: "Hydroponics Pod",
    footprintW: 1,
    footprintH: 1,
    sprite: HYDRO_POD_SPRITE,
    isDesk: false,
    category: "decor",
  },
  {
    type: FurnitureType.MED_STATION,
    label: "Medical Station",
    footprintW: 1,
    footprintH: 1,
    sprite: MED_STATION_SPRITE,
    isDesk: false,
    category: "misc",
  },
  {
    type: FurnitureType.WEAPON_RACK,
    label: "Weapon Rack",
    footprintW: 1,
    footprintH: 2,
    sprite: WEAPON_RACK_SPRITE,
    isDesk: false,
    category: "storage",
  },
  {
    type: FurnitureType.GENERATOR,
    label: "Power Generator",
    footprintW: 1,
    footprintH: 1,
    sprite: GENERATOR_SPRITE,
    isDesk: false,
    category: "electronics",
  },
  {
    type: FurnitureType.TORCH_BRAZIER,
    label: "Torch Brazier",
    footprintW: 1,
    footprintH: 1,
    sprite: TORCH_BRAZIER_SPRITE,
    isDesk: false,
    category: "decor",
  },
  {
    type: FurnitureType.SUPPLY_CRATE,
    label: "Supply Crate",
    footprintW: 1,
    footprintH: 1,
    sprite: SUPPLY_CRATE_SPRITE,
    isDesk: false,
    category: "storage",
  },
  {
    type: FurnitureType.WATER_PIPE,
    label: "Water Pipe",
    footprintW: 1,
    footprintH: 1,
    sprite: WATER_PIPE_SPRITE,
    isDesk: false,
    category: "misc",
  },
  {
    type: FurnitureType.COMMS_RADIO,
    label: "Communications Radio",
    footprintW: 1,
    footprintH: 1,
    sprite: COMMS_RADIO_SPRITE,
    isDesk: false,
    category: "electronics",
  },
  {
    type: FurnitureType.SLEEPING_POD,
    label: "Sleeping Pod",
    footprintW: 2,
    footprintH: 1,
    sprite: SLEEPING_POD_SPRITE,
    isDesk: false,
    category: "misc",
  },
  {
    type: FurnitureType.VENT_DUCT,
    label: "Ventilation Duct",
    footprintW: 1,
    footprintH: 1,
    sprite: VENT_DUCT_SPRITE,
    isDesk: false,
    category: "wall",
  },
  {
    type: FurnitureType.MAP_TABLE,
    label: "War Map Table",
    footprintW: 2,
    footprintH: 2,
    sprite: MAP_TABLE_SPRITE,
    isDesk: false,
    category: "desks",
  },
  {
    type: FurnitureType.FOOD_STATION,
    label: "Food Station",
    footprintW: 1,
    footprintH: 1,
    sprite: FOOD_STATION_SPRITE,
    isDesk: false,
    category: "misc",
  },
  {
    type: FurnitureType.TOOL_BENCH,
    label: "Tool Bench",
    footprintW: 2,
    footprintH: 1,
    sprite: TOOL_BENCH_SPRITE,
    isDesk: false,
    category: "desks",
  },
  {
    type: FurnitureType.MEDITATION_MAT,
    label: "Meditation Mat",
    footprintW: 1,
    footprintH: 1,
    sprite: MEDITATION_MAT_SPRITE,
    isDesk: false,
    category: "decor",
  },
  {
    type: FurnitureType.CARGO_LIFT,
    label: "Cargo Lift",
    footprintW: 1,
    footprintH: 1,
    sprite: CARGO_LIFT_SPRITE,
    isDesk: false,
    category: "misc",
  },
];

// -- Rotation groups ----------------------------------------------------------

interface RotationGroup {
  orientations: string[];
  members: Record<string, string>;
}

const rotationGroups = new Map<string, RotationGroup>();
const stateGroups = new Map<string, string>();
const offToOn = new Map<string, string>();
const onToOff = new Map<string, string>();

let internalCatalog: CatalogEntryWithCategory[] | null = null;
let dynamicCatalog: CatalogEntryWithCategory[] | null = null;
let dynamicCategories: FurnitureCategory[] | null = null;

export const FURNITURE_CATEGORIES: Array<{ id: FurnitureCategory; label: string }> = [
  { id: "desks", label: "Desks" },
  { id: "chairs", label: "Chairs" },
  { id: "storage", label: "Storage" },
  { id: "electronics", label: "Tech" },
  { id: "decor", label: "Decor" },
  { id: "wall", label: "Wall" },
  { id: "misc", label: "Misc" },
];

/**
 * Build catalog from loaded assets. Returns true if successful.
 * Once built, all getCatalog* functions use the dynamic catalog.
 */
export function buildDynamicCatalog(assets: LoadedAssetData): boolean {
  if (!assets?.catalog || !assets?.sprites) {
    return false;
  }

  const allEntries = assets.catalog
    .map((asset) => {
      const sprite = assets.sprites[asset.id];
      if (!sprite) {
        return null;
      }
      return {
        type: asset.id,
        label: asset.label,
        footprintW: asset.footprintW,
        footprintH: asset.footprintH,
        sprite,
        isDesk: asset.isDesk,
        category: asset.category as FurnitureCategory,
        ...(asset.orientation ? { orientation: asset.orientation } : {}),
        ...(asset.canPlaceOnSurfaces ? { canPlaceOnSurfaces: true } : {}),
        ...(asset.backgroundTiles ? { backgroundTiles: asset.backgroundTiles } : {}),
        ...(asset.canPlaceOnWalls ? { canPlaceOnWalls: true } : {}),
      };
    })
    .filter((e): e is CatalogEntryWithCategory => e !== null);

  if (allEntries.length === 0) {
    return false;
  }

  rotationGroups.clear();
  stateGroups.clear();
  offToOn.clear();
  onToOff.clear();

  // Collect orientations per group (only "off" or stateless variants for rotation)
  const groupMap = new Map<string, Map<string, string>>();
  for (const asset of assets.catalog) {
    if (asset.groupId && asset.orientation) {
      if (asset.state && asset.state !== "off") {
        continue;
      }
      let orientMap = groupMap.get(asset.groupId);
      if (!orientMap) {
        orientMap = new Map();
        groupMap.set(asset.groupId, orientMap);
      }
      orientMap.set(asset.orientation, asset.id);
    }
  }

  // Register rotation groups with 2+ orientations
  const nonFrontIds = new Set<string>();
  const orientationOrder = ["front", "right", "back", "left"];
  for (const orientMap of groupMap.values()) {
    if (orientMap.size < 2) {
      continue;
    }
    const orderedOrients = orientationOrder.filter((o) => orientMap.has(o));
    if (orderedOrients.length < 2) {
      continue;
    }
    const members: Record<string, string> = {};
    for (const o of orderedOrients) {
      members[o] = orientMap.get(o)!;
    }
    const rg: RotationGroup = { orientations: orderedOrients, members };
    for (const id of Object.values(members)) {
      rotationGroups.set(id, rg);
    }
    for (const [orient, id] of Object.entries(members)) {
      if (orient !== "front") {
        nonFrontIds.add(id);
      }
    }
  }

  // Build state groups (on/off pairs)
  const stateMap = new Map<string, Map<string, string>>();
  for (const asset of assets.catalog) {
    if (asset.groupId && asset.state) {
      const key = `${asset.groupId}|${asset.orientation || ""}`;
      let sm = stateMap.get(key);
      if (!sm) {
        sm = new Map();
        stateMap.set(key, sm);
      }
      sm.set(asset.state, asset.id);
    }
  }
  for (const sm of stateMap.values()) {
    const onId = sm.get("on");
    const offId = sm.get("off");
    if (onId && offId) {
      stateGroups.set(onId, offId);
      stateGroups.set(offId, onId);
      offToOn.set(offId, onId);
      onToOff.set(onId, offId);
    }
  }

  // Register rotation groups for "on" state variants
  for (const asset of assets.catalog) {
    if (asset.groupId && asset.orientation && asset.state === "on") {
      const offCounterpart = stateGroups.get(asset.id);
      if (offCounterpart) {
        const offGroup = rotationGroups.get(offCounterpart);
        if (offGroup) {
          const onMembers: Record<string, string> = {};
          for (const orient of offGroup.orientations) {
            const offId = offGroup.members[orient];
            const onId = stateGroups.get(offId);
            onMembers[orient] = onId ?? offId;
          }
          const onGroup: RotationGroup = {
            orientations: offGroup.orientations,
            members: onMembers,
          };
          for (const id of Object.values(onMembers)) {
            if (!rotationGroups.has(id)) {
              rotationGroups.set(id, onGroup);
            }
          }
        }
      }
    }
  }

  const onStateIds = new Set<string>();
  for (const asset of assets.catalog) {
    if (asset.state === "on") {
      onStateIds.add(asset.id);
    }
  }

  internalCatalog = allEntries;

  const visibleEntries = allEntries.filter(
    (e) => !nonFrontIds.has(e.type) && !onStateIds.has(e.type),
  );

  for (const entry of visibleEntries) {
    if (rotationGroups.has(entry.type) || stateGroups.has(entry.type)) {
      entry.label = entry.label
        .replace(/ - Front - Off$/, "")
        .replace(/ - Front$/, "")
        .replace(/ - Off$/, "");
    }
  }

  dynamicCatalog = visibleEntries;
  dynamicCategories = Array.from(new Set(visibleEntries.map((e) => e.category)))
    .filter((c): c is FurnitureCategory => !!c)
    .toSorted();

  return true;
}

export function getCatalogEntry(type: string): CatalogEntryWithCategory | undefined {
  if (internalCatalog) {
    return internalCatalog.find((e) => e.type === type);
  }
  const catalog = dynamicCatalog || FURNITURE_CATALOG;
  return catalog.find((e) => e.type === type);
}

export function getCatalogByCategory(category: FurnitureCategory): CatalogEntryWithCategory[] {
  const catalog = dynamicCatalog || FURNITURE_CATALOG;
  return catalog.filter((e) => e.category === category);
}

export function getActiveCatalog(): CatalogEntryWithCategory[] {
  return dynamicCatalog || FURNITURE_CATALOG;
}

export function getActiveCategories(): Array<{ id: FurnitureCategory; label: string }> {
  const categories = dynamicCategories || FURNITURE_CATEGORIES.map((c) => c.id);
  return FURNITURE_CATEGORIES.filter((c) => categories.includes(c.id));
}

/** Returns the next asset ID in the rotation group, or null if not rotatable */
export function getRotatedType(currentType: string, direction: "cw" | "ccw"): string | null {
  const group = rotationGroups.get(currentType);
  if (!group) {
    return null;
  }
  const order = group.orientations.map((o) => group.members[o]);
  const idx = order.indexOf(currentType);
  if (idx === -1) {
    return null;
  }
  const step = direction === "cw" ? 1 : -1;
  const nextIdx = (idx + step + order.length) % order.length;
  return order[nextIdx];
}

/** Returns the toggled state variant (on/off), or null if no state variant exists */
export function getToggledType(currentType: string): string | null {
  return stateGroups.get(currentType) ?? null;
}

/** Returns the "on" variant if available, otherwise the type unchanged */
export function getOnStateType(currentType: string): string {
  return offToOn.get(currentType) ?? currentType;
}

/** Returns the "off" variant if available, otherwise the type unchanged */
export function getOffStateType(currentType: string): string {
  return onToOff.get(currentType) ?? currentType;
}

/** Returns true if the given furniture type is part of a rotation group */
export function isRotatable(type: string): boolean {
  return rotationGroups.has(type);
}
