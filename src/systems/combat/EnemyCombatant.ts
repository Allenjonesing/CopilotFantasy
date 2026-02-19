import { CombatEntity, Stats } from './CombatEntity';
import enemiesData from '../../data/enemies.json';

export class EnemyCombatant extends CombatEntity {
  readonly enemyId: string;
  readonly rewards: { exp: number; gil: number; items: string[] };

  constructor(enemyId: string) {
    const def = enemiesData.enemies.find((e) => e.id === enemyId);
    if (!def) throw new Error(`Unknown enemy: ${enemyId}`);
    const stats: Stats = {
      hp: def.stats.hp,
      maxHp: def.stats.hp,
      mp: def.stats.mp,
      maxMp: def.stats.mp,
      strength: def.stats.strength,
      magic: def.stats.magic,
      defense: def.stats.defense,
      magicDefense: def.stats.magicDefense,
      agility: def.stats.agility,
      luck: def.stats.luck,
    };
    super(enemyId, def.name, stats);
    this.enemyId = enemyId;
    this.rewards = def.rewards;
    this.skills = def.skills;
  }
}
