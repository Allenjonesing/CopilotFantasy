import Phaser from 'phaser';
import { ExplorationSystem } from '../systems/exploration/ExplorationSystem';
import { DialogueSystem } from '../systems/dialogue/DialogueSystem';
import { DialogueUI } from '../ui/DialogueUI';
import { ExplorationUI } from '../ui/ExplorationUI';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';

export class ExplorationScene extends Phaser.Scene {
  private exploration!: ExplorationSystem;
  private dialogue!: DialogueSystem;
  private _dialogueUI!: DialogueUI;
  private explorationUI!: ExplorationUI;
  private bus!: EventBus;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private interactKey!: Phaser.Input.Keyboard.Key;
  private moveTimer = 0;
  private readonly MOVE_DELAY = 180;

  constructor() {
    super({ key: 'ExplorationScene' });
  }

  create(): void {
    this.bus = EventBus.getInstance();
    this.exploration = new ExplorationSystem(this);
    this.exploration.init();
    this.dialogue = new DialogueSystem();
    this._dialogueUI = new DialogueUI(this, this.dialogue);
    this.explorationUI = new ExplorationUI(this);
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.bus.on('combat:start', (enemies) => {
      this.scene.start('CombatScene', { enemies });
    });
    this.bus.on('map:exit', (exitData) => {
      const exit = exitData as { targetMap: string; targetX: number; targetY: number };
      const state = GameState.getInstance();
      state.data.currentMap = exit.targetMap;
      state.data.playerX = exit.targetX;
      state.data.playerY = exit.targetY;
      this.scene.restart();
    });
    this.bus.on('dialogue:start', (id) => {
      this.dialogue.start(id as string);
    });
  }

  update(_time: number, delta: number): void {
    if (this._dialogueUI.visible) {
      if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
        this._dialogueUI.handleInput('interact');
      } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
        this._dialogueUI.handleInput('up');
      } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
        this._dialogueUI.handleInput('down');
      }
      return;
    }

    this.moveTimer += delta;
    if (this.moveTimer >= this.MOVE_DELAY) {
      if (this.cursors.up.isDown) {
        this.exploration.movePlayer(0, -1);
        this.moveTimer = 0;
      } else if (this.cursors.down.isDown) {
        this.exploration.movePlayer(0, 1);
        this.moveTimer = 0;
      } else if (this.cursors.left.isDown) {
        this.exploration.movePlayer(-1, 0);
        this.moveTimer = 0;
      } else if (this.cursors.right.isDown) {
        this.exploration.movePlayer(1, 0);
        this.moveTimer = 0;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.interactKey)) {
      this.exploration.checkNpcInteraction();
    }

    this.explorationUI.refresh();
  }

  shutdown(): void {
    this.exploration.destroy();
    this._dialogueUI.destroy();
    this.explorationUI.destroy();
    this.bus.clear();
  }
}
