import Phaser from 'phaser';
import { BootScene } from '../../scenes/BootScene';
import { MainMenuScene } from '../../scenes/MainMenuScene';
import { ExplorationScene } from '../../scenes/ExplorationScene';
import { CombatScene } from '../../scenes/CombatScene';
import { VictoryScene } from '../../scenes/VictoryScene';
import { GameOverScene } from '../../scenes/GameOverScene';

export function createGame(): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    backgroundColor: '#1a1a2e',
    parent: 'game',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MainMenuScene, ExplorationScene, CombatScene, VictoryScene, GameOverScene],
    audio: { disableWebAudio: false },
  };
  return new Phaser.Game(config);
}
