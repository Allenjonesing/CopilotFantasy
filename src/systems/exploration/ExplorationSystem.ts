import { MapManager } from './MapManager';
import { EventBus } from '../../core/events/EventBus';
import { GameState } from '../../core/state/GameState';

export class ExplorationSystem {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  private bus: EventBus;
  private playerSprite!: Phaser.GameObjects.Rectangle;
  private npcSprites: Phaser.GameObjects.Rectangle[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.mapManager = new MapManager(scene);
    this.bus = EventBus.getInstance();
  }

  /** Build and display the starting map */
  init(): void {
    const state = GameState.getInstance();
    const mapData = this.mapManager.loadMap(state.data.currentMap);
    const tileSize = mapData.tileSize;

    this.playerSprite = this.scene.add.rectangle(
      state.data.playerX * tileSize + tileSize / 2,
      state.data.playerY * tileSize + tileSize / 2,
      tileSize - 4,
      tileSize - 4,
      0xff8844,
    );
    this.playerSprite.setDepth(10);

    mapData.npcs.forEach((npc) => {
      const s = this.scene.add.rectangle(
        npc.x * tileSize + tileSize / 2,
        npc.y * tileSize + tileSize / 2,
        tileSize - 4,
        tileSize - 4,
        npc.color,
      );
      s.setDepth(9);
      this.npcSprites.push(s);
    });
  }

  movePlayer(dx: number, dy: number): void {
    const state = GameState.getInstance();
    const nx = state.data.playerX + dx;
    const ny = state.data.playerY + dy;
    const tile = this.mapManager.getTile(nx, ny);
    if (!tile || !tile.passable) return;
    state.data.playerX = nx;
    state.data.playerY = ny;

    const mapData = this.mapManager.getCurrentMap()!;
    const tileSize = mapData.tileSize;
    this.playerSprite.setPosition(nx * tileSize + tileSize / 2, ny * tileSize + tileSize / 2);

    // Check for exit
    const exit = mapData.exits.find((e) => e.x === nx && e.y === ny);
    if (exit) {
      this.bus.emit('map:exit', exit);
      return;
    }

    // Check for random encounter
    const enemies = this.mapManager.checkEncounter();
    if (enemies && enemies.length > 0) {
      this.bus.emit('combat:start', enemies);
    }
  }

  checkNpcInteraction(): void {
    const state = GameState.getInstance();
    const mapData = this.mapManager.getCurrentMap();
    if (!mapData) return;
    const npc = mapData.npcs.find(
      (n) => Math.abs(n.x - state.data.playerX) <= 1 && Math.abs(n.y - state.data.playerY) <= 1,
    );
    if (npc) {
      this.bus.emit('dialogue:start', npc.dialogueId);
    }
  }

  destroy(): void {
    this.mapManager.destroy();
    this.playerSprite?.destroy();
    this.npcSprites.forEach((s) => s.destroy());
    this.npcSprites = [];
  }
}
