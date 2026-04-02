import Phaser from 'phaser';
import { BootScene } from '../../scenes/BootScene';
import { MainMenuScene } from '../../scenes/MainMenuScene';
import { JobSelectionScene } from '../../scenes/JobSelectionScene';
import { ExplorationScene } from '../../scenes/ExplorationScene';
import { CombatScene } from '../../scenes/CombatScene';
import { VictoryScene } from '../../scenes/VictoryScene';
import { GameOverScene } from '../../scenes/GameOverScene';
import { ShopScene } from '../../scenes/ShopScene';

/** Lock the screen to portrait mode. */
function lockOrientationToPortrait(): void {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  if (!orientation?.lock) return;
  orientation.lock('portrait').catch(() => {
    // May fail on desktop or when the document is not in fullscreen – ignore silently.
  });
}

/** Pause the Phaser game when the tab/app is hidden; resume when it becomes visible again. */
function setupVisibilityHandler(game: Phaser.Game): void {
  const handler = () => {
    if (document.hidden) {
      game.pause();
    } else {
      game.resume();
    }
  };
  document.addEventListener('visibilitychange', handler);
  // Clean up if the Phaser game instance is ever destroyed.
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    document.removeEventListener('visibilitychange', handler);
  });
}

export function createGame(): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    backgroundColor: '#1a1a2e',
    parent: 'game',
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, MainMenuScene, JobSelectionScene, ExplorationScene, CombatScene, VictoryScene, GameOverScene, ShopScene],
    audio: { disableWebAudio: false },
  };

  const game = new Phaser.Game(config);

  lockOrientationToPortrait();
  setupVisibilityHandler(game);

  return game;
}
