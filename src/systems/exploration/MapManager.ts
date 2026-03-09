import Phaser from 'phaser';
import { EventBus } from '../../core/events/EventBus';
import { GameState } from '../../core/state/GameState';

export type TileType = 'floor' | 'wall' | 'tree' | 'rock';

export interface Tile {
  x: number;
  y: number;
  type: TileType;
  passable: boolean;
}

export interface MapExit {
  x: number;
  y: number;
  targetMap: string;
  targetX: number;
  targetY: number;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: Tile[];
  exits: MapExit[];
}

const MAP_W = 24;
const MAP_H = 17;
const TILE_SIZE = 32;

/** Very simple 32-bit linear congruential RNG. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function generateOverworldMap(seed: number, floorNumber: number): MapData {
  // Use the provided seed (stored per-floor in GameState) so the layout is
  // stable for the duration of a floor, even across combat restarts.
  const rng = makeRng(seed);

  // Player always spawns at (2,2), exit is near bottom-right.
  const SPAWN_X = 2;
  const SPAWN_Y = 2;
  const EXIT_X = MAP_W - 3;
  const EXIT_Y = MAP_H - 3;

  const tiles: Tile[] = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const isBorder = x === 0 || x === MAP_W - 1 || y === 0 || y === MAP_H - 1;

      if (isBorder) {
        tiles.push({ x, y, type: 'wall', passable: false });
        continue;
      }

      // Keep a clear zone around spawn and exit.
      const nearSpawn = Math.abs(x - SPAWN_X) + Math.abs(y - SPAWN_Y) <= 2;
      const nearExit = Math.abs(x - EXIT_X) + Math.abs(y - EXIT_Y) <= 2;

      if (nearSpawn || nearExit) {
        tiles.push({ x, y, type: 'floor', passable: true });
        continue;
      }

      const roll = rng();
      let type: TileType = 'floor';
      if (roll < 0.14) {
        type = 'tree';
      } else if (roll < 0.22) {
        type = 'rock';
      }
      tiles.push({ x, y, type, passable: type === 'floor' });
    }
  }

  return {
    id: 'overworld',
    name: `Floor ${floorNumber}`,
    width: MAP_W,
    height: MAP_H,
    tileSize: TILE_SIZE,
    tiles,
    exits: [{ x: EXIT_X, y: EXIT_Y, targetMap: 'overworld', targetX: SPAWN_X, targetY: SPAWN_Y }],
  };
}

// Tile colours
const TILE_COLORS: Record<TileType, number> = {
  floor: 0x2a3a4a,
  wall: 0x1a2030,
  tree: 0x1a5c1a,
  rock: 0x4a4a5c,
};

export class MapManager {
  private scene: Phaser.Scene;
  private bus: EventBus;
  private currentMap: MapData | null = null;
  private tileSprites: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bus = EventBus.getInstance();
  }

  loadMap(floorNumber: number): MapData {
    const seed = GameState.getInstance().data.mapSeed;
    this.clearMap();
    this.currentMap = generateOverworldMap(seed, floorNumber);
    this.renderMap();
    return this.currentMap;
  }

  private renderMap(): void {
    if (!this.currentMap) return;
    const { tiles, tileSize } = this.currentMap;
    tiles.forEach((tile) => {
      const cx = tile.x * tileSize + tileSize / 2;
      const cy = tile.y * tileSize + tileSize / 2;
      const textureKey = `tile_${tile.type}`;
      let obj: Phaser.GameObjects.GameObject;
      if (this.scene.textures.exists(textureKey)) {
        obj = this.scene.add
          .image(cx, cy, textureKey)
          .setDisplaySize(tileSize - 1, tileSize - 1)
          .setDepth(0);
      } else {
        const color = TILE_COLORS[tile.type] ?? 0x2a3a4a;
        obj = this.scene.add
          .rectangle(cx, cy, tileSize - 1, tileSize - 1, color)
          .setDepth(0);
      }
      this.tileSprites.push(obj);
    });
    this.bus.emit('map:loaded', this.currentMap);
  }

  private clearMap(): void {
    this.tileSprites.forEach((s) => s.destroy());
    this.tileSprites = [];
  }

  destroy(): void {
    this.clearMap();
    this.currentMap = null;
  }

  getTile(x: number, y: number): Tile | undefined {
    return this.currentMap?.tiles.find((t) => t.x === x && t.y === y);
  }

  getCurrentMap(): MapData | null {
    return this.currentMap;
  }
}
