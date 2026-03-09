import { CombatEntity, Stats } from './CombatEntity';
import enemiesData from '../../data/enemies.json';

interface EnemyDef {
  id: string;
  name: string;
  color: number;
  stats: {
    hp: number; mp: number; strength: number; magic: number;
    defense: number; magicDefense: number; agility: number; luck: number;
  };
  skills: string[];
  rewards: { exp: number; gil: number; items: string[] };
  possibleDrops?: Array<{ id: string; chance: number }>;
}

export class EnemyCombatant extends CombatEntity {
  readonly enemyId: string;
  readonly rewards: { exp: number; gil: number; items: string[] };

  /** Monotonically increasing counter so each instance gets a unique entity ID. */
  private static nextId = 0;

  constructor(enemyId: string, difficultyScale = 1.0, displayName?: string) {
    const def = (enemiesData.enemies as EnemyDef[]).find((e) => e.id === enemyId);
    if (!def) throw new Error(`Unknown enemy: ${enemyId}`);
    const s = difficultyScale;
    const stats: Stats = {
      hp: Math.ceil(def.stats.hp * s),
      maxHp: Math.ceil(def.stats.hp * s),
      mp: def.stats.mp,
      maxMp: def.stats.mp,
      strength: Math.ceil(def.stats.strength * s),
      magic: Math.ceil(def.stats.magic * s),
      defense: Math.ceil(def.stats.defense * s),
      magicDefense: Math.ceil(def.stats.magicDefense * s),
      agility: def.stats.agility,
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
      gil: Math.ceil(def.rewards.gil * s),
      items: [...def.rewards.items, ...rolledItems],
    };
    this.skills = def.skills;
  }
}
