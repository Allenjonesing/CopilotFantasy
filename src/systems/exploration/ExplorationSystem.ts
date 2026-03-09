import Phaser from 'phaser';
import { MapManager } from './MapManager';
import { EventBus } from '../../core/events/EventBus';
import { GameState, PersistentMapEnemy } from '../../core/state/GameState';

export interface CombatEnemySpec {
  typeId: string;
  displayName: string;
  variantScale: number;
}

/** Union of the two game-object types used for entity sprites. */
type EntitySprite = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

interface MapEnemy {
  id: string;
  typeId: string;
  displayName: string;
  variantScale: number;
  x: number;
  y: number;
  moveTimer: number;
  state: 'wander' | 'chase';
  sprite: EntitySprite;
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
  private playerSprite!: EntitySprite;
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

    const px = state.data.playerX * tileSize + tileSize / 2;
    const py = state.data.playerY * tileSize + tileSize / 2;
    if (this.scene.textures.exists('player')) {
      this.playerSprite = this.scene.add
        .image(px, py, 'player')
        .setDisplaySize(tileSize - 4, tileSize - 4)
        .setDepth(10);
    } else {
      this.playerSprite = this.scene.add
        .rectangle(px, py, tileSize - 4, tileSize - 4, 0xff8844)
        .setDepth(10);
    }

    // Set up camera to follow the player within map bounds so the game works
    // on portrait screens where the map is wider than the visible area.
    const mapW = mapData.width * tileSize;
    const mapH = mapData.height * tileSize;
    this.scene.cameras.main.setBounds(0, 0, mapW, mapH);
    this.scene.cameras.main.startFollow(this.playerSprite, true);

    // Exit marker — use the dedicated exit tile texture when available.
    mapData.exits.forEach((exit) => {
      const ex = exit.x * tileSize + tileSize / 2;
      const ey = exit.y * tileSize + tileSize / 2;
      let marker: EntitySprite;
      if (this.scene.textures.exists('tile_exit')) {
        marker = this.scene.add
          .image(ex, ey, 'tile_exit')
          .setDisplaySize(tileSize - 4, tileSize - 4)
          .setDepth(8)
          .setAlpha(0.9);
      } else {
        marker = this.scene.add
          .rectangle(ex, ey, tileSize - 4, tileSize - 4, 0xffdd00)
          .setDepth(8)
          .setAlpha(0.75);
      }
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

    // Determine the set of enemies to place.
    // If we're returning from a mid-floor combat, reuse the saved list.
    let enemiesToSpawn: PersistentMapEnemy[];

    if (state.data.pendingMapEnemies !== null) {
      enemiesToSpawn = state.data.pendingMapEnemies;
    } else {
      // Fresh floor – generate new enemies with random variant scaling.
      const count = Math.min(3 + Math.floor(difficulty / 2), 8);
      const generated: PersistentMapEnemy[] = [];

      for (let i = 0; i < count; i++) {
        const typeId = types[Math.floor(Math.random() * types.length)];
        const { scale: variantScale, prefix } = this.rollVariant();
        const baseName = typeId
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (s) => s.toUpperCase())
          .trim();
        const displayName = prefix + baseName;

        let ex = 0;
        let ey = 0;
        let placed = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          const tx = 1 + Math.floor(Math.random() * (mapData.width - 2));
          const ty = 1 + Math.floor(Math.random() * (mapData.height - 2));
          const tile = this.mapManager.getTile(tx, ty);
          if (!tile?.passable) continue;
          if (Math.abs(tx - state.data.playerX) + Math.abs(ty - state.data.playerY) < 5) continue;
          if (generated.some((e) => e.x === tx && e.y === ty)) continue;
          ex = tx;
          ey = ty;
          placed = true;
          break;
        }
        if (!placed) continue;

        generated.push({ id: `enemy_${i}`, typeId, displayName, variantScale, x: ex, y: ey });
      }

      state.data.pendingMapEnemies = generated;
      enemiesToSpawn = generated;
    }

    // Render each enemy.
    for (const eData of enemiesToSpawn) {
      const ex = eData.x * tileSize + tileSize / 2;
      const ey = eData.y * tileSize + tileSize / 2;
      const textureKey = `enemy_${eData.typeId}`;
      let sprite: EntitySprite;

      if (this.scene.textures.exists(textureKey)) {
        sprite = this.scene.add
          .image(ex, ey, textureKey)
          .setDisplaySize(tileSize - 6, tileSize - 6)
          .setDepth(10);
      } else {
        const color = this.enemyColor(eData.typeId);
        sprite = this.scene.add
          .rectangle(ex, ey, tileSize - 6, tileSize - 6, color)
          .setDepth(10);
      }

      // Variant visual cues: weak = faded, buff = brighter tint
      if (eData.variantScale < 0.82) {
        sprite.setAlpha(0.65);
      } else if (eData.variantScale > 1.18) {
        sprite.setAlpha(1.0);
        if (sprite instanceof Phaser.GameObjects.Image) {
          sprite.setTint(0xffccaa); // warm tint for buff variant
        } else {
          const color = this.enemyColor(eData.typeId);
          (sprite as Phaser.GameObjects.Rectangle).setFillStyle(
            Phaser.Display.Color.ValueToColor(color).brighten(20).color,
          );
        }
      }

      // Label: show variant indicator so the player has a heads-up.
      const labelText = eData.variantScale < 0.82 ? 'W!' : eData.variantScale > 1.18 ? 'B!' : '!';
      const labelColor = eData.variantScale < 0.82 ? '#aaaaaa' : eData.variantScale > 1.18 ? '#ff8844' : '#ffaaaa';

      const label = this.scene.add
        .text(eData.x * tileSize + tileSize / 2, eData.y * tileSize, labelText, {
          fontSize: '10px',
          color: labelColor,
          fontFamily: 'monospace',
        })
        .setOrigin(0.5, 1)
        .setDepth(11);

      this.mapEnemies.push({
        ...eData,
        moveTimer: Math.random() * 600,
        state: 'wander',
        sprite,
        label,
      });
    }
  }

  /** Returns a variant scale and optional name prefix for a spawned enemy. */
  private rollVariant(): { scale: number; prefix: string } {
    const roll = Math.random();
    if (roll < 0.2) {
      // Weak variant: 60–80% of base stats.
      return { scale: 0.60 + Math.random() * 0.21, prefix: 'Weak ' };
    }
    if (roll >= 0.80) {
      // Buff variant: 120–140% of base stats.
      return { scale: 1.20 + Math.random() * 0.21, prefix: 'Buff ' };
    }
    // Normal variant: slight random variance, no prefix.
    return { scale: 0.85 + Math.random() * 0.31, prefix: '' };
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

        // Keep the persistent enemy record in sync so that if the player
        // flees from a later combat, enemies re-spawn at their last seen
        // positions rather than their original spawn positions.
        const persEnemy = state.data.pendingMapEnemies?.find((e) => e.id === enemy.id);
        if (persEnemy) {
          persEnemy.x = nx;
          persEnemy.y = ny;
        }

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
      // Block further movement so the exit event only fires once per floor.
      this.combatActive = true;
      this.bus.emit('map:exit', exit);
    }
  }

  private triggerCombat(enemy: MapEnemy): void {
    if (this.combatActive) return;
    this.combatActive = true;

    // Remove the enemy from the map display.
    enemy.sprite.destroy();
    enemy.label.destroy();
    this.mapEnemies = this.mapEnemies.filter((e) => e !== enemy);

    const state = GameState.getInstance();
    const difficulty = state.data.difficultyLevel;

    // Save player position so ExplorationScene can restore it after combat.
    state.data.preCombatX = state.data.playerX;
    state.data.preCombatY = state.data.playerY;

    // Remove this enemy from the persistent list so it doesn't respawn.
    if (state.data.pendingMapEnemies) {
      state.data.pendingMapEnemies = state.data.pendingMapEnemies.filter(
        (e) => e.id !== enemy.id,
      );
    }

    const enemies: CombatEnemySpec[] = [
      { typeId: enemy.typeId, displayName: enemy.displayName, variantScale: enemy.variantScale },
    ];

    // Chance to add a second enemy at higher difficulty.
    if (difficulty >= 4 && Math.random() < 0.35) {
      const types = enemyTypesForDifficulty(difficulty);
      const extraTypeId = types[Math.floor(Math.random() * types.length)];
      const { scale, prefix } = this.rollVariant();
      const baseName = extraTypeId
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      enemies.push({ typeId: extraTypeId, displayName: prefix + baseName, variantScale: scale });
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
