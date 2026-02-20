import { CombatEntity, Stats } from './CombatEntity';
import charactersData from '../../data/characters.json';

export class PlayerCombatant extends CombatEntity {
  readonly characterId: string;

  constructor(characterId: string) {
    const def = charactersData.characters.find((c) => c.id === characterId);
    if (!def) throw new Error(`Unknown character: ${characterId}`);
    const stats: Stats = {
      hp: def.baseStats.hp,
      maxHp: def.baseStats.hp,
      mp: def.baseStats.mp,
      maxMp: def.baseStats.mp,
      strength: def.baseStats.strength,
      magic: def.baseStats.magic,
      defense: def.baseStats.defense,
      magicDefense: def.baseStats.magicDefense,
      agility: def.baseStats.agility,
      luck: def.baseStats.luck,
    };
    super(characterId, def.name, stats);
    this.characterId = characterId;
    this.skills = def.skills;
  }
}
