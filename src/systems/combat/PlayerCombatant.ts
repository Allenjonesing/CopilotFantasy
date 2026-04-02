import { CombatEntity, Stats } from './CombatEntity';
import { GameState } from '../../core/state/GameState';

export class PlayerCombatant extends CombatEntity {
  readonly characterId: string;

  constructor(characterId: string) {
    const state = GameState.getInstance();
    const charState = state.getCharacter(characterId);
    if (!charState) throw new Error(`Unknown character: ${characterId}`);
    const stats: Stats = {
      hp: charState.stats.hp,
      maxHp: charState.stats.maxHp,
      mp: charState.stats.mp,
      maxMp: charState.stats.maxMp,
      stm: charState.stats.stm ?? 50,
      maxStm: charState.stats.maxStm ?? 50,
      strength: charState.stats.strength,
      magic: charState.stats.magic,
      defense: charState.stats.defense,
      magicDefense: charState.stats.magicDefense,
      agility: charState.stats.agility,
      luck: charState.stats.luck,
    };
    super(characterId, charState.name, stats);
    this.characterId = characterId;
    this.skills = [...charState.skills];
  }
}
