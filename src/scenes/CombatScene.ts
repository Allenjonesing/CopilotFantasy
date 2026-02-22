import Phaser from 'phaser';
import { CombatSystem } from '../systems/combat/CombatSystem';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EnemyCombatant } from '../systems/combat/EnemyCombatant';
import { CombatUI } from '../ui/CombatUI';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';

export class CombatScene extends Phaser.Scene {
  private system!: CombatSystem;
  private ui!: CombatUI;
  private bus!: EventBus;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private backKey!: Phaser.Input.Keyboard.Key;
  private waitingForInput = false;

  constructor() {
    super({ key: 'CombatScene' });
  }

  init(data: { enemies?: string[] }): void {
    const enemyIds = data.enemies ?? ['slime'];
    const state = GameState.getInstance();
    const players = state.data.party
      .filter((c) => c.alive)
      .map((c) => new PlayerCombatant(c.id));
    const enemies = enemyIds.map((id) => new EnemyCombatant(id));
    this.system = new CombatSystem(players, enemies);
  }

  create(): void {
    this.bus = EventBus.getInstance();

    // Background
    this.add.rectangle(400, 300, 800, 600, 0x0a0a1a);
    this.add.rectangle(400, 150, 800, 220, 0x1a1a2e);

    this.ui = new CombatUI(this, this.system);

    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.backKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    this.bus.on('combat:fled', () => this.endCombat('fled'));

    // Defer the first turn until after the first render frame so Phaser's
    // WebGL text objects are fully initialised before any setText calls.
    this.time.delayedCall(50, () => this.advanceTurn());
  }

  private advanceTurn(): void {
    const result = this.system.checkResult();
    if (result) {
      if (result.victory) {
        this.endCombat('victory');
      } else if (result.defeat) {
        this.scene.start('GameOverScene');
      }
      return;
    }

    const actor = this.system.nextTurn();
    const isPlayer = this.system.players.includes(actor as PlayerCombatant);
    if (isPlayer) {
      this.waitingForInput = true;
    } else {
      // Enemy AI: always attack first living player
      const target = this.system.players.find((p) => !p.isDefeated);
      if (target) {
        this.system.executeAction(actor, { type: 'attack', target });
      }
      this.time.delayedCall(600, () => this.advanceTurn());
    }
  }

  update(): void {
    if (!this.waitingForInput) return;
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.ui.navigateMenu('up');
    } else if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      this.ui.navigateMenu('down');
    } else if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
      this.ui.backMenu();
    } else if (Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
      const action = this.ui.confirmAction();
      if (action && this.system.currentActor) {
        this.waitingForInput = false;
        this.system.executeAction(this.system.currentActor, action);
        this.time.delayedCall(400, () => this.advanceTurn());
      }
    }
  }

  private endCombat(_reason: string): void {
    this.scene.start('ExplorationScene');
  }

  shutdown(): void {
    this.ui.destroy();
    this.bus.clear();
  }
}
