import { CombatEntity, Stats } from './CombatEntity';
import enemiesData from '../../data/enemies.json';

/** Stat reduction per floor the enemy is below its natural baseFloor tier. */
const FLOOR_PENALTY_PER_LEVEL = 0.15;
/** Minimum stat multiplier applied by the floor-relative penalty (50%). */
const FLOOR_PENALTY_MIN = 0.5;

interface EnemyDef {
  id: string;
  name: string;
  color: number;
  /**
   * The dungeon floor this enemy naturally belongs to (e.g. slime=1, goblin=2,
   * shadowWisp=5, ironGolem=8). When an enemy appears on a floor below this
   * value a silent downscale penalty is applied so it stays appropriately weak
   * without changing the UI weak/buff variant label.
   */
  baseFloor?: number;
  stats: {
    hp: number; mp: number; strength: number; magic: number;
    defense: number; magicDefense: number; agility: number; luck: number;
  };
  skills: string[];
  rewards: { exp: number; gold: number; items: string[] };
  possibleDrops?: Array<{ id: string; chance: number }>;
}

export class EnemyCombatant extends CombatEntity {
  readonly enemyId: string;
  readonly rewards: { exp: number; gold: number; items: string[] };

  /** Monotonically increasing counter so each instance gets a unique entity ID. */
  private static nextId = 0;

  /**
   * @param enemyId        The enemy type key from enemies.json.
   * @param difficultyScale Combined floor-scale × variant-scale multiplier.
   * @param displayName    Optional override for the displayed name.
   * @param currentFloor   The current dungeon floor (default 1). Used to
   *                       downscale enemies that appear below their natural
   *                       floor tier without changing the UI variant label.
   */
  constructor(enemyId: string, difficultyScale = 1.0, displayName?: string, currentFloor = 1) {
    const def = (enemiesData.enemies as EnemyDef[]).find((e) => e.id === enemyId);
    if (!def) throw new Error(`Unknown enemy: ${enemyId}`);

    // Apply a silent floor-relative penalty when an enemy appears before its
    // natural floor. Each floor below the enemy's base tier reduces stats by
    // FLOOR_PENALTY_PER_LEVEL, down to FLOOR_PENALTY_MIN, so out-of-depth
    // enemies remain non-trivial. Enemies at or above their natural floor are
    // unaffected.
    const baseFloor = def.baseFloor ?? 1;
    const floorPenalty = currentFloor < baseFloor
      ? Math.max(FLOOR_PENALTY_MIN, 1.0 - (baseFloor - currentFloor) * FLOOR_PENALTY_PER_LEVEL)
      : 1.0;

    const s = difficultyScale * floorPenalty;
    const stats: Stats = {
      hp: Math.ceil(def.stats.hp * s),
      maxHp: Math.ceil(def.stats.hp * s),
      mp: def.stats.mp,
      maxMp: def.stats.mp,
      strength: Math.ceil(def.stats.strength * s),
      magic: Math.ceil(def.stats.magic * s),
      defense: Math.ceil(def.stats.defense * s),
      magicDefense: Math.ceil(def.stats.magicDefense * s),
      // Agility scales with difficulty so buff enemies get noticeably more turns
      agility: Math.ceil(def.stats.agility * s),
      luck: def.stats.luck,
    };
    // Use a unique per-instance ID so that multiple enemies of the same type
    // (e.g. two slimes) each get a distinct entry in the UI's entity maps.
    const uniqueId = `${enemyId}_${EnemyCombatant.nextId++}`;
    super(uniqueId, displayName ?? def.name, stats);
    this.enemyId = enemyId;

    // Roll for random item drops at encounter creation time.
    const rolledItems: string[] = (def.possibleDrops ?? [])
      .filter((drop) => Math.random() < drop.chance)
      .map((drop) => drop.id);

    this.rewards = {
      exp: Math.ceil(def.rewards.exp * s),
      gold: Math.ceil(def.rewards.gold * s),
      items: [...def.rewards.items, ...rolledItems],
    };
    this.skills = def.skills;
  }
}
