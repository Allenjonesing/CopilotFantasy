import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';
import { AccomplishmentSystem } from '../core/state/AccomplishmentSystem';

export class MainMenuScene extends Phaser.Scene {
  private startKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const highScore = GameState.getInstance().data.highScore;
    const accomplishments = AccomplishmentSystem.getInstance();
    const unlocked = accomplishments.getUnlocked();

    this.add
      .text(width / 2, height * 0.12, 'CopilotFantasy', {
        fontSize: '46px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.26, 'Press ENTER or Tap to Start', {
        fontSize: '20px',
        color: '#aaaaff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.34, 'Roguelike RPG — survive as long as you can', {
        fontSize: '14px',
        color: '#667799',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    if (highScore > 0) {
      this.add
        .text(width / 2, height * 0.42, `Best Score: ${highScore.toLocaleString()}`, {
          fontSize: '18px',
          color: '#ffcc44',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5);
    }

    // ── Accomplishments panel ─────────────────────────────────────────────
    const panelTop = height * (highScore > 0 ? 0.50 : 0.44);
    this.add
      .text(width / 2, panelTop, `✦ Accomplishments  (${unlocked.length} unlocked) ✦`, {
        fontSize: '13px',
        color: '#cc88ff',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    if (unlocked.length === 0) {
      this.add
        .text(width / 2, panelTop + 22, 'None yet — start adventuring!', {
          fontSize: '12px',
          color: '#445566',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5);
    } else {
      // Show up to 6 accomplishments in two columns.
      const maxShow = Math.min(unlocked.length, 6);
      for (let i = 0; i < maxShow; i++) {
        const acc = unlocked[i];
        const col = i % 2;
        const row = Math.floor(i / 2);
        const tx = col === 0 ? width * 0.27 : width * 0.73;
        const ty = panelTop + 22 + row * 22;
        this.add
          .text(tx, ty, `★ ${acc.name}`, {
            fontSize: '11px',
            color: '#ffdd88',
            fontFamily: 'monospace',
          })
          .setOrigin(0.5);
      }
      if (unlocked.length > maxShow) {
        const extra = unlocked.length - maxShow;
        const rows = Math.ceil(maxShow / 2);
        this.add
          .text(width / 2, panelTop + 22 + rows * 22, `…and ${extra} more`, {
            fontSize: '11px',
            color: '#556677',
            fontFamily: 'monospace',
          })
          .setOrigin(0.5);
      }
    }

    this.add
      .text(width / 2, height * 0.93, 'Arrow keys / D-pad to move   Touch enemy to fight', {
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
