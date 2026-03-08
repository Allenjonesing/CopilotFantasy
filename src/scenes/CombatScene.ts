import Phaser from 'phaser';
import { CombatSystem, CombatResult } from '../systems/combat/CombatSystem';
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

  init(data: { enemies?: string[]; difficultyLevel?: number }): void {
    const enemyIds = data.enemies ?? ['slime'];
    const difficultyScale = GameState.getInstance().getEnemyScale();
    const state = GameState.getInstance();
    const players = state.data.party
      .filter((c) => c.alive)
      .map((c) => new PlayerCombatant(c.id));
    const enemies = enemyIds.map((id) => new EnemyCombatant(id, difficultyScale));
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

    // Touch / mouse: tapping a menu item selects and confirms it.
    this.ui.onMenuTap = () => {
      if (!this.waitingForInput) return;
      const action = this.ui.confirmAction();
      if (action && this.system.currentActor) {
        this.waitingForInput = false;
        this.system.executeAction(this.system.currentActor, action);
        this.time.delayedCall(400, () => this.advanceTurn());
      }
    };

    this.bus.on('combat:fled', () => this.endCombat('fled', null));

    // Defer the first turn until after the first render frame.
    this.time.delayedCall(50, () => this.advanceTurn());
  }

  private advanceTurn(): void {
    const result = this.system.checkResult();
    if (result) {
      if (result.victory) {
        this.endCombat('victory', result);
      } else if (result.defeat) {
        this.syncHpToState();
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

  /** Write HP/MP/alive back from combat entities into GameState. */
  private syncHpToState(): void {
    const state = GameState.getInstance();
    this.system.players.forEach((player) => {
      const charState = state.getCharacter(player.id);
      if (charState) {
        charState.stats.hp = player.stats.hp;
        charState.stats.mp = player.stats.mp;
        charState.alive = !player.isDefeated;
      }
    });
  }

  private endCombat(reason: string, result: CombatResult | null): void {
    this.syncHpToState();

    if (reason === 'victory' && result) {
      const state = GameState.getInstance();
      const scoreMultiplier = state.data.difficultyLevel;
      const scoreGained = result.expGained * scoreMultiplier;
      state.addScore(scoreGained);
      const levelResult = state.gainExp(result.expGained);
      state.addGil(result.gilGained);
      result.itemsGained.forEach((id) => state.addItem(id));
      state.increaseDifficulty();

      this.scene.start('VictoryScene', {
        expGained: result.expGained,
        gilGained: result.gilGained,
        itemsGained: result.itemsGained,
        leveledUp: levelResult.leveledUp,
        newLevel: levelResult.newLevel,
        scoreGained,
        totalScore: state.data.score,
        difficultyLevel: state.data.difficultyLevel,
      });
    } else {
      // Fled: return to exploration with the same difficulty.
      this.scene.start('ExplorationScene');
    }
  }

  shutdown(): void {
    this.ui.destroy();
    this.bus.clear();
  }
}
