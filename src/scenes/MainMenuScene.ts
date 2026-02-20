import Phaser from 'phaser';

export class MainMenuScene extends Phaser.Scene {
  private startKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 3, 'CopilotFantasy', {
      fontSize: '48px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, 'Press ENTER to start', {
      fontSize: '20px',
      color: '#aaaaff',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.8, 'A CTB JRPG built with Phaser 3 + TypeScript', {
      fontSize: '12px',
      color: '#666688',
      fontFamily: 'monospace',
    }).setOrigin(0.5);

    this.startKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.startKey)) {
      this.scene.start('ExplorationScene');
    }
  }
}
