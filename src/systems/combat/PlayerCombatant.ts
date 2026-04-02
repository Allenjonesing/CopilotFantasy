import { CombatEntity, Stats } from './CombatEntity';
import { GameState } from '../../core/state/GameState';

/** Default stamina for characters whose definition does not specify stm/maxStm. */
const DEFAULT_STAMINA = 50;

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
      stm: charState.stats.stm ?? DEFAULT_STAMINA,
      maxStm: charState.stats.maxStm ?? DEFAULT_STAMINA,
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
