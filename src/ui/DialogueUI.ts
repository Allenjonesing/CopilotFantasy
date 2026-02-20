import { DialogueSystem } from '../systems/dialogue/DialogueSystem';
import { EventBus } from '../core/events/EventBus';

const W = 800;
const H = 600;
const BOX_H = 140;
const BOX_Y = H - BOX_H - 10;

export class DialogueUI {
  private scene: Phaser.Scene;
  private dialogue: DialogueSystem;
  private bus: EventBus;
  private container!: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Rectangle;
  private speakerText!: Phaser.GameObjects.Text;
  private lineText!: Phaser.GameObjects.Text;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  visible = false;

  constructor(scene: Phaser.Scene, dialogue: DialogueSystem) {
    this.scene = scene;
    this.dialogue = dialogue;
    this.bus = EventBus.getInstance();
    this.buildUI();
    this.registerEvents();
  }

  private buildUI(): void {
    this.bg = this.scene.add.rectangle(W / 2, BOX_Y + BOX_H / 2, W - 20, BOX_H, 0x111122, 0.9);
    this.bg.setStrokeStyle(2, 0x8888ff);
    this.speakerText = this.scene.add.text(20, BOX_Y + 10, '', {
      fontSize: '16px',
      color: '#aaaaff',
      fontFamily: 'monospace',
    });
    this.lineText = this.scene.add.text(20, BOX_Y + 35, '', {
      fontSize: '14px',
      color: '#ffffff',
      fontFamily: 'monospace',
      wordWrap: { width: W - 40 },
    });
    this.container = this.scene.add.container(0, 0, [this.bg, this.speakerText, this.lineText]);
    this.container.setVisible(false);
    this.container.setDepth(100);
  }

  private registerEvents(): void {
    this.bus.on('dialogue:opened', (line) => {
      this.show(line as Parameters<typeof this.show>[0]);
    });
    this.bus.on('dialogue:line', (line) => {
      this.show(line as Parameters<typeof this.show>[0]);
    });
    this.bus.on('dialogue:closed', () => this.hide());
  }

  private show(line: { speaker: string; text: string; choices?: { text: string }[] } | null): void {
    if (!line) return;
    this.container.setVisible(true);
    this.visible = true;
    this.speakerText.setText(line.speaker);
    this.lineText.setText(line.text);
    this.clearChoices();
    if (line.choices) {
      line.choices.forEach((c, i) => {
        const t = this.scene.add.text(40, BOX_Y + 80 + i * 20, `> ${c.text}`, {
          fontSize: '13px',
          color: '#ffff88',
          fontFamily: 'monospace',
        });
        this.container.add(t);
        this.choiceTexts.push(t);
      });
    }
  }

  private clearChoices(): void {
    this.choiceTexts.forEach((t) => t.destroy());
    this.choiceTexts = [];
  }

  private hide(): void {
    this.container.setVisible(false);
    this.visible = false;
    this.clearChoices();
  }

  handleInput(key: string): void {
    if (!this.visible) return;
    if (key === 'interact') {
      this.dialogue.advance();
    } else if (key === 'choice0') {
      this.dialogue.choose(0);
    } else if (key === 'choice1') {
      this.dialogue.choose(1);
    }
  }

  destroy(): void {
    this.container.destroy();
  }
}
