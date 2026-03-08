import Phaser from 'phaser';
import { MapManager } from './MapManager';
import { EventBus } from '../../core/events/EventBus';
import { GameState } from '../../core/state/GameState';

interface MapEnemy {
  id: string;
  typeId: string;
  x: number;
  y: number;
  moveTimer: number;
  state: 'wander' | 'chase';
  sprite: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

const ENEMY_WANDER_INTERVAL = 900;
const ENEMY_CHASE_INTERVAL = 480;
const ENEMY_CHASE_RANGE = 6;

/** Enemy types available per difficulty tier. */
function enemyTypesForDifficulty(difficulty: number): string[] {
  if (difficulty <= 3) return ['slime'];
  if (difficulty <= 6) return ['slime', 'goblin'];
  if (difficulty <= 10) return ['goblin', 'shadowWisp'];
  return ['shadowWisp', 'ironGolem'];
}

export class ExplorationSystem {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  private bus: EventBus;
  private playerSprite!: Phaser.GameObjects.Rectangle;
  private exitMarkers: Phaser.GameObjects.GameObject[] = [];
  private mapEnemies: MapEnemy[] = [];
  private combatActive = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.mapManager = new MapManager(scene);
    this.bus = EventBus.getInstance();
  }

  /** Build and display the starting map, then spawn enemies. */
  init(): void {
    const state = GameState.getInstance();
    const mapData = this.mapManager.loadMap(state.data.difficultyLevel);
    const tileSize = mapData.tileSize;

    this.playerSprite = this.scene.add.rectangle(
      state.data.playerX * tileSize + tileSize / 2,
      state.data.playerY * tileSize + tileSize / 2,
      tileSize - 4,
      tileSize - 4,
      0xff8844,
    );
    this.playerSprite.setDepth(10);

    // Exit marker
    mapData.exits.forEach((exit) => {
      const ex = exit.x * tileSize + tileSize / 2;
      const ey = exit.y * tileSize + tileSize / 2;
      const marker = this.scene.add.rectangle(ex, ey, tileSize - 4, tileSize - 4, 0xffdd00);
      marker.setDepth(8);
      marker.setAlpha(0.75);
      const label = this.scene.add
        .text(ex, ey - tileSize, '⬆ EXIT', {
          fontSize: '9px',
          color: '#ffdd00',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5, 1)
        .setDepth(12);
      this.exitMarkers.push(marker, label);
    });

    this.spawnMapEnemies();
    this.combatActive = false;
  }

  private spawnMapEnemies(): void {
    const state = GameState.getInstance();
    const difficulty = state.data.difficultyLevel;
    const mapData = this.mapManager.getCurrentMap()!;
    const tileSize = mapData.tileSize;
    const types = enemyTypesForDifficulty(difficulty);
    const count = Math.min(3 + Math.floor(difficulty / 2), 8);

    for (let i = 0; i < count; i++) {
      const typeId = types[Math.floor(Math.random() * types.length)];
      let ex = 0;
      let ey = 0;
      let placed = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        const tx = 1 + Math.floor(Math.random() * (mapData.width - 2));
        const ty = 1 + Math.floor(Math.random() * (mapData.height - 2));
        const tile = this.mapManager.getTile(tx, ty);
        if (!tile?.passable) continue;
        if (Math.abs(tx - state.data.playerX) + Math.abs(ty - state.data.playerY) < 5) continue;
        if (this.mapEnemies.some((e) => e.x === tx && e.y === ty)) continue;
        ex = tx;
        ey = ty;
        placed = true;
        break;
      }
      if (!placed) continue;

      const color = this.enemyColor(typeId);
      const sprite = this.scene.add
        .rectangle(
          ex * tileSize + tileSize / 2,
          ey * tileSize + tileSize / 2,
          tileSize - 6,
          tileSize - 6,
          color,
        )
        .setDepth(10);

      const label = this.scene.add
        .text(ex * tileSize + tileSize / 2, ey * tileSize, '!', {
          fontSize: '10px',
          color: '#ffaaaa',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5, 1)
        .setDepth(11);

      this.mapEnemies.push({
        id: `enemy_${i}`,
        typeId,
        x: ex,
        y: ey,
        moveTimer: Math.random() * 600,
        state: 'wander',
        sprite,
        label,
      });
    }
  }

  private enemyColor(typeId: string): number {
    const colors: Record<string, number> = {
      slime: 0x44aa44,
      goblin: 0xcc7733,
      shadowWisp: 0x884488,
      ironGolem: 0x888899,
    };
    return colors[typeId] ?? 0xcc4444;
  }

  /** Called every frame from ExplorationScene.update(). */
  updateEnemies(delta: number): void {
    if (this.combatActive) return;
    const state = GameState.getInstance();
    const px = state.data.playerX;
    const py = state.data.playerY;

    for (const enemy of [...this.mapEnemies]) {
      enemy.moveTimer += delta;
      const dist = Math.abs(enemy.x - px) + Math.abs(enemy.y - py);
      const interval = dist <= ENEMY_CHASE_RANGE ? ENEMY_CHASE_INTERVAL : ENEMY_WANDER_INTERVAL;
      if (enemy.moveTimer < interval) continue;
      enemy.moveTimer = 0;
      enemy.state = dist <= ENEMY_CHASE_RANGE ? 'chase' : 'wander';

      let nx = enemy.x;
      let ny = enemy.y;

      if (enemy.state === 'chase') {
        const dx = px - enemy.x;
        const dy = py - enemy.y;
        if (Math.abs(dx) >= Math.abs(dy)) {
          nx += Math.sign(dx);
        } else {
          ny += Math.sign(dy);
        }
      } else {
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]].sort(() => Math.random() - 0.5);
        for (const [ddx, ddy] of dirs) {
          const tx = enemy.x + ddx;
          const ty = enemy.y + ddy;
          const tile = this.mapManager.getTile(tx, ty);
          if (tile?.passable && !this.mapEnemies.some((e) => e !== enemy && e.x === tx && e.y === ty)) {
            nx = tx;
            ny = ty;
            break;
          }
        }
      }

      const targetTile = this.mapManager.getTile(nx, ny);
      if (
        targetTile?.passable &&
        !this.mapEnemies.some((e) => e !== enemy && e.x === nx && e.y === ny)
      ) {
        enemy.x = nx;
        enemy.y = ny;
        const tileSize = this.mapManager.getCurrentMap()!.tileSize;
        enemy.sprite.setPosition(nx * tileSize + tileSize / 2, ny * tileSize + tileSize / 2);
        enemy.label.setPosition(nx * tileSize + tileSize / 2, ny * tileSize);

        if (nx === px && ny === py) {
          this.triggerCombat(enemy);
          return;
        }
      }
    }
  }

  movePlayer(dx: number, dy: number): void {
    if (this.combatActive) return;
    const state = GameState.getInstance();
    const nx = state.data.playerX + dx;
    const ny = state.data.playerY + dy;

    // Stepping into an enemy triggers combat.
    const enemy = this.mapEnemies.find((e) => e.x === nx && e.y === ny);
    if (enemy) {
      this.triggerCombat(enemy);
      return;
    }

    const tile = this.mapManager.getTile(nx, ny);
    if (!tile?.passable) return;

    state.data.playerX = nx;
    state.data.playerY = ny;
    const tileSize = this.mapManager.getCurrentMap()!.tileSize;
    this.playerSprite.setPosition(nx * tileSize + tileSize / 2, ny * tileSize + tileSize / 2);

    // Check for exit tile.
    const mapData = this.mapManager.getCurrentMap()!;
    const exit = mapData.exits.find((e) => e.x === nx && e.y === ny);
    if (exit) {
      this.bus.emit('map:exit', exit);
    }
  }

  private triggerCombat(enemy: MapEnemy): void {
    if (this.combatActive) return;
    this.combatActive = true;

    // Remove the enemy from the map.
    enemy.sprite.destroy();
    enemy.label.destroy();
    this.mapEnemies = this.mapEnemies.filter((e) => e !== enemy);

    const state = GameState.getInstance();
    const difficulty = state.data.difficultyLevel;
    const enemies = [enemy.typeId];

    // Chance to add a second enemy at higher difficulty.
    if (difficulty >= 4 && Math.random() < 0.35) {
      const types = enemyTypesForDifficulty(difficulty);
      enemies.push(types[Math.floor(Math.random() * types.length)]);
    }

    this.bus.emit('combat:start', { enemies, difficultyLevel: difficulty });
  }

  destroy(): void {
    this.mapManager.destroy();
    this.playerSprite?.destroy();
    this.mapEnemies.forEach((e) => {
      e.sprite.destroy();
      e.label.destroy();
    });
    this.mapEnemies = [];
    this.exitMarkers.forEach((m) => m.destroy());
    this.exitMarkers = [];
  }
}
