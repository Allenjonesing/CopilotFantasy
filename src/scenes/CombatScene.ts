import Phaser from 'phaser';
import { CombatSystem, CombatResult, BattleType } from '../systems/combat/CombatSystem';
import { CombatEntity } from '../systems/combat/CombatEntity';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EnemyCombatant } from '../systems/combat/EnemyCombatant';
import { CombatUI } from '../ui/CombatUI';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';
import { AccomplishmentSystem } from '../core/state/AccomplishmentSystem';
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
  private isBossBattle = false;

  /** Stored reference so we can unregister the flee listener precisely in shutdown(). */
  private onFled = () => {};

  constructor() {
    super({ key: 'CombatScene' });
  }

  init(data: {
    enemies?: Array<string | CombatEnemySpec>;
    difficultyLevel?: number;
    battleType?: BattleType;
    /** True when resuming an autosaved mid-battle state. */
    isResume?: boolean;
  }): void {
    const enemySpecs = data.enemies ?? ['slime'];
    const baseScale = GameState.getInstance().getEnemyScale();
    const state = GameState.getInstance();
    const currentFloor = state.data.difficultyLevel;
    const players = state.data.party
      .filter((c) => c.alive)
      .map((c) => new PlayerCombatant(c.id));
    const enemies = enemySpecs.map((e) => {
      if (typeof e === 'string') {
        return new EnemyCombatant(e, baseScale, undefined, currentFloor);
      }
      return new EnemyCombatant(e.typeId, baseScale * e.variantScale, e.displayName, currentFloor);
    });

    // When resuming from an autosave, restore the saved enemy HP/MP so the
    // battle continues at the exact state it was in when the game was closed.
    if (data.isResume && state.data.pendingBattle) {
      const saved = state.data.pendingBattle;
      enemies.forEach((e, i) => {
        if (saved.enemyHp[i] !== undefined) {
          e.stats.hp = saved.enemyHp[i];
        }
        if (saved.enemyMp[i] !== undefined) {
          e.stats.mp = saved.enemyMp[i];
        }
      });
    }

    this.system = new CombatSystem(players, enemies);
    this.battleType = data.battleType ?? 'normal';
    this.isBossBattle = enemySpecs.some(
      (e) => typeof e !== 'string' && (e as CombatEnemySpec).isBoss === true,
    );
    // On a fresh battle apply any turn-order advantage; on a resume the
    // saved CTB values already encode the original advantage so we skip this.
    if (!data.isResume && this.battleType !== 'normal') {
      this.system.applyBattleType(this.battleType);
    }

    // Restore CTB values and status effects after the CombatSystem (and its
    // CTBTimeline) has been created so we overwrite the freshly-calculated
    // agility-based values with the exact values from the save.
    if (data.isResume && state.data.pendingBattle) {
      const saved = state.data.pendingBattle;
      if (saved.enemyCtb) {
        enemies.forEach((e, i) => {
          if (saved.enemyCtb![i] !== undefined) e.ctbValue = saved.enemyCtb![i];
        });
      }
      if (saved.playerCtb) {
        players.forEach((p, i) => {
          if (saved.playerCtb![i] !== undefined) p.ctbValue = saved.playerCtb![i];
        });
      }
      if (saved.enemyStatuses) {
        this.system.restoreEntityStatuses(
          enemies,
          saved.enemyStatuses,
          saved.enemyStatusDurations ?? [],
        );
      }
      if (saved.playerStatuses) {
        this.system.restoreEntityStatuses(
          players,
          saved.playerStatuses,
          saved.playerStatusDurations ?? [],
        );
      }
    }

    // Persist battle state so the game can resume if closed mid-fight.
    // On a fresh battle this overwrites any stale pendingBattle; on a resume
    // it refreshes with the current (already-restored) values.
    state.data.pendingBattle = {
      enemies: enemySpecs.map((e) =>
        typeof e === 'string'
          ? { typeId: e, displayName: e, variantScale: 1.0 }
          : { typeId: e.typeId, displayName: e.displayName, variantScale: e.variantScale, isBoss: e.isBoss },
      ),
      battleType: this.battleType,
      difficultyLevel: currentFloor,
      enemyHp: enemies.map((e) => e.stats.hp),
      enemyMp: enemies.map((e) => e.stats.mp),
      enemyCtb: enemies.map((e) => e.ctbValue),
      enemyStatuses: enemies.map((e) => [...e.statusEffects]),
      enemyStatusDurations: enemies.map((e) => this.system.getStatusDurationsFor(e)),
      playerCtb: players.map((p) => p.ctbValue),
      playerStatuses: players.map((p) => [...p.statusEffects]),
      playerStatusDurations: players.map((p) => this.system.getStatusDurationsFor(p)),
    };
    state.saveGame();
  }

  create(): void {
    this.bus = EventBus.getInstance();

    // Background (full-screen dark fill; battlefield area created by CombatUI)
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a1a);

    this.ui = new CombatUI(this, this.system, this.battleType, this.isBossBattle);

    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.backKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    // Touch / mouse: tapping a menu item selects and confirms it.
    this.ui.onMenuTap = () => {
      if (!this.waitingForInput) return;
      const action = this.ui.confirmAction();
      if (action && this.system.currentActor) {
        const consumed = this.system.executeAction(this.system.currentActor, action);
        if (consumed) {
          this.waitingForInput = false;
          this.time.delayedCall(400, () => this.advanceTurn());
        }
      }
    };

    this.onFled = () => this.endCombat('fled', null);
    this.bus.on('combat:fled', this.onFled);

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
        // Clear pending battle — a defeat ends the run; don't resume it.
        const state = GameState.getInstance();
        state.data.pendingBattle = null;
        state.saveGame();
        this.scene.start('GameOverScene');
      }
      return;
    }

    const actor = this.system.nextTurn();
    const isPlayer = this.system.players.includes(actor as PlayerCombatant);
    if (isPlayer) {
      // Autosave at the start of every player turn so a forced close can be
      // resumed with up-to-date HP values for both party and enemies.
      this.saveBattleState();
      this.waitingForInput = true;
    } else {
      this.performEnemyAction(actor);
      this.time.delayedCall(1100, () => this.advanceTurn());
    }
  }

  /** Intelligent enemy AI: uses elemental skills, self-heals, and targets smartest choice. */
  private performEnemyAction(actor: CombatEntity): void {
    const enemy = actor as EnemyCombatant;
    const livingPlayers = this.system.players.filter((p) => !p.isDefeated);
    if (livingPlayers.length === 0) return;

    // ── Self-heal check ──────────────────────────────────────────────────────
    // If enemy can self-heal and is below 35% HP, use heal skill
    const hpRatio = actor.stats.hp / actor.stats.maxHp;
    if (hpRatio < 0.35 && actor.skills.includes('enemyCure') && actor.stats.mp >= 20) {
      this.system.executeAction(actor, { type: 'skill', skillId: 'enemyCure', target: actor });
      return;
    }

    // ── Choose target ────────────────────────────────────────────────────────
    // 50% chance to target the player with the highest max HP (perceived threat),
    // 50% chance to target randomly.
    let target: PlayerCombatant;
    if (Math.random() < 0.5) {
      target = livingPlayers.reduce((best, p) =>
        p.stats.maxHp > best.stats.maxHp ? p : best,
      );
    } else {
      target = livingPlayers[Math.floor(Math.random() * livingPlayers.length)];
    }

    // ── Choose action ─────────────────────────────────────────────────────────
    // Elemental enemies prefer their element spell (~60% chance if MP available).
    // Otherwise choose randomly from available non-elemental offensive skills or basic attack.
    const elementalSkillIds: Record<string, string[]> = {
      fire: ['firaga', 'fira', 'fire'],
      ice: ['blizzaga', 'blizzara', 'blizzard'],
      lightning: ['thundaga', 'thundara', 'thunder'],
      water: ['waterga', 'watera', 'water'],
    };

    // All known elemental spell IDs (across all elements)
    const allElementalSkillIds = new Set(Object.values(elementalSkillIds).flat());

    const enemyElement = enemy.element;
    if (enemyElement && Math.random() < 0.60) {
      // Try to cast the highest-tier elemental spell the enemy knows that it can afford
      const preferredIds = elementalSkillIds[enemyElement] ?? [];
      for (const sid of preferredIds) {
        if (actor.skills.includes(sid)) {
          const consumed = this.system.executeAction(actor, { type: 'skill', skillId: sid, target });
          if (consumed) return;
        }
      }
    }

    // Try any random offensive skill (not enemyCure/attack/drain) with 35% chance.
    // For elemental enemies, skip any elemental spell that doesn't match their element
    // to avoid the enemy using the wrong element.
    const offensiveSkills = actor.skills.filter((s) => {
      if (s === 'attack' || s === 'enemyCure' || s === 'drain') return false;
      if (allElementalSkillIds.has(s) && enemyElement) {
        // Only keep elemental spells that match the enemy's own element
        return (elementalSkillIds[enemyElement] ?? []).includes(s);
      }
      return true; // non-elemental offensive skills (smash, etc.) are always allowed
    });
    if (offensiveSkills.length > 0 && Math.random() < 0.35) {
      const pick = offensiveSkills[Math.floor(Math.random() * offensiveSkills.length)];
      const consumed = this.system.executeAction(actor, { type: 'skill', skillId: pick, target });
      if (consumed) return;
    }

    // Fallback: basic attack
    this.system.executeAction(actor, { type: 'attack', target });
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
        const consumed = this.system.executeAction(this.system.currentActor, action);
        if (consumed) {
          this.waitingForInput = false;
          this.time.delayedCall(400, () => this.advanceTurn());
        }
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

  /**
   * Sync current HP/MP to GameState and update the pendingBattle enemy
   * snapshot, then write everything to localStorage.  Called at the start of
   * every player turn so a forced close can always be resumed mid-fight with
   * the exact turn order and status effects preserved.
   */
  private saveBattleState(): void {
    this.syncHpToState();
    const state = GameState.getInstance();
    if (state.data.pendingBattle) {
      const pb = state.data.pendingBattle;
      pb.enemyHp = this.system.enemies.map((e) => e.stats.hp);
      pb.enemyMp = this.system.enemies.map((e) => e.stats.mp);
      pb.enemyCtb = this.system.enemies.map((e) => e.ctbValue);
      pb.enemyStatuses = this.system.enemies.map((e) => [...e.statusEffects]);
      pb.enemyStatusDurations = this.system.enemies.map((e) => this.system.getStatusDurationsFor(e));
      pb.playerCtb = this.system.players.map((p) => p.ctbValue);
      pb.playerStatuses = this.system.players.map((p) => [...p.statusEffects]);
      pb.playerStatusDurations = this.system.players.map((p) => this.system.getStatusDurationsFor(p));
    }
    state.saveGame();
  }

  /**
   * After any battle ends (victory or flee), revive all KO'd party members
   * with 1 HP so the team stays together. Keeps dead party members from
   * being silently dropped from the roster between battles.
   */
  private reviveDeadPartyMembers(): void {
    const state = GameState.getInstance();
    state.data.party.forEach((c) => {
      if (!c.alive) {
        c.stats.hp = 1;
        c.alive = true;
      }
    });
  }

  private endCombat(reason: string, result: CombatResult | null): void {
    this.syncHpToState();
    // After every battle, bring back KO'd allies so no one is silently dropped,
    // then fully restore the whole party to 100% HP/MP ready for the next fight.
    this.reviveDeadPartyMembers();
    GameState.getInstance().fullHealParty();

    // Battle is over — clear the mid-battle autosave so the game doesn't try
    // to resume a finished fight on next load.
    GameState.getInstance().data.pendingBattle = null;

    if (reason === 'victory' && result) {
      const state = GameState.getInstance();
      const accomplishments = AccomplishmentSystem.getInstance();
      const scoreMultiplier = state.data.difficultyLevel;
      const scoreGained = result.expGained * scoreMultiplier;
      state.addScore(scoreGained);
      const levelResult = state.gainExp(result.expGained);
      state.addGold(result.goldGained);
      result.itemsGained.forEach((id) => state.addItem(id));

      // ── Accomplishment tracking ──────────────────────────────────────────
      const enemiesDefeated = this.system.enemies.filter((e) => e.isDefeated).length;
      for (let i = 0; i < enemiesDefeated; i++) accomplishments.recordKill();
      accomplishments.recordBattleWin();
      if (levelResult.leveledUp) accomplishments.recordLevel(levelResult.newLevel);
      accomplishments.recordScore(state.data.score);
      if (this.isBossBattle) accomplishments.recordBossKill();

      GameState.getInstance().saveGame();
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
      GameState.getInstance().saveGame();
      this.scene.start('ExplorationScene');
    }
  }

  shutdown(): void {
    this.bus.off('combat:fled', this.onFled);
    this.ui.destroy();
  }
}
