import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';

export class GameOverScene extends Phaser.Scene {
  private restartKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000);
    this.add.text(width / 2, height / 3, 'GAME OVER', {
      fontSize: '48px',
      color: '#cc2222',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.add.text(width / 2, height / 2, 'Press ENTER to try again', {
      fontSize: '20px',
      color: '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      GameState.getInstance().reset();
      this.scene.start('MainMenuScene');
    }
  }
}
