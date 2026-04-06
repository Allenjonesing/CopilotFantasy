import Phaser from 'phaser';
import { MapManager } from './MapManager';
import { EventBus } from '../../core/events/EventBus';
import { GameState, GUN_JOBS, PersistentMapEnemy, PersistentPickup } from '../../core/state/GameState';
import { BattleType } from '../combat/CombatSystem';

export interface CombatEnemySpec {
  typeId: string;
  displayName: string;
  variantScale: number;
  /** True when this enemy is the floor boss (isGuard). Disables flee in combat. */
  isBoss?: boolean;
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
  isMoving: boolean;
  state: 'wander' | 'chase' | 'guard';
  /** Guard enemies stay near their home tile and only chase within range. */
  isGuard: boolean;
  homeX: number;
  homeY: number;
  sprite: EntitySprite;
  label: Phaser.GameObjects.Text;
}

interface Pickup {
  id: string;
  kind: 'coin' | 'chest';
  gold: number;
  itemId?: string;
  x: number;
  y: number;
  sprite: EntitySprite;
}

interface Shopkeeper {
  x: number;
  y: number;
  sprite: EntitySprite;
  label: Phaser.GameObjects.Text;
}

const ENEMY_WANDER_INTERVAL = 900;
const ENEMY_CHASE_INTERVAL = 480;
const ENEMY_CHASE_RANGE = 6;

/** Base chance for a 2nd enemy to join the battle (scales with difficulty). */
const BASE_EXTRA_ENEMY_CHANCE = 0.40;
/** Per-difficulty increase to the extra-enemy chance. */
const EXTRA_ENEMY_CHANCE_SCALE = 0.05;
/** Maximum extra-enemy chance cap above base. */
const EXTRA_ENEMY_CHANCE_MAX = 0.25;
/** Chance of a 3rd enemy appearing (floor 3+). */
const THIRD_ENEMY_CHANCE = 0.25;

/** Enemy types available per difficulty tier, weighted for variety. */
function enemyTypesForDifficulty(difficulty: number): string[] {
  // Weighted arrays: more copies = higher probability.
  if (difficulty === 1) return ['slime', 'slime', 'slime', 'goblin', 'zombieSlime'];                     // 75% slime, 25% goblin/zombie
  if (difficulty === 2) return ['slime', 'slime', 'goblin', 'zombieSlime'];                              // ~67% slime, ~33% goblin
  if (difficulty === 3) return ['slime', 'goblin', 'caveBat', 'zombieSlime'];                            // mixed early
  if (difficulty <= 5) return ['goblin', 'goblin', 'caveBat', 'stoneTroll', 'mushroomSpore'];            // goblins + new types
  if (difficulty === 6) return ['caveBat', 'stoneTroll', 'shadowWisp', 'mushroomSpore', 'crystalGolem']; // mid tier
  if (difficulty <= 8) return ['stoneTroll', 'shadowWisp', 'shadowWisp', 'crystalGolem', 'healingWisp']; // ~33% troll, ~67% wisp
  if (difficulty <= 10) return ['shadowWisp', 'ironGolem', 'darkWraith', 'crystalGolem', 'healingWisp']; // three-way
  if (difficulty <= 12) return ['ironGolem', 'darkWraith', 'darkWraith', 'crystalGolem'];                // wraith-heavy
  return ['darkWraith', 'voidDrake', 'ironGolem', 'healingWisp'];                                        // late game
}

/** Boss enemy type placed near the exit per difficulty tier. */
function bossTypeForDifficulty(difficulty: number): string {
  if (difficulty <= 2) return 'goblin';
  if (difficulty <= 4) return 'stoneTroll';
  if (difficulty <= 6) return 'shadowWisp';
  if (difficulty <= 9) return 'darkWraith';
  return 'voidDrake';
}

/** Scale multiplier applied to the floor boss on top of variant scale. */
const BOSS_SCALE = 2.5;

/** All possible shop item IDs — base pool used for all parties. */
const ALL_SHOP_ITEMS = ['potion', 'hiPotion', 'ether', 'phoenix', 'antidote', 'smokeBomb', 'freezeBomb', 'mirrorShard', 'zombieDust', 'dispelHerb'];

/** Jobs that primarily use arrows (rangers and healers who have arrowShot). */
const ARROW_JOBS = ['ranger', 'healer'] as const;

/** Fisher-Yates shuffle — unbiased in-place shuffle. */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a randomised shop inventory for each visit (3–5 unique items).
 * When party job IDs are provided, class-specific ammo is guaranteed to
 * appear (if the party has gun or archer classes) and fills one slot;
 * remaining slots come from the general pool.
 */
function generateShopInventory(partyJobs: string[] = []): string[] {
  const hasGunClass = partyJobs.some((j) => (GUN_JOBS as readonly string[]).includes(j));
  const hasArcherClass = partyJobs.some((j) => (ARROW_JOBS as readonly string[]).includes(j));

  // Guaranteed class-specific items always appear first.
  const guaranteed: string[] = [];
  if (hasGunClass) guaranteed.push('gunAmmo');
  if (hasArcherClass) guaranteed.push('arrow');

  // Fill remaining slots from the shuffled general pool (excluding already-guaranteed items).
  const numItems = 3 + Math.floor(Math.random() * 3); // 3, 4, or 5 items total
  const remaining = numItems - guaranteed.length;
  const pool = ALL_SHOP_ITEMS.filter((id) => !guaranteed.includes(id));
  shuffleArray(pool);
  return [...guaranteed, ...pool.slice(0, Math.max(0, remaining))];
}

export class ExplorationSystem {
  private scene: Phaser.Scene;
  private mapManager: MapManager;
  private bus: EventBus;
  private playerSprite!: EntitySprite;
  private exitMarkers: Phaser.GameObjects.GameObject[] = [];
  private mapEnemies: MapEnemy[] = [];
  private pickups: Pickup[] = [];
  private shopkeeper: Shopkeeper | null = null;
  private combatActive = false;
  private isMoving = false;

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
    this.spawnPickups();
    this.spawnShopkeeper();
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
      // Enemy count varies randomly: base 2-4 + floor scaling, max 10.
      const baseCount = 2 + Math.floor(Math.random() * 3);
      const count = Math.min(baseCount + Math.floor(difficulty / 2), 10);
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

      // Spawn a floor boss near the exit that guards the way out.
      const exitTile = mapData.exits[0];
      if (exitTile) {
        const bossTypeId = bossTypeForDifficulty(difficulty);
        const bossBaseName = bossTypeId
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (s) => s.toUpperCase())
          .trim();
        const bossDisplayName = `Floor Boss (${bossBaseName})`;
        // Try to place boss 1-3 tiles from the exit but on a passable tile.
        let bx = exitTile.x;
        let by = exitTile.y;
        for (let attempt = 0; attempt < 50; attempt++) {
          const dx = Math.floor(Math.random() * 5) - 2; // -2 to +2
          const dy = Math.floor(Math.random() * 5) - 2;
          const tx = exitTile.x + dx;
          const ty = exitTile.y + dy;
          if (tx === exitTile.x && ty === exitTile.y) continue;
          const tile = this.mapManager.getTile(tx, ty);
          if (!tile?.passable) continue;
          if (generated.some((e) => e.x === tx && e.y === ty)) continue;
          bx = tx;
          by = ty;
          break;
        }
        generated.push({
          id: 'boss_0',
          typeId: bossTypeId,
          displayName: bossDisplayName,
          variantScale: BOSS_SCALE,
          x: bx,
          y: by,
          isGuard: true,
          homeX: exitTile.x,
          homeY: exitTile.y,
        });

        // On floor 4+ spawn a support minion (Healing Wisp) near the boss.
        if (difficulty >= 4) {
          for (let attempt = 0; attempt < 40; attempt++) {
            const mx = bx + Math.floor(Math.random() * 5) - 2;
            const my = by + Math.floor(Math.random() * 5) - 2;
            if (mx === bx && my === by) continue;
            const tile = this.mapManager.getTile(mx, my);
            if (!tile?.passable) continue;
            if (generated.some((e) => e.x === mx && e.y === my)) continue;
            generated.push({
              id: `support_${difficulty}_0`,
              typeId: 'healingWisp',
              displayName: 'Healing Wisp',
              variantScale: 1.0,
              x: mx,
              y: my,
            });
            break;
          }
        }
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
        // Draw a procedural sprite that reflects the enemy's type visually.
        const color = this.enemyColor(eData.typeId);
        sprite = this.drawEnemySprite(eData.typeId, ex, ey, tileSize, color);
      }

      // Variant visual cues: weak = faded, buff = brighter tint, boss = red+glow
      if (eData.isGuard) {
        sprite.setAlpha(1.0);
        if (sprite instanceof Phaser.GameObjects.Image) {
          sprite.setTint(0xff4400); // red-orange tint for boss
        } else {
          (sprite as Phaser.GameObjects.Rectangle).setFillStyle(0xdd2200);
        }
      } else if (eData.variantScale < 0.82) {
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

      // Label: boss shows 'BOSS', variant shows W!/B!/!
      const labelText = eData.isGuard
        ? 'BOSS'
        : eData.variantScale < 0.82 ? 'W!' : eData.variantScale > 1.18 ? 'B!' : '!';
      const labelColor = eData.isGuard
        ? '#ff4400'
        : eData.variantScale < 0.82 ? '#aaaaaa' : eData.variantScale > 1.18 ? '#ff8844' : '#ffaaaa';

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
        isMoving: false,
        state: eData.isGuard ? 'guard' : 'wander',
        isGuard: eData.isGuard ?? false,
        homeX: eData.homeX ?? eData.x,
        homeY: eData.homeY ?? eData.y,
        sprite,
        label,
      });
    }
  }

  /** Spawn coins and chests on the current floor. */
  private spawnPickups(): void {
    const state = GameState.getInstance();
    const difficulty = state.data.difficultyLevel;
    const mapData = this.mapManager.getCurrentMap()!;
    const tileSize = mapData.tileSize;

    let pickupsToSpawn: PersistentPickup[];

    if (state.data.pendingPickups !== null) {
      // Returning from a mid-floor combat/shop — restore the saved pickups.
      pickupsToSpawn = state.data.pendingPickups;
    } else {
      // Fresh floor – generate new pickups.
      // 3-6 pickups per floor, scaling slightly with difficulty.
      const count = 3 + Math.floor(Math.random() * 3) + Math.min(Math.floor(difficulty / 3), 2);
      const occupied = new Set<string>();
      this.mapEnemies.forEach((e) => occupied.add(`${e.x},${e.y}`));
      occupied.add(`${state.data.playerX},${state.data.playerY}`);

      const generated: PersistentPickup[] = [];
      for (let i = 0; i < count; i++) {
        let tx = 0, ty = 0, placed = false;
        for (let attempt = 0; attempt < 150; attempt++) {
          tx = 1 + Math.floor(Math.random() * (mapData.width - 2));
          ty = 1 + Math.floor(Math.random() * (mapData.height - 2));
          const tile = this.mapManager.getTile(tx, ty);
          if (!tile?.passable) continue;
          if (occupied.has(`${tx},${ty}`)) continue;
          placed = true;
          break;
        }
        if (!placed) continue;
        occupied.add(`${tx},${ty}`);

        // 70% coin (gold), 30% chest (item or bigger gold)
        const isChest = Math.random() < 0.30;
        const kind: 'coin' | 'chest' = isChest ? 'chest' : 'coin';
        const gold = isChest
          ? (5 + Math.floor(Math.random() * 20)) * difficulty
          : (2 + Math.floor(Math.random() * 8)) * difficulty;
        // Chests sometimes contain an item. Gun-class parties find ammo readily.
        const partyHasGunClass = state.data.party.some((c) => (GUN_JOBS as readonly string[]).includes(c.job));
        const itemPool = ['potion', 'ether', 'antidote'];
        if (partyHasGunClass) {
          // ~50% of chests for gun-class parties contain ammo (high find rate).
          itemPool.push('gunAmmo', 'gunAmmo', 'gunAmmo');
        }
        const itemId = isChest && Math.random() < 0.5 ? itemPool[Math.floor(Math.random() * itemPool.length)] : undefined;

        generated.push({ id: `pickup_${i}`, kind, gold, itemId, x: tx, y: ty });
      }

      state.data.pendingPickups = generated;
      pickupsToSpawn = generated;
    }

    for (const pData of pickupsToSpawn) {
      const sx = pData.x * tileSize + tileSize / 2;
      const sy = pData.y * tileSize + tileSize / 2;
      const textureKey = pData.kind === 'chest' ? 'chest' : 'coin';
      let sprite: EntitySprite;
      if (this.scene.textures.exists(textureKey)) {
        sprite = this.scene.add
          .image(sx, sy, textureKey)
          .setDisplaySize(tileSize - 10, tileSize - 10)
          .setDepth(7);
      } else {
        const color = pData.kind === 'chest' ? 0xcc8800 : 0xffdd00;
        sprite = this.scene.add
          .rectangle(sx, sy, tileSize - 12, tileSize - 12, color)
          .setDepth(7);
      }

      this.pickups.push({ ...pData, sprite });
    }
  }

  /** Spawn a shopkeeper NPC on floor 2+ with 60% chance. */
  private spawnShopkeeper(): void {
    const state = GameState.getInstance();

    // If we've already determined the shopkeeper state for this floor, restore it.
    if (state.data.pendingShopkeeper !== null) {
      if (state.data.pendingShopkeeper === false) return; // no shopkeeper this floor
      // Restore the saved shopkeeper position.
      const saved = state.data.pendingShopkeeper;
      this.placeShopkeeperSprite(saved.x, saved.y);
      return;
    }

    // Fresh floor roll.
    if (state.data.difficultyLevel < 2 || Math.random() >= 0.75) {
      state.data.pendingShopkeeper = false;
      return;
    }

    const mapData = this.mapManager.getCurrentMap()!;
    const occupied = new Set<string>();
    this.mapEnemies.forEach((e) => occupied.add(`${e.x},${e.y}`));
    this.pickups.forEach((p) => occupied.add(`${p.x},${p.y}`));
    occupied.add(`${state.data.playerX},${state.data.playerY}`);

    let tx = 0, ty = 0, placed = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      tx = 1 + Math.floor(Math.random() * (mapData.width - 2));
      ty = 1 + Math.floor(Math.random() * (mapData.height - 2));
      const tile = this.mapManager.getTile(tx, ty);
      if (!tile?.passable) continue;
      if (occupied.has(`${tx},${ty}`)) continue;
      // Ensure some distance from player spawn
      if (Math.abs(tx - state.data.playerX) + Math.abs(ty - state.data.playerY) < 4) continue;
      placed = true;
      break;
    }
    if (!placed) {
      state.data.pendingShopkeeper = false;
      return;
    }

    state.data.pendingShopkeeper = { x: tx, y: ty, inventory: generateShopInventory(state.data.party.map((c) => c.job)) };
    this.placeShopkeeperSprite(tx, ty);
  }

  private placeShopkeeperSprite(tx: number, ty: number): void {
    const mapData = this.mapManager.getCurrentMap()!;
    const tileSize = mapData.tileSize;
    const sx = tx * tileSize + tileSize / 2;
    const sy = ty * tileSize + tileSize / 2;
    let sprite: EntitySprite;
    if (this.scene.textures.exists('shopkeeper')) {
      sprite = this.scene.add
        .image(sx, sy, 'shopkeeper')
        .setDisplaySize(tileSize - 4, tileSize - 4)
        .setDepth(9);
    } else {
      sprite = this.scene.add
        .rectangle(sx, sy, tileSize - 4, tileSize - 4, 0x44aaff)
        .setDepth(9);
    }

    const label = this.scene.add
      .text(sx, sy - tileSize, '🛒 SHOP', {
        fontSize: '9px',
        color: '#44aaff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(12);

    this.shopkeeper = { x: tx, y: ty, sprite, label };
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
      caveBat: 0x775577,
      stoneTroll: 0x997755,
      darkWraith: 0x334466,
      voidDrake: 0x220033,
      zombieSlime: 0x335533,
      mushroomSpore: 0x997722,
      crystalGolem: 0x99bbdd,
      healingWisp: 0xdddd44,
    };
    return colors[typeId] ?? 0xcc4444;
  }

  /**
   * Draw a procedural enemy sprite using Phaser Graphics.
   * Each enemy type gets a distinct silhouette so they are visually distinguishable
   * at a glance on the exploration map.
   */
  private drawEnemySprite(
    typeId: string,
    cx: number,
    cy: number,
    tileSize: number,
    color: number,
  ): Phaser.GameObjects.Rectangle {
    const r = Math.floor((tileSize - 6) / 2);
    const gfx = this.scene.add.graphics().setDepth(10);

    // All shapes are drawn centred on (cx, cy).
    switch (typeId) {
      case 'caveBat': {
        // Bat silhouette: main body ellipse + two wing triangles
        gfx.fillStyle(color, 1);
        gfx.fillEllipse(cx, cy + r * 0.2, r, r * 1.0); // body
        gfx.fillTriangle(cx - r * 0.8, cy - r * 0.3, cx - r * 0.1, cy, cx, cy - r * 0.7); // left wing
        gfx.fillTriangle(cx + r * 0.8, cy - r * 0.3, cx + r * 0.1, cy, cx, cy - r * 0.7); // right wing
        break;
      }
      case 'stoneTroll': {
        // Troll: chunky rounded rectangle (wide and squat)
        gfx.fillStyle(color, 1);
        gfx.fillRoundedRect(cx - r * 0.9, cy - r * 0.7, r * 1.8, r * 1.6, 4); // body
        gfx.fillRect(cx - r * 0.5, cy - r * 1.0, r * 1.0, r * 0.4); // head
        break;
      }
      case 'zombieSlime': {
        // Zombie slime: blob with jagged bottom
        gfx.fillStyle(color, 1);
        gfx.fillEllipse(cx, cy, r * 1.6, r * 1.2);
        gfx.fillStyle(0x66ff66, 0.4); // sickly green highlight
        gfx.fillCircle(cx - r * 0.3, cy - r * 0.2, r * 0.3);
        break;
      }
      case 'healingWisp': {
        // Wisp: bright glowing circle with inner sparkle
        gfx.fillStyle(color, 0.7);
        gfx.fillCircle(cx, cy, r * 0.9);
        gfx.fillStyle(0xffffff, 0.9);
        gfx.fillCircle(cx, cy, r * 0.4);
        break;
      }
      case 'crystalGolem': {
        // Crystal: diamond shape
        gfx.fillStyle(color, 1);
        gfx.fillTriangle(cx, cy - r, cx - r * 0.7, cy, cx + r * 0.7, cy); // top half
        gfx.fillTriangle(cx, cy + r, cx - r * 0.7, cy, cx + r * 0.7, cy); // bottom half
        break;
      }
      case 'mushroomSpore': {
        // Mushroom: dome cap + stem
        gfx.fillStyle(color, 1);
        gfx.fillEllipse(cx, cy - r * 0.1, r * 1.8, r * 1.1); // cap
        gfx.fillStyle(0xddbb88, 1);
        gfx.fillRect(cx - r * 0.3, cy + r * 0.4, r * 0.6, r * 0.6); // stem
        break;
      }
      default: {
        // Generic square for any unrecognised type
        gfx.fillStyle(color, 1);
        gfx.fillRect(cx - r, cy - r, r * 2, r * 2);
        break;
      }
    }

    // Return a thin invisible Rectangle as the "sprite" object so the rest of
    // the code can still call .setAlpha(), .setDepth() and use instanceof checks.
    // The graphics object lives independently at the same position.
    const placeholder = this.scene.add
      .rectangle(cx, cy, tileSize - 6, tileSize - 6, 0x000000, 0) // transparent placeholder
      .setDepth(10);
    // Keep a reference so we can destroy the graphics when the enemy is removed.
    (placeholder as unknown as Record<string, unknown>)['_gfx'] = gfx;
    return placeholder;
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
      if (enemy.isMoving) continue;
      enemy.moveTimer = 0;

      // Guard (boss) enemies: chase if player is in range, otherwise return to
      // home tile near the exit instead of wandering freely.
      if (enemy.isGuard) {
        if (dist <= ENEMY_CHASE_RANGE) {
          enemy.state = 'chase';
        } else {
          enemy.state = 'guard';
        }
      } else {
        enemy.state = dist <= ENEMY_CHASE_RANGE ? 'chase' : 'wander';
      }

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
      } else if (enemy.state === 'guard') {
        // Move back toward home tile if more than 1 step away.
        const distFromHome = Math.abs(enemy.x - enemy.homeX) + Math.abs(enemy.y - enemy.homeY);
        if (distFromHome > 1) {
          const dx = enemy.homeX - enemy.x;
          const dy = enemy.homeY - enemy.y;
          if (Math.abs(dx) >= Math.abs(dy)) {
            nx += Math.sign(dx);
          } else {
            ny += Math.sign(dy);
          }
        }
        // If already at home, stay put (nx/ny remain unchanged).
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

        // Smoothly tween the sprite to the new tile position (like player movement).
        const targetSpriteX = nx * tileSize + tileSize / 2;
        const targetSpriteY = ny * tileSize + tileSize / 2;
        enemy.isMoving = true;
        this.scene.tweens.add({
          targets: enemy.sprite,
          x: targetSpriteX,
          y: targetSpriteY,
          duration: 140,
          ease: 'Sine.easeOut',
          onComplete: () => {
            enemy.isMoving = false;
            if (enemy.label.active) {
              enemy.label.setPosition(targetSpriteX, targetSpriteY - tileSize / 2);
            }
          },
        });
      }
    }
  }

  movePlayer(dx: number, dy: number): void {
    if (this.combatActive || this.isMoving) return;
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

    const tileSize = this.mapManager.getCurrentMap()!.tileSize;
    const targetX = nx * tileSize + tileSize / 2;
    const targetY = ny * tileSize + tileSize / 2;

    // Update logical position immediately so collision checks are correct.
    state.data.playerX = nx;
    state.data.playerY = ny;
    this.isMoving = true;

    // Smoothly drift the sprite to the target tile.
    this.scene.tweens.add({
      targets: this.playerSprite,
      x: targetX,
      y: targetY,
      duration: 140,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.isMoving = false;

        // Check for pickup collection.
        const pickupIdx = this.pickups.findIndex((p) => p.x === nx && p.y === ny);
        if (pickupIdx !== -1) {
          this.collectPickup(pickupIdx);
        }

        // Check for shopkeeper interaction.
        if (this.shopkeeper && this.shopkeeper.x === nx && this.shopkeeper.y === ny) {
          this.openShop();
          return;
        }

        // Check for exit tile.
        const mapData = this.mapManager.getCurrentMap()!;
        const exit = mapData.exits.find((e) => e.x === nx && e.y === ny);
        if (exit) {
          // Block further movement so the exit event only fires once per floor.
          this.combatActive = true;
          this.bus.emit('map:exit', exit);
        }
      },
    });
  }

  private collectPickup(idx: number): void {
    const pickup = this.pickups[idx];
    pickup.sprite.destroy();
    this.pickups.splice(idx, 1);

    const state = GameState.getInstance();
    state.addGold(pickup.gold);
    if (pickup.itemId) {
      state.addItem(pickup.itemId);
    }

    // Keep persistent list in sync so this pickup doesn't re-appear after combat.
    if (state.data.pendingPickups) {
      state.data.pendingPickups = state.data.pendingPickups.filter((p) => p.id !== pickup.id);
    }

    this.bus.emit('pickup:collected', {
      kind: pickup.kind,
      gold: pickup.gold,
      itemId: pickup.itemId,
    });
  }

  private openShop(): void {
    if (this.combatActive) return;
    this.combatActive = true;
    // Save player position so they return here after shopping (same logic as pre-combat).
    const state = GameState.getInstance();
    state.data.preCombatX = state.data.playerX;
    state.data.preCombatY = state.data.playerY;
    // Use the predetermined inventory stored when this shopkeeper was spawned so the
    // stock does not change on repeated visits within the same floor.
    const shopkeeper = state.data.pendingShopkeeper;
    const inventory = shopkeeper ? shopkeeper.inventory : generateShopInventory(state.data.party.map((c) => c.job));
    this.bus.emit('shop:open', { inventory });
  }

  private triggerCombat(enemy: MapEnemy): void {
    if (this.combatActive) return;
    this.combatActive = true;

    // Remove the enemy from the map display.
    this.destroyEnemySprite(enemy.sprite);
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
      { typeId: enemy.typeId, displayName: enemy.displayName, variantScale: enemy.variantScale, isBoss: enemy.isGuard },
    ];

    // Chance to add extra enemies (higher chance at higher difficulties).
    // From floor 1: BASE_EXTRA_ENEMY_CHANCE for a 2nd enemy; from floor 3: THIRD_ENEMY_CHANCE for a 3rd.
    const types = enemyTypesForDifficulty(difficulty);
    const extraChance = BASE_EXTRA_ENEMY_CHANCE + Math.min(difficulty * EXTRA_ENEMY_CHANCE_SCALE, EXTRA_ENEMY_CHANCE_MAX);
    if (Math.random() < extraChance) {
      const extraTypeId = types[Math.floor(Math.random() * types.length)];
      const { scale, prefix } = this.rollVariant();
      const baseName = extraTypeId
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      enemies.push({ typeId: extraTypeId, displayName: prefix + baseName, variantScale: scale });
    }
    // Third enemy from floor 3 onward.
    if (difficulty >= 3 && Math.random() < THIRD_ENEMY_CHANCE) {
      const extraTypeId = types[Math.floor(Math.random() * types.length)];
      const { scale, prefix } = this.rollVariant();
      const baseName = extraTypeId
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
      enemies.push({ typeId: extraTypeId, displayName: prefix + baseName, variantScale: scale });
    }

    // Roll for preemptive strike (player advantage) or ambush (enemy advantage).
    const battleType: BattleType = this.rollBattleType();

    this.bus.emit('combat:start', { enemies, difficultyLevel: difficulty, battleType });
  }

  /** Roll for battle-start type: 25% preemptive, 20% ambush, 55% normal. */
  private rollBattleType(): BattleType {
    const roll = Math.random();
    if (roll < 0.25) return 'preemptive';
    if (roll < 0.45) return 'ambush';
    return 'normal';
  }

  destroy(): void {
    // Kill movement tweens for the player and enemies before destroying their sprites.
    this.scene.tweens.killAll();
    this.mapManager.destroy();
    this.playerSprite?.destroy();
    this.mapEnemies.forEach((e) => {
      this.destroyEnemySprite(e.sprite);
      e.label.destroy();
    });
    this.mapEnemies = [];
    this.pickups.forEach((p) => p.sprite.destroy());
    this.pickups = [];
    if (this.shopkeeper) {
      this.shopkeeper.sprite.destroy();
      this.shopkeeper.label.destroy();
      this.shopkeeper = null;
    }
    this.exitMarkers.forEach((m) => m.destroy());
    this.exitMarkers = [];
  }

  /** Destroy an enemy's placeholder sprite and its associated procedural graphics (if any). */
  private destroyEnemySprite(sprite: EntitySprite): void {
    const gfx = (sprite as unknown as Record<string, unknown>)['_gfx'] as Phaser.GameObjects.Graphics | undefined;
    if (gfx) gfx.destroy();
    sprite.destroy();
  }
}
