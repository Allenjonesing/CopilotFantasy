import { CombatEntity, Stats } from './CombatEntity';
import enemiesData from '../../data/enemies.json';

export class EnemyCombatant extends CombatEntity {
  readonly enemyId: string;
  readonly rewards: { exp: number; gil: number; items: string[] };

  constructor(enemyId: string, difficultyScale = 1.0) {
    const def = enemiesData.enemies.find((e) => e.id === enemyId);
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
    super(enemyId, def.name, stats);
    this.enemyId = enemyId;
    this.rewards = {
      exp: Math.ceil(def.rewards.exp * s),
      gil: Math.ceil(def.rewards.gil * s),
      items: def.rewards.items,
    };
    this.skills = def.skills;
  }
}
