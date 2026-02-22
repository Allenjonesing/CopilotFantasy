import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';

const W = 800;
const H = 600;

export class ExplorationUI {
  private scene: Phaser.Scene;
  private bus: EventBus;
  private mapNameText!: Phaser.GameObjects.Text;
  private partyStatusBg!: Phaser.GameObjects.Rectangle;
  private partyTexts: Phaser.GameObjects.Text[] = [];
  private helpText!: Phaser.GameObjects.Text;
  private onMapLoaded!: (mapData: unknown) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bus = EventBus.getInstance();
    this.buildUI();
    this.registerEvents();
  }

  private buildUI(): void {
    this.mapNameText = this.scene.add.text(W / 2, 8, '', {
      fontSize: '14px',
      color: '#aaddff',
      fontFamily: 'monospace',
    });
    this.mapNameText.setOrigin(0.5, 0);
    this.mapNameText.setDepth(50);

    this.partyStatusBg = this.scene.add.rectangle(W - 110, 60, 200, 80, 0x111122, 0.8);
    this.partyStatusBg.setDepth(50);

    const state = GameState.getInstance();
    state.data.party.forEach((_c, i) => {
      const t = this.scene.add.text(W - 200, 25 + i * 22, '', {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'monospace',
      });
      t.setDepth(51);
      this.partyTexts.push(t);
    });
    this.refresh();

    this.helpText = this.scene.add.text(W / 2, H - 6, '↑↓←→ Move   Space Interact   (Yellow tile = EXIT)', {
      fontSize: '10px',
      color: '#888888',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 1).setDepth(51);
  }

  private registerEvents(): void {
    this.onMapLoaded = (mapData) => {
      const md = mapData as { name: string };
      if (this.mapNameText?.active) {
        this.mapNameText.setText(md.name);
      }
    };
    this.bus.on('map:loaded', this.onMapLoaded);
  }

  refresh(): void {
    const state = GameState.getInstance();
    state.data.party.forEach((c, i) => {
      this.partyTexts[i]?.setText(`${c.name}: ${c.stats.hp}/${c.stats.maxHp}`);
    });
  }

  destroy(): void {
    this.bus.off('map:loaded', this.onMapLoaded);
    this.mapNameText.destroy();
    this.partyStatusBg.destroy();
    this.partyTexts.forEach((t) => t.destroy());
    this.helpText.destroy();
  }
}
