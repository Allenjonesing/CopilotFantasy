import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';

export class MainMenuScene extends Phaser.Scene {
  private startKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const highScore = GameState.getInstance().data.highScore;

    this.add
      .text(width / 2, height * 0.22, 'CopilotFantasy', {
        fontSize: '46px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.38, 'Press ENTER or Tap to Start', {
        fontSize: '20px',
        color: '#aaaaff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.52, 'Roguelike RPG — survive as long as you can', {
        fontSize: '14px',
        color: '#667799',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    if (highScore > 0) {
      this.add
        .text(width / 2, height * 0.64, `Best Score: ${highScore.toLocaleString()}`, {
          fontSize: '18px',
          color: '#ffcc44',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5);
    }

    this.add
      .text(width / 2, height * 0.88, 'Arrow keys / D-pad to move   Touch enemy to fight', {
        fontSize: '12px',
        color: '#445566',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.startKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    this.input.once('pointerdown', () => {
      this.scene.start('ExplorationScene');
    });
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.startKey)) {
      this.scene.start('ExplorationScene');
    }
  }
}
