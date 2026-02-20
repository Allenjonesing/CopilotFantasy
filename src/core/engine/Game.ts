import Phaser from 'phaser';
import { BootScene } from '../../scenes/BootScene';
import { MainMenuScene } from '../../scenes/MainMenuScene';
import { ExplorationScene } from '../../scenes/ExplorationScene';
import { CombatScene } from '../../scenes/CombatScene';
import { GameOverScene } from '../../scenes/GameOverScene';

export function createGame(): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    backgroundColor: '#1a1a2e',
    parent: 'game',
    scene: [BootScene, MainMenuScene, ExplorationScene, CombatScene, GameOverScene],
    audio: { disableWebAudio: false },
  };
  return new Phaser.Game(config);
}
