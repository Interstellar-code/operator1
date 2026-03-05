/**
 * Canvas renderer for the game world.
 *
 * Editor-specific rendering (grid overlay, ghost preview, selection highlight,
 * delete/rotate buttons) has been removed. This renderer handles:
 * - Floor/wall tile rendering
 * - Z-sorted furniture + character rendering
 * - Matrix spawn/despawn effects
 * - Speech bubbles
 */

import {
  TILE_SIZE,
  CHARACTER_SITTING_OFFSET_PX,
  CHARACTER_Z_SORT_OFFSET,
  OUTLINE_Z_SORT_OFFSET,
  SELECTED_OUTLINE_ALPHA,
  HOVERED_OUTLINE_ALPHA,
  BUBBLE_FADE_DURATION_SEC,
  BUBBLE_SITTING_OFFSET_PX,
  BUBBLE_VERTICAL_OFFSET_PX,
  FALLBACK_FLOOR_COLOR,
} from "../constants.js";
import { getColorizedFloorSprite, hasFloorSprites, getWallColor } from "../floor-tiles.js";
import { getCachedSprite, getOutlineSprite } from "../sprites/sprite-cache.js";
import {
  getCharacterSprites,
  BUBBLE_PERMISSION_SPRITE,
  BUBBLE_WAITING_SPRITE,
  SIGNAL_TRANSMITTER_SPRITE,
  SIGNAL_TRANSMITTER_SPRITE_LEFT,
  SIGNAL_TRANSMITTER_SPRITE_RIGHT,
  HOVERCRAFT_SPRITE,
  HOVERCRAFT_SPRITE_LEFT,
  HOVERCRAFT_SPRITE_RIGHT,
  SENTINEL_SPRITE,
  SENTINEL_SPRITE_LEFT,
  SENTINEL_SPRITE_RIGHT,
} from "../sprites/sprite-data.js";
import { TileType, CharacterState } from "../types.js";
import type {
  TileType as TileTypeVal,
  FurnitureInstance,
  Character,
  FloorColor,
} from "../types.js";
import { getWallInstances, wallColorToHex } from "../wall-tiles.js";
import { getCharacterSprite } from "./characters.js";
import { renderMatrixEffect } from "./matrix-effect.js";

const matrixCustomImg = new Image();
matrixCustomImg.src = "/pixel-assets/matrix-custom-bg.png";

const droidRunImg = new Image();
droidRunImg.src = "/pixel-assets/Droid Zapper/run.png";

// -- Internal types -----------------------------------------------------------

interface ZDrawable {
  zY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

// -- Tile rendering -----------------------------------------------------------

export function renderTileGrid(
  ctx: CanvasRenderingContext2D,
  tileMap: TileTypeVal[][],
  offsetX: number,
  offsetY: number,
  zoom: number,
  tileColors?: Array<FloorColor | null>,
  cols?: number,
): void {
  const s = TILE_SIZE * zoom;
  const useSpriteFloors = hasFloorSprites();
  const tmRows = tileMap.length;
  const tmCols = tmRows > 0 ? tileMap[0].length : 0;
  const layoutCols = cols ?? tmCols;

  for (let r = 0; r < tmRows; r++) {
    for (let c = 0; c < tmCols; c++) {
      const tile = tileMap[r][c];

      if (tile === TileType.VOID) {
        continue;
      }

      if (tile === TileType.WALL || !useSpriteFloors) {
        if (tile === TileType.WALL) {
          const colorIdx = r * layoutCols + c;
          const wallColor = tileColors?.[colorIdx];
          ctx.fillStyle = wallColor ? wallColorToHex(wallColor) : getWallColor();
        } else {
          ctx.fillStyle = FALLBACK_FLOOR_COLOR;
        }
        ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s);
        continue;
      }

      const colorIdx = r * layoutCols + c;
      const color = tileColors?.[colorIdx] ?? { h: 0, s: 0, b: 0, c: 0 };

      // Draw opaque dark background under the transparent floor sprites
      ctx.fillStyle = "#0d0208"; // Matrix dark background
      ctx.fillRect(offsetX + c * s, offsetY + r * s, s, s);

      const sprite = getColorizedFloorSprite(tile, color);
      const cached = getCachedSprite(sprite, zoom);
      ctx.drawImage(cached, offsetX + c * s, offsetY + r * s);
    }
  }
}

// -- Scene rendering (z-sorted) -----------------------------------------------

export function renderScene(
  ctx: CanvasRenderingContext2D,
  furniture: FurnitureInstance[],
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
): void {
  const drawables: ZDrawable[] = [];

  const timeSec = Date.now() / 1000;

  // Furniture
  for (const f of furniture) {
    let currentSprite = f.sprite;
    // Animate signal transmitter dish — shared frequency with beam (1.2 rad/s)
    if (currentSprite === SIGNAL_TRANSMITTER_SPRITE) {
      const dishPhase = Math.sin(timeSec * 1.2);
      if (dishPhase > 0.35) {
        currentSprite = SIGNAL_TRANSMITTER_SPRITE_RIGHT;
      } else if (dishPhase < -0.35) {
        currentSprite = SIGNAL_TRANSMITTER_SPRITE_LEFT;
      }
    }

    const cached = getCachedSprite(currentSprite, zoom);
    const fx = offsetX + f.x * zoom;
    const fy = offsetY + f.y * zoom;
    drawables.push({
      zY: f.zY,
      draw: (c) => {
        c.drawImage(cached, fx, fy);
      },
    });
  }

  // Characters
  for (const ch of characters) {
    const sprites = getCharacterSprites(ch.palette, ch.hueShift);
    const spriteData = getCharacterSprite(ch, sprites);

    const cached = getCachedSprite(spriteData, zoom);
    const sittingOffset = ch.state === CharacterState.TYPE ? CHARACTER_SITTING_OFFSET_PX : 0;
    const drawX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
    const drawY = Math.round(offsetY + (ch.y + sittingOffset) * zoom - cached.height);
    const charZY = ch.y + TILE_SIZE / 2 + CHARACTER_Z_SORT_OFFSET;

    // Matrix effect: per-pixel rendering
    if (ch.matrixEffect) {
      const mDrawX = drawX;
      const mDrawY = drawY;
      const mSpriteData = spriteData;
      const mCh = ch;
      drawables.push({
        zY: charZY,
        draw: (c) => {
          renderMatrixEffect(c, mCh, mSpriteData, mDrawX, mDrawY, zoom);
        },
      });
      continue;
    }

    // Selection/hover outline
    const isSelected = selectedAgentId !== null && ch.id === selectedAgentId;
    const isHovered = hoveredAgentId !== null && ch.id === hoveredAgentId;
    if (isSelected || isHovered) {
      const outlineAlpha = isSelected ? SELECTED_OUTLINE_ALPHA : HOVERED_OUTLINE_ALPHA;
      const outlineData = getOutlineSprite(spriteData);
      const outlineCached = getCachedSprite(outlineData, zoom);
      const olDrawX = drawX - zoom;
      const olDrawY = drawY - zoom;
      drawables.push({
        zY: charZY - OUTLINE_Z_SORT_OFFSET,
        draw: (c) => {
          c.save();
          c.globalAlpha = outlineAlpha;
          c.drawImage(outlineCached, olDrawX, olDrawY);
          c.restore();
        },
      });
    }

    // The hero image injection is heavily clashing with the pixel-art engine.
    // By skipping it, the standard pixel character sprites will be drawn naturally,
    // solving the clipping issues and restoring standard walking/typing animations.

    drawables.push({
      zY: charZY,
      draw: (c) => {
        c.drawImage(cached, drawX, drawY);
      },
    });
  }

  drawables.sort((a, b) => a.zY - b.zY);

  for (const d of drawables) {
    d.draw(ctx);
  }
}

// -- Speech bubbles -----------------------------------------------------------

export function renderBubbles(
  ctx: CanvasRenderingContext2D,
  characters: Character[],
  offsetX: number,
  offsetY: number,
  zoom: number,
): void {
  for (const ch of characters) {
    if (ch.statusMessage) {
      // Custom text bubble
      const text = ch.statusMessage;
      const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0;

      ctx.save();
      ctx.font = `bold ${Math.max(6, Math.round(5 * zoom))}px "Courier New", monospace`;

      const textWidth = ctx.measureText(text).width;
      const paddingX = 4 * zoom;
      const paddingY = 3 * zoom;
      const bw = textWidth + paddingX * 2;
      const bh = 10 * zoom + paddingY * 2;

      const mx = Math.round(offsetX + ch.x * zoom);
      const my = Math.round(
        offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX - 8) * zoom - bh,
      );

      const bx = mx - bw / 2;
      const by = my;

      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.strokeStyle = "rgba(0, 255, 65, 0.8)";
      ctx.lineWidth = 1 * zoom;

      // Draw rounded rect
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 3 * zoom);
      ctx.fill();
      ctx.stroke();

      // Small tail
      ctx.beginPath();
      ctx.moveTo(mx - 2 * zoom, by + bh);
      ctx.lineTo(mx + 2 * zoom, by + bh);
      ctx.lineTo(mx, by + bh + 3 * zoom);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(0, 255, 65, 1)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, mx, by + bh / 2 + 0.5 * zoom);

      ctx.restore();
      continue;
    }

    if (!ch.bubbleType) {
      continue;
    }

    const sprite =
      ch.bubbleType === "permission" ? BUBBLE_PERMISSION_SPRITE : BUBBLE_WAITING_SPRITE;

    let alpha = 1.0;
    if (ch.bubbleType === "waiting" && ch.bubbleTimer < BUBBLE_FADE_DURATION_SEC) {
      alpha = ch.bubbleTimer / BUBBLE_FADE_DURATION_SEC;
    }

    const cached = getCachedSprite(sprite, zoom);
    const sittingOff = ch.state === CharacterState.TYPE ? BUBBLE_SITTING_OFFSET_PX : 0;
    const bubbleX = Math.round(offsetX + ch.x * zoom - cached.width / 2);
    const bubbleY = Math.round(
      offsetY + (ch.y + sittingOff - BUBBLE_VERTICAL_OFFSET_PX) * zoom - cached.height - 1 * zoom,
    );

    ctx.save();
    if (alpha < 1.0) {
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(cached, bubbleX, bubbleY);
    ctx.restore();
  }
}

// -- Frame orchestration ------------------------------------------------------

/**
 * Render a complete frame: tiles, furniture, characters, bubbles.
 * Returns viewport offsets for hit testing.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  tileMap: TileTypeVal[][],
  furniture: FurnitureInstance[],
  characters: Character[],
  zoom: number,
  panX: number,
  panY: number,
  selectedAgentId: number | null,
  hoveredAgentId: number | null,
  tileColors?: Array<FloorColor | null>,
  layoutCols?: number,
  layoutRows?: number,
): { offsetX: number; offsetY: number } {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  const cols = layoutCols ?? (tileMap.length > 0 ? tileMap[0].length : 0);
  const rows = layoutRows ?? tileMap.length;

  // Center map in viewport + pan offset
  const mapW = cols * TILE_SIZE * zoom;
  const mapH = rows * TILE_SIZE * zoom;
  const offsetX = Math.floor((canvasWidth - mapW) / 2) + Math.round(panX);
  const offsetY = Math.floor((canvasHeight - mapH) / 2) + Math.round(panY);

  // Floor + wall base
  renderTileGrid(ctx, tileMap, offsetX, offsetY, zoom, tileColors, layoutCols);

  // Custom Matrix Room 2D Map Texture (Animated)
  if (matrixCustomImg.complete) {
    const timeSec = Date.now() / 1000;
    ctx.save();

    // Position matching The Matrix Core (col:1, row:2, width:31, height:10)
    // We cover exactly the bounds of the matrix area!
    const mx = offsetX + 1 * TILE_SIZE * zoom;
    const my = offsetY + 2 * TILE_SIZE * zoom;
    const mw = 31 * TILE_SIZE * zoom;
    const mh = 8 * TILE_SIZE * zoom;

    // Base image completely opaque to hide the grid lines underneath
    ctx.globalAlpha = 1.0;
    ctx.drawImage(matrixCustomImg, mx, my, mw, mh);

    // Add randomly blinking server lights, pinned to realistic screen/server locations
    const serverLights = [
      { x: 0.38, y: 0.25 },
      { x: 0.42, y: 0.25 },
      { x: 0.28, y: 0.35 },
      { x: 0.28, y: 0.4 },
      { x: 0.45, y: 0.45 },
      { x: 0.45, y: 0.5 },
      { x: 0.45, y: 0.55 },
      { x: 0.5, y: 0.45 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.6 },
      { x: 0.55, y: 0.45 },
      { x: 0.55, y: 0.5 },
      { x: 0.55, y: 0.55 },
      { x: 0.38, y: 0.62 },
      { x: 0.4, y: 0.62 },
      { x: 0.58, y: 0.62 },
      { x: 0.6, y: 0.62 },
      { x: 0.85, y: 0.88 },
      { x: 0.9, y: 0.88 },
      { x: 0.08, y: 0.38 },
      { x: 0.92, y: 0.38 },
      { x: 0.47, y: 0.35 },
      { x: 0.53, y: 0.35 }, // Core screens
    ];

    serverLights.forEach((light, i) => {
      // Slow down blink rate significantly
      const blinkCycle = (timeSec * (0.8 + (i % 3) * 0.3)) % 2.5;
      if (blinkCycle > 1.5) {
        // On for a shorter duration
        ctx.fillStyle = i % 2 === 0 ? "rgba(0, 255, 150, 0.8)" : "rgba(255, 0, 100, 0.8)";
        const lx = mx + light.x * mw;
        const ly = my + light.y * mh;
        ctx.fillRect(lx, ly, 1.5 * zoom, 1.5 * zoom);
      }
    });
    // Droid Zapper removed as per user request
    ctx.restore();
  }

  // Wall sprites + furniture + characters (z-sorted)
  const wallInstances = getWallInstances(
    // Flatten tileMap for wall instance generation
    tileMap.flat(),
    cols,
    rows,
  );
  const allFurniture = wallInstances.length > 0 ? [...wallInstances, ...furniture] : furniture;

  renderScene(
    ctx,
    allFurniture,
    characters,
    offsetX,
    offsetY,
    zoom,
    selectedAgentId,
    hoveredAgentId,
  );

  // Speech bubbles (always on top)
  renderBubbles(ctx, characters, offsetX, offsetY, zoom);

  // -- Broadcast zone blinking lights (rendered on top of furniture) --
  const timeSec = matrixCustomImg.complete ? Date.now() / 1000 : Date.now() / 1000;
  const s = TILE_SIZE * zoom;
  ctx.save();

  // Server rack LED blinks (left rack at col 13, rows 16-17; right rack at col 19, rows 16-17)
  const rackLeds = [
    // Left rack LEDs (relative to col 13, row 16 top-left)
    { col: 13, row: 16, dx: 0.15, dy: 0.2, color: "rgba(0, 255, 100, 0.9)", rate: 0.7 },
    { col: 13, row: 16, dx: 0.4, dy: 0.2, color: "rgba(0, 255, 100, 0.9)", rate: 1.1 },
    { col: 13, row: 16, dx: 0.65, dy: 0.35, color: "rgba(255, 170, 0, 0.9)", rate: 0.9 },
    { col: 13, row: 16, dx: 0.2, dy: 0.55, color: "rgba(0, 255, 100, 0.9)", rate: 1.3 },
    { col: 13, row: 16, dx: 0.6, dy: 0.55, color: "rgba(255, 170, 0, 0.9)", rate: 0.6 },
    { col: 13, row: 16, dx: 0.3, dy: 0.75, color: "rgba(0, 255, 100, 0.9)", rate: 1.0 },
    { col: 13, row: 17, dx: 0.15, dy: 0.15, color: "rgba(255, 170, 0, 0.9)", rate: 1.2 },
    { col: 13, row: 17, dx: 0.5, dy: 0.15, color: "rgba(0, 255, 100, 0.9)", rate: 0.8 },
    { col: 13, row: 17, dx: 0.35, dy: 0.45, color: "rgba(0, 255, 100, 0.9)", rate: 1.4 },
    { col: 13, row: 17, dx: 0.65, dy: 0.65, color: "rgba(255, 170, 0, 0.9)", rate: 0.5 },
    // Right rack LEDs (col 19)
    { col: 19, row: 16, dx: 0.2, dy: 0.2, color: "rgba(0, 255, 100, 0.9)", rate: 0.9 },
    { col: 19, row: 16, dx: 0.55, dy: 0.2, color: "rgba(255, 170, 0, 0.9)", rate: 1.1 },
    { col: 19, row: 16, dx: 0.35, dy: 0.4, color: "rgba(0, 255, 100, 0.9)", rate: 0.7 },
    { col: 19, row: 16, dx: 0.7, dy: 0.55, color: "rgba(0, 255, 100, 0.9)", rate: 1.3 },
    { col: 19, row: 16, dx: 0.15, dy: 0.75, color: "rgba(255, 170, 0, 0.9)", rate: 0.8 },
    { col: 19, row: 17, dx: 0.25, dy: 0.2, color: "rgba(0, 255, 100, 0.9)", rate: 1.0 },
    { col: 19, row: 17, dx: 0.6, dy: 0.35, color: "rgba(255, 170, 0, 0.9)", rate: 0.6 },
    { col: 19, row: 17, dx: 0.4, dy: 0.55, color: "rgba(0, 255, 100, 0.9)", rate: 1.2 },
    { col: 19, row: 17, dx: 0.7, dy: 0.7, color: "rgba(255, 170, 0, 0.9)", rate: 1.5 },
  ];

  for (const led of rackLeds) {
    const blinkCycle = (timeSec * led.rate) % 2.0;
    if (blinkCycle > 1.2) {
      ctx.fillStyle = led.color;
      const lx = offsetX + (led.col + led.dx) * s;
      const ly = offsetY + (led.row + led.dy) * s;
      ctx.fillRect(lx, ly, 1.5 * zoom, 1.5 * zoom);
    }
  }

  // Signal transmitter beam animation — SAME 1.2 rad/s frequency as sprite rotation
  const dishPhase = Math.sin(timeSec * 1.2);
  const dishPulse = (dishPhase + 1) / 2; // 0 to 1

  // Dish swing offset — tracks exactly with sprite orientation thresholds
  let rDishOffX = 0.96;
  let lDishOffX = 0.96;
  if (dishPhase > 0.35) {
    rDishOffX = 1.81;
    lDishOffX = 1.81;
  } // Right facing
  else if (dishPhase < -0.35) {
    rDishOffX = 0.12;
    lDishOffX = 0.12;
  } // Left facing

  // Expanding concentric rings — synced to same base clock
  const beamAlpha = 0.12 + dishPulse * 0.35;
  const maxRings = 4;
  for (let ring = 0; ring < maxRings; ring++) {
    const ringPhase = (timeSec * 0.4 + ring * 0.25) % 1.0; // gentle expansion
    const ringAlpha = beamAlpha * (1 - ringPhase);
    const ringRadius = ringPhase * 1.8 * s;

    if (ringAlpha < 0.02) {
      continue;
    }

    // RIGHT dish — feed horn at Y=11/32 = 0.68 of the top tile
    const rdx = offsetX + (21 + rDishOffX) * s;
    const rdy = offsetY + (12 + 0.68) * s;
    ctx.beginPath();
    ctx.arc(rdx, rdy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 255, 100, ${ringAlpha})`;
    ctx.lineWidth = 1.2 * zoom;
    ctx.stroke();

    // LEFT dish
    const ldx = offsetX + (10 + lDishOffX) * s;
    const ldy = offsetY + (12 + 0.68) * s;
    ctx.beginPath();
    ctx.arc(ldx, ldy, ringRadius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(0, 255, 100, ${ringAlpha})`;
    ctx.lineWidth = 1.2 * zoom;
    ctx.stroke();
  }

  // Core bright dot on each dish indicator
  ctx.fillStyle = `rgba(0, 255, 100, ${0.5 + dishPulse * 0.5})`;
  ctx.fillRect(
    offsetX + (21 + rDishOffX) * s - 1 * zoom,
    offsetY + (12 + 0.68) * s - 1 * zoom,
    2.5 * zoom,
    2.5 * zoom,
  );
  ctx.fillRect(
    offsetX + (10 + lDishOffX) * s - 1 * zoom,
    offsetY + (12 + 0.68) * s - 1 * zoom,
    2.5 * zoom,
    2.5 * zoom,
  );

  // Maintenance panel wire blinks (col 16, row 15)
  const panelWires = [
    { dx: 0.15, dy: 0.25, color: "rgba(220, 50, 50, 0.9)", rate: 0.8 }, // red
    { dx: 0.35, dy: 0.25, color: "rgba(34, 204, 68, 0.9)", rate: 1.1 }, // green
    { dx: 0.55, dy: 0.25, color: "rgba(204, 170, 51, 0.9)", rate: 0.6 }, // yellow
    { dx: 0.75, dy: 0.25, color: "rgba(51, 136, 204, 0.9)", rate: 1.4 }, // blue
    { dx: 0.15, dy: 0.8, color: "rgba(34, 204, 68, 0.9)", rate: 1.0 }, // green
    { dx: 0.3, dy: 0.8, color: "rgba(220, 50, 50, 0.9)", rate: 1.3 }, // red
  ];
  for (const wire of panelWires) {
    const blinkCycle = (timeSec * wire.rate) % 2.5;
    if (blinkCycle > 1.5) {
      ctx.fillStyle = wire.color;
      const wx = offsetX + (16 + wire.dx) * s;
      const wy = offsetY + (15 + wire.dy) * s;
      ctx.fillRect(wx, wy, 1.5 * zoom, 1.5 * zoom);
    }
  }

  // Gateway RPC log terminal screen glows + blinking LEDs (row 20, cols 13-19)
  const logTerminals = [
    {
      col: 13,
      label: "WS",
      screen: "rgba(0, 255, 100, 0.15)",
      led: "rgba(0, 255, 100, 0.9)",
      rate: 1.0,
    },
    {
      col: 14,
      label: "AUTH",
      screen: "rgba(255, 170, 0, 0.15)",
      led: "rgba(255, 170, 0, 0.9)",
      rate: 0.8,
    },
    {
      col: 15,
      label: "AGNT",
      screen: "rgba(0, 200, 255, 0.15)",
      led: "rgba(0, 200, 255, 0.9)",
      rate: 1.2,
    },
    {
      col: 16,
      label: "CHAN",
      screen: "rgba(255, 60, 60, 0.15)",
      led: "rgba(255, 60, 60, 0.9)",
      rate: 0.7,
    },
    {
      col: 17,
      label: "SESS",
      screen: "rgba(60, 120, 255, 0.15)",
      led: "rgba(60, 120, 255, 0.9)",
      rate: 0.9,
    },
    {
      col: 18,
      label: "EVNT",
      screen: "rgba(255, 220, 50, 0.15)",
      led: "rgba(255, 220, 50, 0.9)",
      rate: 1.3,
    },
    {
      col: 19,
      label: "RPC",
      screen: "rgba(0, 255, 100, 0.15)",
      led: "rgba(0, 255, 100, 0.9)",
      rate: 1.1,
    },
  ];

  for (const term of logTerminals) {
    const tx = offsetX + term.col * s;
    const ty = offsetY + 21 * s;

    // Screen glow fill
    ctx.fillStyle = term.screen;
    ctx.fillRect(tx + 0.25 * s, ty + 0.13 * s, 0.5 * s, 0.5 * s);

    // Category label on screen
    ctx.fillStyle = term.led;
    ctx.font = `bold ${Math.max(8, Math.round(7 * zoom))}px 'Courier New', monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(term.label, tx + 0.5 * s, ty + 0.45 * s);

    // Blinking status LED (bottom-right of terminal)
    const ledCycle = (timeSec * term.rate) % 2.0;
    if (ledCycle > 0.8) {
      ctx.fillStyle = term.led;
      ctx.fillRect(tx + 0.7 * s, ty + 0.58 * s, 2 * zoom, 2 * zoom);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ZION — "Last Human City" ambient lighting
  // Torch flickers, generator pulses, command table glow
  // ═══════════════════════════════════════════════════════════════

  // --- Torch brazier flicker (col 2 & 8, row 15) ---
  const torchPositions = [
    { col: 2, row: 15 },
    { col: 8, row: 15 },
  ];
  for (let ti = 0; ti < torchPositions.length; ti++) {
    const torch = torchPositions[ti];
    // Flickering warm glow — randomized via sine waves at different frequencies
    const flicker1 = Math.sin(timeSec * 3.5 + ti * 2.1) * 0.3 + 0.7;
    const flicker2 = Math.sin(timeSec * 5.7 + ti * 1.3) * 0.15 + 0.85;
    const flicker = flicker1 * flicker2;
    const alpha = 0.15 + flicker * 0.25;

    // Warm ambient glow circle around each torch
    const tcx = offsetX + (torch.col + 0.5) * s;
    const tcy = offsetY + (torch.row + 0.5) * s;
    const glowRadius = s * 1.2;
    const gradient = ctx.createRadialGradient(tcx, tcy, 0, tcx, tcy, glowRadius);
    gradient.addColorStop(0, `rgba(255, 160, 40, ${alpha})`);
    gradient.addColorStop(0.5, `rgba(255, 120, 20, ${alpha * 0.4})`);
    gradient.addColorStop(1, `rgba(255, 80, 0, 0)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(tcx - glowRadius, tcy - glowRadius, glowRadius * 2, glowRadius * 2);

    // Ember spark dot
    const sparkPhase = (timeSec * 2.3 + ti * 4) % 3.0;
    if (sparkPhase > 2.2) {
      ctx.fillStyle = `rgba(255, 200, 60, ${(0.8 * (3.0 - sparkPhase)) / 0.8})`;
      const sparkX = tcx + Math.sin(timeSec * 7 + ti) * 3 * zoom;
      const sparkY = tcy - sparkPhase * 2 * zoom;
      ctx.fillRect(sparkX, sparkY, 1.5 * zoom, 1.5 * zoom);
    }
  }

  // --- Generator pulse (col 2 & 8, row 16) ---
  const genPositions = [
    { col: 2, row: 16 },
    { col: 8, row: 16 },
  ];
  for (let gi = 0; gi < genPositions.length; gi++) {
    const gen = genPositions[gi];
    const pulse = (Math.sin(timeSec * 1.8 + gi * Math.PI) + 1) / 2; // 0→1 smooth pulse

    // Blue power indicator LED
    const ledAlpha = 0.4 + pulse * 0.6;
    ctx.fillStyle = `rgba(60, 140, 255, ${ledAlpha})`;
    const gx = offsetX + (gen.col + 0.35) * s;
    const gy = offsetY + (gen.row + 0.25) * s;
    ctx.fillRect(gx, gy, 2 * zoom, 2 * zoom);

    // Secondary amber status LED
    const amberCycle = (timeSec * 0.9 + gi * 1.5) % 2.5;
    if (amberCycle > 1.5) {
      ctx.fillStyle = `rgba(255, 170, 0, 0.8)`;
      ctx.fillRect(gx + 4 * zoom, gy, 1.5 * zoom, 1.5 * zoom);
    }

    // Subtle power hum glow
    const humAlpha = 0.05 + pulse * 0.08;
    const gcx = offsetX + (gen.col + 0.5) * s;
    const gcy = offsetY + (gen.row + 0.5) * s;
    const humGrad = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, s * 0.7);
    humGrad.addColorStop(0, `rgba(60, 140, 255, ${humAlpha})`);
    humGrad.addColorStop(1, `rgba(60, 140, 255, 0)`);
    ctx.fillStyle = humGrad;
    ctx.fillRect(gcx - s * 0.7, gcy - s * 0.7, s * 1.4, s * 1.4);
  }

  // --- Comms radio blink (col 5, row 15) ---
  const commsBlink = (timeSec * 1.2) % 3.0;
  if (commsBlink > 2.0) {
    ctx.fillStyle = `rgba(0, 255, 100, 0.7)`;
    ctx.fillRect(offsetX + (5 + 0.4) * s, offsetY + (15 + 0.3) * s, 2 * zoom, 2 * zoom);
  } else if (commsBlink > 1.5) {
    ctx.fillStyle = `rgba(255, 60, 60, 0.6)`;
    ctx.fillRect(offsetX + (5 + 0.4) * s, offsetY + (15 + 0.3) * s, 2 * zoom, 2 * zoom);
  }

  // ═══════════════════════════════════════════════════════════════
  // HOVERCRAFT & SENTINEL BORDER PATROLS
  // Natural waypoint-based movement through dark corridors
  // ═══════════════════════════════════════════════════════════════

  // Smooth easing for natural movement (ease-in-out)
  function ease(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Interpolate along waypoints with easing
  function patrol(
    waypoints: Array<{ col: number; row: number }>,
    cycleSec: number,
    timeOffset: number = 0,
  ): { col: number; row: number; segIdx: number; segT: number } {
    const t = ((timeSec + timeOffset) % cycleSec) / cycleSec;
    const totalSegs = waypoints.length - 1;
    const rawSeg = t * totalSegs;
    const segIdx = Math.min(Math.floor(rawSeg), totalSegs - 1);
    const segT = ease(rawSeg - segIdx);
    const a = waypoints[segIdx];
    const b = waypoints[segIdx + 1];
    return {
      col: a.col + (b.col - a.col) * segT,
      row: a.row + (b.row - a.row) * segT,
      segIdx,
      segT,
    };
  }

  // --- Hovercraft: patrols the corridor between Matrix Core (bottom wall row 9)
  //     and zone tops (wall row 14). Sprite is 4 tiles TALL, so:
  //       draw_row + 4 <= 14  →  draw_row <= 10.0
  //     All waypoints are kept at rows 9.6–10.0 so the bottom edge only
  //     touches the zone top wall and never enters zone interior.
  const hcWaypoints = [
    { col: 2, row: 9.8 },
    { col: 7, row: 9.6 },
    { col: 12, row: 9.8 },
    { col: 16, row: 9.6 },
    { col: 20, row: 9.8 },
    { col: 23, row: 9.6 },
    { col: 20, row: 10.0 },
    { col: 16, row: 9.7 },
    { col: 12, row: 10.0 },
    { col: 7, row: 9.7 },
    { col: 2, row: 9.8 },
  ];
  const hcPos = patrol(hcWaypoints, 60);
  // Tight bob — capped so bottom (row + 4 + bob) never exceeds row 14.1
  const hcBobRaw = Math.sin(timeSec * 0.8) * 0.1;
  const hcBob = Math.max(-0.1, Math.min(0.1, hcBobRaw));

  // Direction from active waypoint segment
  const hcA = hcWaypoints[hcPos.segIdx];
  const hcB = hcWaypoints[hcPos.segIdx + 1];
  const hcDeltaCol = hcB.col - hcA.col;
  let hcSprite = HOVERCRAFT_SPRITE;
  if (hcDeltaCol > 0.5) {
    hcSprite = HOVERCRAFT_SPRITE_RIGHT;
  } else if (hcDeltaCol < -0.5) {
    hcSprite = HOVERCRAFT_SPRITE_LEFT;
  }

  // ── HOVERCRAFT ENGINE GLOW (orange core → electric blue outer halo) ──────────
  // Center derived from actual cached canvas dimensions — always pixel-perfect.
  const hcCached = getCachedSprite(hcSprite, zoom);
  const hcDrawX = offsetX + hcPos.col * s;
  const hcDrawY = offsetY + (hcPos.row + hcBob) * s;
  {
    const hcCenterX = hcDrawX + hcCached.width / 2;
    const hcCenterY = hcDrawY + hcCached.height * 0.72; // lower-hull underside
    const hcSpeed = Math.min(Math.abs(hcDeltaCol) / 12, 1);
    const bobPhase = (Math.sin(timeSec * 0.8) + 1) / 2;
    const glowAlpha = 0.18 + 0.14 * bobPhase + 0.1 * hcSpeed;
    const glowRadius = hcCached.width * (0.52 + bobPhase * 0.06 + hcSpeed * 0.05);

    ctx.save();
    const hcGrad = ctx.createRadialGradient(
      hcCenterX,
      hcCenterY,
      0,
      hcCenterX,
      hcCenterY,
      glowRadius,
    );
    hcGrad.addColorStop(0.0, `rgba(255, 210,  80, ${glowAlpha * 1.4})`);
    hcGrad.addColorStop(0.22, `rgba(255, 130,  20, ${glowAlpha})`);
    hcGrad.addColorStop(0.5, `rgba( 80, 140, 255, ${glowAlpha * 0.8})`);
    hcGrad.addColorStop(0.75, `rgba( 30,  80, 220, ${glowAlpha * 0.4})`);
    hcGrad.addColorStop(1.0, `rgba(  0,  30, 160, 0)`);
    ctx.fillStyle = hcGrad;
    ctx.fillRect(hcCenterX - glowRadius, hcCenterY - glowRadius, glowRadius * 2, glowRadius * 2);
    const coreRadius = hcCached.width * 0.065;
    const coreAlpha = 0.55 + 0.25 * bobPhase;
    const coreGrad = ctx.createRadialGradient(
      hcCenterX,
      hcCenterY,
      0,
      hcCenterX,
      hcCenterY,
      coreRadius,
    );
    coreGrad.addColorStop(0, `rgba(255, 240, 160, ${coreAlpha})`);
    coreGrad.addColorStop(0.5, `rgba(255, 180,  40, ${coreAlpha * 0.6})`);
    coreGrad.addColorStop(1, `rgba(255, 100,   0, 0)`);
    ctx.fillStyle = coreGrad;
    ctx.fillRect(hcCenterX - coreRadius, hcCenterY - coreRadius, coreRadius * 2, coreRadius * 2);
    ctx.restore();
  }
  ctx.drawImage(hcCached, hcDrawX, hcDrawY);

  // ── SENTINELS — rectangular perimeter patrol along zone borders ───────────
  // Each sentinel walks the exterior corners of its assigned zone.
  // Duplicate corner waypoints create a natural dwell/pause at each corner.
  // Facing is derived from actual movement direction.
  // No background fill — transparent sprite gaps are intentional design.

  // Helper: draw red threat-scan ring at a sentinel's center
  function drawScanRing(cx: number, cy: number, phase: number, timeOffset: number) {
    const sp = ((timeSec + timeOffset) * 0.6) % 1.0;
    const alpha = 0.2 * (1 - sp);
    const radius = sp * 2.8 * s;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 30, 30, ${alpha})`;
    ctx.lineWidth = 1.5 * zoom;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 60, 60, ${0.28 + Math.sin(timeSec * 4 + phase) * 0.14})`;
    ctx.lineWidth = zoom;
    ctx.stroke();
    ctx.restore();
  }

  // --- Sentinel 1: patrols the exterior perimeter of ZION zone ---
  // Zion: col 1-9, row 14-22. Sentinel walks the OUTSIDE rectangle.
  // Corner waypoints (each corner duplicated for natural dwell pause):
  const s1Waypoints = [
    { col: 1.0, row: 13.5 }, // ① TOP-LEFT  corner — above Zion top-left
    { col: 1.0, row: 13.5 }, // ① dwell copy
    { col: 10.5, row: 13.5 }, // ② TOP-RIGHT corner — above Zion/Broadcast gap
    { col: 10.5, row: 13.5 }, // ② dwell copy
    { col: 10.5, row: 22.5 }, // ③ BOTTOM-RIGHT corner — below gap
    { col: 10.5, row: 22.5 }, // ③ dwell copy
    { col: 1.0, row: 22.5 }, // ④ BOTTOM-LEFT corner — below Zion
    { col: 1.0, row: 22.5 }, // ④ dwell copy
    { col: 1.0, row: 13.5 }, // back to ①
  ];
  const s1Pos = patrol(s1Waypoints, 52);
  const s1A = s1Waypoints[s1Pos.segIdx];
  const s1B = s1Waypoints[s1Pos.segIdx + 1];
  const s1IsDwelling = Math.abs(s1A.col - s1B.col) < 0.01 && Math.abs(s1A.row - s1B.row) < 0.01;

  // Tentacles animate ALWAYS — direction of travel no longer freezes them.
  // Sharpened power curve: raw sine → sign(x)*|x|^0.28
  // Effect: sentinel spends ~99% of cycle fully at LEFT/RIGHT extreme,
  // then snaps through center in <1% of cycle (dramatic collapse).
  let s1Sprite = SENTINEL_SPRITE;
  {
    const s1Raw = Math.sin(timeSec * 3.2); // fast cycle
    const s1Sharp = Math.sign(s1Raw) * Math.pow(Math.abs(s1Raw), 0.28); // sharpen
    if (s1IsDwelling) {
      // At corners: face the nearest zone wall inward
      s1Sprite = s1Pos.col < 5 ? SENTINEL_SPRITE_RIGHT : SENTINEL_SPRITE_LEFT;
    } else if (s1Sharp > 0.12) {
      s1Sprite = SENTINEL_SPRITE_RIGHT;
    } else if (s1Sharp < -0.12) {
      s1Sprite = SENTINEL_SPRITE_LEFT;
    }
    // else center — only during the ~1% snap-through moment
  }

  if (s1IsDwelling) {
    const s1cx = offsetX + (s1Pos.col + 2) * s;
    const s1cy = offsetY + (s1Pos.row + 2) * s;
    drawScanRing(s1cx, s1cy, 0, 0);
  }
  const s1Cached = getCachedSprite(s1Sprite, zoom);
  ctx.drawImage(s1Cached, offsetX + s1Pos.col * s, offsetY + s1Pos.row * s);

  // --- Sentinel 2: patrols the exterior perimeter of MACHINE CITY zone ---
  // Machine City: col 23-31, row 14-22. Walks the OUTSIDE rectangle.
  const s2Waypoints = [
    { col: 22.0, row: 13.5 }, // ① TOP-LEFT  corner — above Broadcast/Machine gap
    { col: 22.0, row: 13.5 }, // ① dwell copy
    { col: 31.0, row: 13.5 }, // ② TOP-RIGHT corner — above Machine City right edge
    { col: 31.0, row: 13.5 }, // ② dwell copy
    { col: 31.0, row: 22.5 }, // ③ BOTTOM-RIGHT corner
    { col: 31.0, row: 22.5 }, // ③ dwell copy
    { col: 22.0, row: 22.5 }, // ④ BOTTOM-LEFT corner — below gap
    { col: 22.0, row: 22.5 }, // ④ dwell copy
    { col: 22.0, row: 13.5 }, // back to ①
  ];
  const s2Pos = patrol(s2Waypoints, 54, 13); // offset so sentinels aren't in sync
  const s2A = s2Waypoints[s2Pos.segIdx];
  const s2B = s2Waypoints[s2Pos.segIdx + 1];
  const s2IsDwelling = Math.abs(s2A.col - s2B.col) < 0.01 && Math.abs(s2A.row - s2B.row) < 0.01;

  let s2Sprite = SENTINEL_SPRITE;
  {
    // S2 uses a different phase (+2.1 rad) and slightly different frequency
    // so it looks completely independent from S1
    const s2Raw = Math.sin(timeSec * 3.0 + 2.1);
    const s2Sharp = Math.sign(s2Raw) * Math.pow(Math.abs(s2Raw), 0.28);
    if (s2IsDwelling) {
      s2Sprite = s2Pos.col < 27 ? SENTINEL_SPRITE_RIGHT : SENTINEL_SPRITE_LEFT;
    } else if (s2Sharp > 0.12) {
      s2Sprite = SENTINEL_SPRITE_RIGHT;
    } else if (s2Sharp < -0.12) {
      s2Sprite = SENTINEL_SPRITE_LEFT;
    }
  }

  if (s2IsDwelling) {
    const s2cx = offsetX + (s2Pos.col + 2) * s;
    const s2cy = offsetY + (s2Pos.row + 2) * s;
    drawScanRing(s2cx, s2cy, 1.5, 0.5);
  }
  const s2Cached = getCachedSprite(s2Sprite, zoom);
  ctx.drawImage(s2Cached, offsetX + s2Pos.col * s, offsetY + s2Pos.row * s);

  ctx.restore();

  return { offsetX, offsetY };
}
