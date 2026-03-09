import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';

export class ExplorationUI {
  private scene: Phaser.Scene;
  private bus: EventBus;
  private headerBg!: Phaser.GameObjects.Rectangle;
  private floorText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private partyStatusBg!: Phaser.GameObjects.Rectangle;
  private partyTexts: Phaser.GameObjects.Text[] = [];
  private onMapLoaded!: (mapData: unknown) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bus = EventBus.getInstance();
    this.buildUI();
    this.registerEvents();
  }

  private buildUI(): void {
    const W = this.scene.scale.width;

    // ── Header bar (floor + score) ──────────────────────────────────────────
    this.headerBg = this.scene.add.rectangle(W / 2, 14, W, 28, 0x0a0a1a, 0.82);
    this.headerBg.setDepth(50).setScrollFactor(0);

    this.floorText = this.scene.add.text(8, 4, '', {
      fontSize: '14px',
      color: '#aaddff',
      fontFamily: 'monospace',
    });
    this.floorText.setDepth(51).setScrollFactor(0);

    this.scoreText = this.scene.add.text(W - 8, 4, '', {
      fontSize: '14px',
      color: '#ffcc44',
      fontFamily: 'monospace',
    });
    this.scoreText.setOrigin(1, 0).setDepth(51).setScrollFactor(0);

    // ── Party status (top-right, stacked rows) ──────────────────────────────
    this.partyStatusBg = this.scene.add.rectangle(W - 102, 62, 196, 66, 0x0a0a1a, 0.80);
    this.partyStatusBg.setDepth(50).setScrollFactor(0);

    const state = GameState.getInstance();
    state.data.party.forEach((_c, i) => {
      const t = this.scene.add.text(W - 196, 32 + i * 20, '', {
        fontSize: '12px',
        color: '#dddddd',
        fontFamily: 'monospace',
      });
      t.setDepth(51).setScrollFactor(0);
      this.partyTexts.push(t);
    });

    this.refresh();
  }

  private registerEvents(): void {
    this.onMapLoaded = (mapData) => {
      const md = mapData as { name: string };
      if (this.floorText?.active) {
        this.floorText.setText(md.name);
      }
    };
    this.bus.on('map:loaded', this.onMapLoaded);
  }

  refresh(): void {
    const state = GameState.getInstance();
    this.floorText?.setText(`Floor ${state.data.difficultyLevel}  (Lv.${state.data.level})`);
    this.scoreText?.setText(`Score: ${state.data.score.toLocaleString()}`);
    state.data.party.forEach((c, i) => {
      const alive = c.alive ? '' : ' ✕';
      this.partyTexts[i]?.setText(`${c.name}${alive}: ${c.stats.hp}/${c.stats.maxHp} HP`);
    });
  }

  destroy(): void {
    this.bus.off('map:loaded', this.onMapLoaded);
    this.headerBg.destroy();
    this.floorText.destroy();
    this.scoreText.destroy();
    this.partyStatusBg.destroy();
    this.partyTexts.forEach((t) => t.destroy());
  }
}
