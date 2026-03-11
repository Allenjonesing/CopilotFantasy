import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';

export class ExplorationUI {
  private scene: Phaser.Scene;
  private bus: EventBus;
  private headerBg!: Phaser.GameObjects.Rectangle;
  private floorText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private onMapLoaded!: (mapData: unknown) => void;
  private pickupMsg: Phaser.GameObjects.Text | null = null;
  private pickupTimer = 0;

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

    // Gold display (center of header)
    this.goldText = this.scene.add.text(W / 2, 4, '', {
      fontSize: '13px',
      color: '#ffe066',
      fontFamily: 'monospace',
    });
    this.goldText.setOrigin(0.5, 0).setDepth(51).setScrollFactor(0);

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
    this.goldText?.setText(`💰 ${state.data.gold} Gold`);
  }

  /** Show a brief pickup notification message on screen. */
  showPickupMessage(msg: string): void {
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    // Destroy any existing pickup message before creating a new one.
    this.pickupMsg?.destroy();
    this.pickupMsg = null;
    this.pickupMsg = this.scene.add.text(W / 2, H / 2 - 60, msg, {
      fontSize: '18px',
      color: '#ffe066',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.pickupMsg.setOrigin(0.5, 0.5).setDepth(80).setScrollFactor(0);
    this.pickupTimer = 2200;
  }

  /** Call from scene update() to animate the pickup message fade-out. */
  updatePickupMsg(delta: number): void {
    if (!this.pickupMsg || !this.pickupMsg.active) return;
    this.pickupTimer -= delta;
    if (this.pickupTimer <= 0) {
      this.pickupMsg.destroy();
      this.pickupMsg = null;
    } else if (this.pickupTimer < 600) {
      this.pickupMsg.setAlpha(this.pickupTimer / 600);
    }
  }

  destroy(): void {
    this.bus.off('map:loaded', this.onMapLoaded);
    this.headerBg.destroy();
    this.floorText.destroy();
    this.scoreText.destroy();
    this.goldText.destroy();
    this.pickupMsg?.destroy();
  }
}
