import Phaser from 'phaser';
import { ExplorationSystem } from '../systems/exploration/ExplorationSystem';
import { ExplorationUI } from '../ui/ExplorationUI';
import { TouchControls } from '../ui/TouchControls';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';
import itemsData from '../data/items.json';

export class ExplorationScene extends Phaser.Scene {
  private exploration!: ExplorationSystem;
  private explorationUI!: ExplorationUI;
  private touchControls!: TouchControls;
  private bus!: EventBus;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private moveTimer = 0;
  private readonly MOVE_DELAY = 160;
  /** Guard flag: true once the floor-exit event has fired so we don't call
   *  increaseDifficulty() a second time before the scene restart completes. */
  private exitTriggered = false;

  constructor() {
    super({ key: 'ExplorationScene' });
  }

  create(): void {
    this.bus = EventBus.getInstance();

    // Restore player to pre-combat position if returning from a mid-floor
    // battle; otherwise reset to spawn for a fresh floor.
    const state = GameState.getInstance();
    if (state.data.preCombatX !== null && state.data.preCombatY !== null) {
      state.data.playerX = state.data.preCombatX;
      state.data.playerY = state.data.preCombatY;
      state.data.preCombatX = null;
      state.data.preCombatY = null;
    } else {
      state.data.playerX = 2;
      state.data.playerY = 2;
    }

    this.exploration = new ExplorationSystem(this);
    this.explorationUI = new ExplorationUI(this);
    this.touchControls = new TouchControls(this);
    this.exploration.init();
    this.cursors = this.input.keyboard!.createCursorKeys();

    this.exitTriggered = false;

    this.bus.on('combat:start', (data) => {
      const d = data as { enemies: string[]; difficultyLevel: number; battleType?: string };
      this.scene.start('CombatScene', d);
    });

    this.bus.on('shop:open', (data) => {
      this.scene.start('ShopScene', data as object);
    });

    this.bus.on('pickup:collected', (data) => {
      const d = data as { kind: string; gold: number; itemId?: string };
      let msg: string;
      if (d.itemId) {
        const itemDef = itemsData.items.find((it) => it.id === d.itemId);
        const itemName = itemDef ? itemDef.name : d.itemId;
        msg = `Found ${d.gold} Gold + ${itemName}!`;
      } else {
        msg = `Collected ${d.gold} Gold!`;
      }
      this.explorationUI.showPickupMessage(msg);
    });

    this.bus.on('map:exit', () => {
      // Guard prevents multiple difficulty increments if the event somehow fires
      // more than once before the scene restart completes.
      if (this.exitTriggered) return;
      this.exitTriggered = true;
      // Advance to next floor.
      GameState.getInstance().increaseDifficulty();
      this.scene.restart();
    });
  }

  update(_time: number, delta: number): void {
    this.exploration.updateEnemies(delta);
    this.explorationUI.updatePickupMsg(delta);

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

    this.explorationUI.refresh();
  }

  shutdown(): void {
    this.exploration.destroy();
    this.explorationUI.destroy();
    this.touchControls.destroy();
    this.bus.clear();
  }
}
