import Phaser from 'phaser';
import { CombatSystem, CombatResult, BattleType } from '../systems/combat/CombatSystem';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EnemyCombatant } from '../systems/combat/EnemyCombatant';
import { CombatUI } from '../ui/CombatUI';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';
import { CombatEnemySpec } from '../systems/exploration/ExplorationSystem';

export class CombatScene extends Phaser.Scene {
  private system!: CombatSystem;
  private ui!: CombatUI;
  private bus!: EventBus;
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private backKey!: Phaser.Input.Keyboard.Key;
  private waitingForInput = false;

  private battleType: BattleType = 'normal';

  constructor() {
    super({ key: 'CombatScene' });
  }

  init(data: { enemies?: Array<string | CombatEnemySpec>; difficultyLevel?: number; battleType?: BattleType }): void {
    const enemySpecs = data.enemies ?? ['slime'];
    const baseScale = GameState.getInstance().getEnemyScale();
    const state = GameState.getInstance();
    const players = state.data.party
      .filter((c) => c.alive)
      .map((c) => new PlayerCombatant(c.id));
    const enemies = enemySpecs.map((e) => {
      if (typeof e === 'string') {
        return new EnemyCombatant(e, baseScale);
      }
      return new EnemyCombatant(e.typeId, baseScale * e.variantScale, e.displayName);
    });
    this.system = new CombatSystem(players, enemies);
    this.battleType = data.battleType ?? 'normal';
    if (this.battleType !== 'normal') {
      this.system.applyBattleType(this.battleType);
    }
  }

  create(): void {
    this.bus = EventBus.getInstance();

    // Background (full-screen dark fill; battlefield area created by CombatUI)
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a1a);

    this.ui = new CombatUI(this, this.system, this.battleType);

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
      state.addGold(result.goldGained);
      result.itemsGained.forEach((id) => state.addItem(id));
      // Difficulty only increases when the player reaches the floor exit,
      // NOT on every combat victory.

      this.scene.start('VictoryScene', {
        expGained: result.expGained,
        goldGained: result.goldGained,
        itemsGained: result.itemsGained,
        leveledUp: levelResult.leveledUp,
        newLevel: levelResult.newLevel,
        skillsGained: levelResult.skillsGained,
        scoreGained,
        totalScore: state.data.score,
        difficultyLevel: state.data.difficultyLevel,
      });
    } else {
      // Fled: preCombatX/Y was set when combat started, so ExplorationScene
      // will restore the player to their pre-battle position automatically.
      this.scene.start('ExplorationScene');
    }
  }

  shutdown(): void {
    this.ui.destroy();
    this.bus.clear();
  }
}
