import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';
import { AccomplishmentSystem } from '../core/state/AccomplishmentSystem';

export class MainMenuScene extends Phaser.Scene {
  private startKey!: Phaser.Input.Keyboard.Key;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private selectedOption = 0; // 0 = Continue, 1 = New Game (only used when a save exists)
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private hasSave = false;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const highScore = GameState.getInstance().data.highScore;
    const accomplishments = AccomplishmentSystem.getInstance();
    const unlocked = accomplishments.getUnlocked();
    this.hasSave = GameState.getInstance().hasSavedGame();
    this.selectedOption = 0;
    this.optionTexts = [];

    this.add
      .text(width / 2, height * 0.12, 'CopilotFantasy', {
        fontSize: '46px',
        color: '#ffffff',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    if (this.hasSave) {
      // Show CONTINUE / NEW GAME selector
      this.add
        .text(width / 2, height * 0.24, 'Select an option:', {
          fontSize: '14px',
          color: '#667799',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5);

      const continueText = this.add
        .text(width / 2, height * 0.32, '► CONTINUE', {
          fontSize: '26px',
          color: '#aaffaa',
          fontFamily: 'monospace',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      const newGameText = this.add
        .text(width / 2, height * 0.41, '  NEW GAME', {
          fontSize: '22px',
          color: '#aaaaff',
          fontFamily: 'monospace',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.optionTexts = [continueText, newGameText];

      continueText.on('pointerdown', () => {
        this.selectedOption = 0;
        this.confirmSelection();
      });
      newGameText.on('pointerdown', () => {
        this.selectedOption = 1;
        this.confirmSelection();
      });

      this.add
        .text(width / 2, height * 0.49, '↑↓ to select  •  ENTER to confirm', {
          fontSize: '12px',
          color: '#445566',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5);
    } else {
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

      this.input.once('pointerdown', () => {
        this.scene.start('JobSelectionScene');
      });
    }

    if (highScore > 0) {
      this.add
        .text(width / 2, this.hasSave ? height * 0.57 : height * 0.42, `Best Score: ${highScore.toLocaleString()}`, {
          fontSize: '18px',
          color: '#ffcc44',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5);
    }

    // ── Accomplishments panel ─────────────────────────────────────────────
    const panelBase = this.hasSave ? (highScore > 0 ? 0.64 : 0.58) : (highScore > 0 ? 0.50 : 0.44);
    const panelTop = height * panelBase;
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
    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
  }

  update(): void {
    if (this.hasSave) {
      if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
        this.selectedOption = (this.selectedOption - 1 + 2) % 2;
        this.refreshOptionHighlight();
      } else if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
        this.selectedOption = (this.selectedOption + 1) % 2;
        this.refreshOptionHighlight();
      }
      if (Phaser.Input.Keyboard.JustDown(this.startKey)) {
        this.confirmSelection();
      }
    } else {
      if (Phaser.Input.Keyboard.JustDown(this.startKey)) {
        this.scene.start('JobSelectionScene');
      }
    }
  }

  private refreshOptionHighlight(): void {
    const configs = [
      { selected: '► CONTINUE', unselected: '  CONTINUE', selectedColor: '#aaffaa', unselectedColor: '#666688' },
      { selected: '► NEW GAME', unselected: '  NEW GAME', selectedColor: '#aaaaff', unselectedColor: '#666688' },
    ];
    const sizes = ['26px', '22px'];
    this.optionTexts.forEach((t, i) => {
      const cfg = configs[i];
      t.setText(i === this.selectedOption ? cfg.selected : cfg.unselected);
      t.setColor(i === this.selectedOption ? cfg.selectedColor : cfg.unselectedColor);
      t.setFontSize(sizes[i]);
    });
  }

  private confirmSelection(): void {
    if (this.selectedOption === 0) {
      // Continue saved game
      GameState.getInstance().loadSavedGame();
      this.scene.start('ExplorationScene');
    } else {
      // New game — clear save, reset state, then let player select jobs
      GameState.getInstance().reset();
      this.scene.start('JobSelectionScene');
    }
  }
}
