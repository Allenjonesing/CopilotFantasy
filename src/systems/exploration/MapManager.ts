import { EventBus } from '../../core/events/EventBus';

export interface Tile {
  x: number;
  y: number;
  type: 'floor' | 'wall' | 'door' | 'trigger';
  passable: boolean;
  triggerId?: string;
}

export interface NPC {
  id: string;
  name: string;
  x: number;
  y: number;
  dialogueId: string;
  color: number;
}

export interface MapData {
  id: string;
  name: string;
  width: number;
  height: number;
  tileSize: number;
  tiles: Tile[];
  npcs: NPC[];
  encounters: { rate: number; enemies: string[] }[];
  exits: { x: number; y: number; targetMap: string; targetX: number; targetY: number }[];
}

const MAPS: Record<string, MapData> = {
  town: {
    id: 'town',
    name: 'Town of Arlia',
    width: 20,
    height: 15,
    tileSize: 32,
    tiles: (() => {
      const tiles: Tile[] = [];
      for (let y = 0; y < 15; y++) {
        for (let x = 0; x < 20; x++) {
          const isWall = x === 0 || y === 0 || x === 19 || y === 14;
          tiles.push({ x, y, type: isWall ? 'wall' : 'floor', passable: !isWall });
        }
      }
      return tiles;
    })(),
    npcs: [
      { id: 'elder', name: 'Elder', x: 5, y: 5, dialogueId: 'elder_intro', color: 0xffcc44 },
      { id: 'merchant', name: 'Merchant', x: 12, y: 8, dialogueId: 'merchant_intro', color: 0x44ccff },
    ],
    encounters: [{ rate: 0, enemies: [] }],
    exits: [{ x: 10, y: 13, targetMap: 'overworld', targetX: 10, targetY: 1 }],
  },
  overworld: {
    id: 'overworld',
    name: 'Overworld',
    width: 30,
    height: 20,
    tileSize: 32,
    tiles: (() => {
      const tiles: Tile[] = [];
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 30; x++) {
          const isWall = x === 0 || y === 0 || x === 29 || y === 19;
          tiles.push({ x, y, type: isWall ? 'wall' : 'floor', passable: !isWall });
        }
      }
      return tiles;
    })(),
    npcs: [],
    encounters: [{ rate: 0.04, enemies: ['slime', 'goblin'] }],
    exits: [{ x: 10, y: 1, targetMap: 'town', targetX: 10, targetY: 13 }],
  },
};

export class MapManager {
  private scene: Phaser.Scene;
  private bus: EventBus;
  private currentMap: MapData | null = null;
  private tileSprites: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bus = EventBus.getInstance();
  }

  loadMap(mapId: string): MapData {
    const mapData = MAPS[mapId];
    if (!mapData) throw new Error(`Unknown map: ${mapId}`);
    this.clearMap();
    this.currentMap = mapData;
    this.renderMap();
    return mapData;
  }

  private renderMap(): void {
    if (!this.currentMap) return;
    const { tiles, tileSize } = this.currentMap;
    tiles.forEach((tile) => {
      const color = tile.type === 'wall' ? 0x334455 : tile.type === 'door' ? 0x886644 : 0x223344;
      const rect = this.scene.add.rectangle(
        tile.x * tileSize + tileSize / 2,
        tile.y * tileSize + tileSize / 2,
        tileSize - 1,
        tileSize - 1,
        color,
      );
      this.tileSprites.push(rect);
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

  checkEncounter(): string[] | null {
    if (!this.currentMap) return null;
    for (const enc of this.currentMap.encounters) {
      if (enc.rate > 0 && Math.random() < enc.rate) {
        return enc.enemies;
      }
    }
    return null;
  }
}
