import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';

export class GameOverScene extends Phaser.Scene {
  private restartKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const state = GameState.getInstance();
    const score = state.data.score;
    const highScore = state.data.highScore;
    const floor = state.data.difficultyLevel;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000);

    this.add
      .text(width / 2, height * 0.18, 'GAME  OVER', {
        fontSize: '48px',
        color: '#cc2222',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add.rectangle(width / 2, height * 0.32, width * 0.6, 2, 0xcc2222, 0.4);

    this.add
      .text(width / 2, height * 0.38, `Floor Reached: ${floor}`, {
        fontSize: '22px',
        color: '#aa88ff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.49, `Score:  ${score.toLocaleString()}`, {
        fontSize: '26px',
        color: '#ff8888',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    const hsTxt = score >= highScore && score > 0 ? '★ NEW HIGH SCORE ★' : `Best:   ${highScore.toLocaleString()}`;
    this.add
      .text(width / 2, height * 0.6, hsTxt, {
        fontSize: '20px',
        color: score >= highScore && score > 0 ? '#ffdd00' : '#888888',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.76, 'Press ENTER or tap to try again', {
        fontSize: '18px',
        color: '#666666',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.restartKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.input.once('pointerdown', () => this.restart());
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.restart();
    }
  }

  private restart(): void {
    GameState.getInstance().reset();
    this.scene.start('MainMenuScene');
  }
}
