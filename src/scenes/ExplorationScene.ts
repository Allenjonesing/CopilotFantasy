import Phaser from 'phaser';
import { ExplorationSystem } from '../systems/exploration/ExplorationSystem';
import { DialogueSystem } from '../systems/dialogue/DialogueSystem';
import { DialogueUI } from '../ui/DialogueUI';
import { ExplorationUI } from '../ui/ExplorationUI';
import { TouchControls } from '../ui/TouchControls';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';

export class ExplorationScene extends Phaser.Scene {
  private exploration!: ExplorationSystem;
  private dialogue!: DialogueSystem;
  private _dialogueUI!: DialogueUI;
  private explorationUI!: ExplorationUI;
  private touchControls!: TouchControls;
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
    this.dialogue = new DialogueSystem();
    this._dialogueUI = new DialogueUI(this, this.dialogue);
    this.explorationUI = new ExplorationUI(this);
    this.touchControls = new TouchControls(this);
    this.exploration.init();
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
    // Consume one-shot touch flags once per frame.
    const touchInteract = this.touchControls.justDownInteract();
    const touchNavUp = this.touchControls.justDownNavUp();
    const touchNavDown = this.touchControls.justDownNavDown();

    if (this._dialogueUI.visible) {
      if (Phaser.Input.Keyboard.JustDown(this.interactKey) || touchInteract) {
        this._dialogueUI.handleInput('interact');
      } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || touchNavUp) {
        this._dialogueUI.handleInput('up');
      } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || touchNavDown) {
        this._dialogueUI.handleInput('down');
      }
      return;
    }

    this.moveTimer += delta;
    if (this.moveTimer >= this.MOVE_DELAY) {
      const upDown = this.cursors.up.isDown || this.touchControls.up.isDown;
      const downDown = this.cursors.down.isDown || this.touchControls.down.isDown;
      const leftDown = this.cursors.left.isDown || this.touchControls.left.isDown;
      const rightDown = this.cursors.right.isDown || this.touchControls.right.isDown;

      if (upDown) {
        this.exploration.movePlayer(0, -1);
        this.moveTimer = 0;
      } else if (downDown) {
        this.exploration.movePlayer(0, 1);
        this.moveTimer = 0;
      } else if (leftDown) {
        this.exploration.movePlayer(-1, 0);
        this.moveTimer = 0;
      } else if (rightDown) {
        this.exploration.movePlayer(1, 0);
        this.moveTimer = 0;
      }
    }

    if (Phaser.Input.Keyboard.JustDown(this.interactKey) || touchInteract) {
      this.exploration.checkNpcInteraction();
    }

    this.explorationUI.refresh();
  }

  shutdown(): void {
    this.exploration.destroy();
    this._dialogueUI.destroy();
    this.explorationUI.destroy();
    this.touchControls.destroy();
    this.bus.clear();
  }
}
