import { CombatEntity } from './CombatEntity';
import { PlayerCombatant } from './PlayerCombatant';
import { EnemyCombatant } from './EnemyCombatant';
import { CTBTimeline } from './CTBTimeline';
import { StatusEffectSystem } from './StatusEffectSystem';
import { EventBus } from '../../core/events/EventBus';
import { GameState } from '../../core/state/GameState';
import skillsData from '../../data/skills.json';
import itemsData from '../../data/items.json';

export type ActionType = 'attack' | 'skill' | 'item' | 'defend' | 'flee' | 'rest' | 'reload' | 'team-move';

/** Extended skill definition that includes the optional speed modifier field. */
interface SkillWithSpeed {
  speedModifier?: number;
}

export interface CombatAction {
  type: ActionType;
  skillId?: string;
  itemId?: string;
  target?: CombatEntity;
  /** For team-move: the entity ID of the ally who will execute the combo on their next turn. */
  allyId?: string;
  /** For team-move: the ID of the team move skill being initiated. */
  teamMoveId?: string;
}

export type BattleType = 'normal' | 'preemptive' | 'ambush';

export interface CombatResult {
  victory: boolean;
  defeat: boolean;
  fled: boolean;
  expGained: number;
  goldGained: number;
  itemsGained: string[];
}

export class CombatSystem {
  players: PlayerCombatant[];
  enemies: EnemyCombatant[];
  private timeline: CTBTimeline;
  private statusSystem: StatusEffectSystem;
  private bus: EventBus;
  currentActor: CombatEntity | null = null;
  log: string[] = [];

  /**
   * Pending team-move combos keyed by the co-op ally's entity ID.
   * When an ally's turn arrives with an entry here, the combo is auto-executed.
   */
  private pendingCombos: Map<string, { initiatorId: string; targetId: string; teamMoveId?: string }> = new Map();

  constructor(players: PlayerCombatant[], enemies: EnemyCombatant[]) {
    this.players = players;
    this.enemies = enemies;
    this.timeline = new CTBTimeline([...players, ...enemies]);
    this.statusSystem = new StatusEffectSystem();
    this.bus = EventBus.getInstance();
  }

  /** Apply battle-type advantages (preemptive/ambush) by adjusting CTB values.
   *  The advantaged side goes first, but each side only gets one full round of
   *  turns before the other side acts — no infinite chains of consecutive turns.
   */
  applyBattleType(type: BattleType): void {
    if (type === 'preemptive') {
      // Players act first: push every enemy's CTB just past the slowest player.
      const maxPlayerCtb = Math.max(...this.players.map((p) => p.ctbValue));
      this.enemies.forEach((e) => { e.ctbValue = maxPlayerCtb + 1; });
    } else if (type === 'ambush') {
      // Enemies act first: push every player's CTB just past the slowest enemy.
      const maxEnemyCtb = Math.max(...this.enemies.map((e) => e.ctbValue));
      this.players.forEach((p) => { p.ctbValue = maxEnemyCtb + 1; });
    }
  }

  /** Advance to the next actor's turn. */
  nextTurn(): CombatEntity {
    this.currentActor = this.timeline.next();
    this.bus.emit('combat:turnStart', this.currentActor);
    return this.currentActor;
  }

  /**
   * Return the remaining turn-durations for all active status effects on an entity.
   * Used by CombatScene when autosaving mid-battle state.
   */
  getStatusDurationsFor(entity: CombatEntity): Record<string, number> {
    return this.statusSystem.getDurations(entity.id);
  }

  /**
   * Restore saved status effects and their remaining durations onto a set of entities.
   * Used by CombatScene when resuming a mid-battle autosave.
   */
  restoreEntityStatuses(
    entities: CombatEntity[],
    statusLists: string[][],
    durationLists: Record<string, number>[],
  ): void {
    entities.forEach((entity, i) => {
      const statuses = statusLists[i] ?? [];
      const durations = durationLists[i] ?? {};
      statuses.forEach((effectId) => {
        this.statusSystem.restoreStatus(entity, effectId, durations[effectId] ?? 1);
      });
    });
  }

  /** Execute an action for the current actor. Returns true if the turn was consumed, false if not (e.g. insufficient MP). */
  executeAction(actor: CombatEntity, action: CombatAction): boolean {
    let turnConsumed = true;
    switch (action.type) {
      case 'attack':
        this.physicalAttack(actor, action.target!);
        break;
      case 'skill':
        turnConsumed = this.useSkill(actor, action.skillId!, action.target ?? null);
        break;
      case 'item':
        this.useItem(actor, action.itemId!, action.target ?? null);
        break;
      case 'defend': {
        // Defensive stance: restore 25% STM (half of Rest's 50%) and reduce incoming damage.
        if (actor.stats.maxStm > 0) {
          const stmRestore = Math.ceil(actor.stats.maxStm * CombatSystem.DEFEND_STM_RESTORE);
          actor.restoreStm(stmRestore);
          this.addLog(`${actor.name} takes a defensive stance, recovering ${stmRestore} Stamina.`);
          this.bus.emit('combat:stmChange', actor);
        } else {
          this.addLog(`${actor.name} takes a defensive stance.`);
        }
        break;
      }
      case 'rest': {
        // Restore 50% of max STM; skip if actor has no STM (enemies)
        if (actor.stats.maxStm > 0) {
          const stmRestore = Math.ceil(actor.stats.maxStm / 2);
          actor.restoreStm(stmRestore);
          this.addLog(`${actor.name} rests and recovers ${stmRestore} Stamina.`);
          this.bus.emit('combat:stmChange', actor);
        }
        break;
      }
      case 'reload': {
        // Forced reload after firing flintlock — remove reloading status
        actor.removeStatus('reloading');
        this.statusSystem.remove(actor, 'reloading');
        this.addLog(`${actor.name} reloads the flintlock and is ready to fire again.`);
        this.bus.emit('status:removed', actor, 'reloading');
        break;
      }
      case 'team-move': {
        // Initiator calls out a co-op ally and a target.
        // The ally will auto-execute the combo on their next turn.
        const ally = this.players.find((p) => p.id === action.allyId);
        const comboTarget = action.target;
        // Validate that both the initiator and the chosen ally have enough stamina.
        const initiatorHasStm = actor.stats.maxStm === 0 || actor.stats.stm >= CombatSystem.TEAM_MOVE_STM_COST;
        const allyHasStm = ally ? (ally.stats.maxStm === 0 || ally.stats.stm >= CombatSystem.TEAM_MOVE_STM_COST) : false;
        // Validate that the ally has enough MP for the chosen team move.
        const teamMoveDef = action.teamMoveId
          ? (skillsData.skills.find((s) => s.id === action.teamMoveId) as { mpCost?: number } | undefined)
          : null;
        const teamMoveMpCost = teamMoveDef?.mpCost ?? 0;
        const allyHasMp = ally ? ally.stats.mp >= teamMoveMpCost : false;
        if (ally && comboTarget && !ally.isDefeated && !comboTarget.isDefeated && initiatorHasStm && allyHasStm && allyHasMp) {
          // Drain massive stamina from the initiator
          if (actor.stats.maxStm > 0) {
            actor.consumeStm(CombatSystem.TEAM_MOVE_STM_COST);
            this.bus.emit('combat:stmChange', actor);
          }
          this.pendingCombos.set(ally.id, { initiatorId: actor.id, targetId: comboTarget.id, teamMoveId: action.teamMoveId });
          this.addLog(`${actor.name} calls out to ${ally.name}: "Together!" — combo incoming!`);
          this.bus.emit('combat:teamMoveInitiated', actor, ally, comboTarget);
        } else if (!initiatorHasStm) {
          this.addLog(`${actor.name} doesn't have enough Stamina to initiate a Team Move!`);
          turnConsumed = false;
        } else if (ally && !allyHasStm) {
          this.addLog(`${ally.name} doesn't have enough Stamina to execute the Team Move!`);
          turnConsumed = false;
        } else if (ally && !allyHasMp) {
          const moveName = action.teamMoveId
            ? (skillsData.skills.find((s) => s.id === action.teamMoveId)?.name ?? 'the Team Move')
            : 'the Team Move';
          this.addLog(`${ally.name} doesn't have enough MP to execute ${moveName}!`);
          turnConsumed = false;
        } else {
          this.addLog(`${actor.name} tried to set up a team move but it failed.`);
          turnConsumed = false;
        }
        break;
      }
      case 'flee':
        this.bus.emit('combat:fled');
        break;
    }
    if (turnConsumed) {
      // Resolve the speed modifier for this action so fast moves advance the
      // actor's next turn and slow (powerful) moves push it back.
      const speedModifier = this.resolveSpeedModifier(action);
      const beforeOrder = this.timeline.preview(10);
      this.timeline.endTurn(actor, speedModifier);
      const afterOrder = this.timeline.preview(10);
      // Emit timeline shift so the UI can animate the rearrangement.
      this.bus.emit('combat:timelineShift', actor, beforeOrder, afterOrder, speedModifier);
      this.bus.emit('combat:actionEnd', actor);
      // Process end-of-turn status effects (DoT, duration ticks) AFTER the actor has acted.
      this.statusSystem.processTurn(actor);
      this.checkDefeated(actor);
    }
    return turnConsumed;
  }

  /** Speed modifier applied when the actor defends: acts sooner on their next turn. */
  static readonly DEFEND_SPEED_MODIFIER = 0.5;
  /** STM cost for using an item (small effort to reach for a potion in the heat of battle). */
  static readonly ITEM_STM_COST = 5;
  /** Fraction of max STM restored by taking a defensive stance (half of Rest's restore). */
  static readonly DEFEND_STM_RESTORE = 0.25;
  /** Speed penalty applied to the team-move initiator (slow — calling for help takes time). */
  static readonly TEAM_MOVE_INITIATOR_SPEED = 1.6;
  /** Speed penalty applied to BOTH participants after the combo executes (exhausted). */
  static readonly TEAM_MOVE_COMBO_SPEED = 2.5;
  /** STM cost for initiating or executing a team move (massive expenditure of effort). */
  static readonly TEAM_MOVE_STM_COST = 40;

  /** Determine the CTB speed modifier for the given action.
   *  Reads `speedModifier` from the skill definition when available;
   *  defending/resting are fast actions; basic attacks default to 1.0 (no change). */
  private resolveSpeedModifier(action: CombatAction): number {
    if (action.type === 'defend') {
      return CombatSystem.DEFEND_SPEED_MODIFIER;
    }
    if (action.type === 'rest') {
      return 1.0;
    }
    if (action.type === 'reload') {
      // Reload is slower — uses skill def speedModifier from skills.json
      const reloadSkill = skillsData.skills.find((s) => s.id === 'reload') as (typeof skillsData.skills)[0] & SkillWithSpeed | undefined;
      return reloadSkill?.speedModifier ?? 1.3;
    }
    if (action.type === 'team-move') {
      if (action.teamMoveId) {
        const moveDef = skillsData.skills.find((s) => s.id === action.teamMoveId) as (typeof skillsData.skills)[0] & SkillWithSpeed | undefined;
        return moveDef?.speedModifier ?? CombatSystem.TEAM_MOVE_INITIATOR_SPEED;
      }
      return CombatSystem.TEAM_MOVE_INITIATOR_SPEED;
    }
    if (action.type === 'skill' && action.skillId) {
      const skill = skillsData.skills.find((s) => s.id === action.skillId) as (typeof skillsData.skills)[0] & SkillWithSpeed | undefined;
      return skill?.speedModifier ?? 1.0;
    }
    return 1.0;
  }

  /** STM cost for a basic Attack action. */
  static readonly ATTACK_STM_COST = 15;
  /** Probability that a physical attack successfully hits. Magic always hits (1.0). */
  static readonly PHYSICAL_HIT_CHANCE = 0.75;

  private physicalAttack(actor: CombatEntity, target: CombatEntity): void {
    this.bus.emit('combat:attackStart', actor, target);
    // Drain stamina (only for entities that have stamina — players)
    if (actor.stats.maxStm > 0) {
      actor.consumeStm(CombatSystem.ATTACK_STM_COST);
      this.bus.emit('combat:stmChange', actor);
    }
    // Physical attacks have a 75% chance to hit.
    if (Math.random() >= CombatSystem.PHYSICAL_HIT_CHANCE) {
      this.addLog(`${actor.name} attacks ${target.name} but misses!`);
      this.bus.emit('combat:miss', actor, target);
      return;
    }
    const raw = actor.stats.strength * 2;
    const dmg = Math.max(1, Math.floor(raw - target.effectiveDefense()));
    target.applyDamage(dmg);
    this.addLog(`${actor.name} attacks ${target.name} for ${dmg} damage.`);
    this.bus.emit('combat:damage', target, dmg);
    this.checkDefeated(target);
  }

  private useSkill(actor: CombatEntity, skillId: string, target: CombatEntity | null): boolean {
    const skill = skillsData.skills.find((s) => s.id === skillId);
    if (!skill) {
      this.addLog(`${actor.name} tried to use an unknown skill!`);
      return false;
    }

    // Extended skill fields
    const skillExt = skill as typeof skill & {
      stmCost?: number;
      pierce?: boolean;
      requiresAmmo?: string;
      selfStatus?: string;
      applyStatus?: string;
      evolvesTo?: string;
      evolvesAtUse?: number;
    };

    // Check ammo requirement
    if (skillExt.requiresAmmo) {
      const state = GameState.getInstance();
      if (!state.removeItem(skillExt.requiresAmmo)) {
        this.addLog(`${actor.name} has no ${skillExt.requiresAmmo === 'gunAmmo' ? 'Flintlock Ammo' : 'Arrows'}!`);
        return false;
      }
    }

    // Check stamina
    const stmCost = skillExt.stmCost ?? 0;
    if (actor.stats.maxStm > 0 && stmCost > 0 && actor.stats.stm < stmCost) {
      this.addLog(`${actor.name} is too exhausted! Not enough Stamina.`);
      return false;
    }

    // Enemies with signature skills cast them for free (0 MP cost), so they can
    // spam their elemental or status-inflicting moves without running out of MP.
    const isSignatureSkill = (actor instanceof EnemyCombatant)
      && actor.signatureSkills.includes(skillId);

    if (!isSignatureSkill && !actor.consumeMp(skill.mpCost)) {
      this.addLog(`${actor.name} doesn't have enough MP!`);
      // Refund ammo if we already consumed it
      if (skillExt.requiresAmmo) {
        GameState.getInstance().addItem(skillExt.requiresAmmo, 1);
      }
      return false;
    }
    if (!isSignatureSkill) {
      this.bus.emit('combat:mpChange', actor);
    }

    // Drain stamina
    if (actor.stats.maxStm > 0 && stmCost > 0) {
      actor.consumeStm(stmCost);
      this.bus.emit('combat:stmChange', actor);
    }

    // Resolve targets first so the primary target can be included in the spell animation.
    const targets = this.resolveTargets(actor, skill.target, target);
    const skillElement = (skill as { element?: string }).element ?? null;
    // For status-apply skills (e.g. Venom Strike), use the statusEffect id as the animation
    // element so the animation can use a distinctive colour and shape for that effect.
    const animElement = skillElement ?? (skill as { statusEffect?: string }).statusEffect ?? skill.type;
    // For AoE skills (multiple targets), use null animTarget so the AoE fallback
    // animation (expanding rings at caster) plays instead of a misleading
    // single-target projectile.  For single-target skills, point at the target.
    const animTarget = targets.length === 1 ? targets[0] : null;
    if (skill.type === 'magic' || skill.type === 'heal' || skill.type === 'revive' || skill.type === 'status_apply' || skill.type === 'hybrid') {
      this.bus.emit('combat:spellStart', actor, animTarget, animElement, skill.name);
    }
    // Physical/hybrid skills use an attack-move animation; only fire it for single-target
    // skills to avoid the misleading visual of moving toward one enemy while all
    // enemies take damage (e.g. Ground Slam).
    if ((skill.type === 'physical' || skill.type === 'hybrid') && targets.length === 1) {
      this.bus.emit('combat:attackStart', actor, targets[0]);
    }
    targets.forEach((t) => this.applySkillEffect(actor, skill, t));

    // Apply self-inflicted status after the attack (e.g. reloading after flintlockShot)
    if (skillExt.selfStatus) {
      this.statusSystem.apply(actor, skillExt.selfStatus);
      this.addLog(`${actor.name} must reload next turn.`);
    }

    // Track skill use for evolution (players only)
    if (actor instanceof PlayerCombatant) {
      const evo = GameState.getInstance().recordSkillUse(actor.characterId, skillId);
      if (evo) {
        this.addLog(`✨ ${actor.name}'s ${skill.name} has evolved into a stronger skill!`);
        // Sync actor's skill list from the updated game state
        const charState = GameState.getInstance().getCharacter(actor.characterId);
        if (charState) actor.skills = [...charState.skills];
      }
    }

    return true;
  }

  /**
   * Restore HP on an entity, accounting for the Zombie status which reverses
   * healing into damage.  All healing in CombatSystem should go through this
   * helper rather than calling entity.restoreHp() directly.
   */
  private applyHeal(entity: CombatEntity, amount: number): void {
    if (entity.hasStatus('zombie')) {
      entity.applyDamage(amount);
      this.addLog(`${entity.name}'s Zombie status reverses the healing! ${amount} damage!`);
      this.bus.emit('combat:damage', entity, amount);
      this.checkDefeated(entity);
    } else {
      entity.restoreHp(amount);
      this.bus.emit('combat:heal', entity, amount);
    }
  }

  private applySkillEffect(
    actor: CombatEntity,
    skill: (typeof skillsData.skills)[0],
    target: CombatEntity,
  ): void {
    if (skill.type === 'magic') {
      // Reflect: bounce magic skills back at the caster (except when caster already has Reflect,
      // to prevent infinite loops).
      if (target.hasStatus('reflect') && !actor.hasStatus('reflect')) {
        this.addLog(`${target.name}'s Reflect bounces ${skill.name} back at ${actor.name}!`);
        this.applySkillEffect(target, skill, actor);
        return;
      }
    }

    const skillExt = skill as typeof skill & {
      pierce?: boolean;
      applyStatus?: string;
    };

    if (skill.type === 'physical' || skill.type === 'magic' || skill.type === 'hybrid') {
      const skillElement = (skill as { element?: string }).element ?? null;

      // ── Miss check: physical and hybrid attacks have 75% hit chance; magic always hits. ─
      if (skill.type === 'physical' || skill.type === 'hybrid') {
        if (Math.random() >= CombatSystem.PHYSICAL_HIT_CHANCE) {
          this.addLog(`${actor.name} uses ${skill.name} — but misses ${target.name}!`);
          this.bus.emit('combat:miss', actor, target);
          return;
        }
      }

      // Elemental absorption: if the skill's element matches the target's element, heal instead.
      if (skillElement && target.element === skillElement) {
        const base = skill.type === 'physical' ? actor.stats.strength : actor.stats.magic;
        const def = skill.type === 'physical' ? target.effectiveDefense() : target.stats.magicDefense;
        const healed = Math.max(1, Math.floor((base * 2 * (skill.power ?? 1.0)) - def));
        this.applyHeal(target, healed);
        this.addLog(`${target.name} absorbs ${skill.name}! Healed for ${healed} HP.`);
        return;
      }

      // Elemental weakness: hitting an enemy's opposing element deals double damage.
      const weaknessMap: Record<string, string[]> = {
        fire: ['ice', 'water'],
        ice: ['fire'],
        lightning: ['water'],
        water: ['lightning'],
      };
      const targetWeaknesses = target.element ? (weaknessMap[target.element] ?? []) : [];
      const isWeakness = skillElement !== null && targetWeaknesses.includes(skillElement);
      const weaknessMultiplier = isWeakness ? 2.0 : 1.0;

      // Extra EXP bonus for crits on weakness — flagged via event for scene to handle
      if (isWeakness) {
        this.bus.emit('combat:weaknessHit', actor, target);
      }

      // Bio Drain: use the caster's strongest offensive stat as the base.
      if (skill.id === 'drain') {
        const base = Math.max(actor.stats.strength, actor.stats.magic);
        const def = target.stats.magicDefense;
        const dmg = Math.max(1, Math.floor((base * 2 * (skill.power ?? 1.0)) - def));
        target.applyDamage(dmg);
        const restore = Math.max(1, Math.floor(dmg / 2));
        this.applyHeal(actor, restore);
        this.addLog(`${actor.name} uses ${skill.name} on ${target.name} for ${dmg} damage (restored ${restore} HP).`);
        this.bus.emit('combat:damage', target, dmg);
        this.checkDefeated(target);
        return;
      }

      let dmg: number;

      // ── Hybrid attack (half physical + half magical) ────────────────────────
      if (skill.type === 'hybrid') {
        const physBase = actor.stats.strength;
        const physDef = target.effectiveDefense();
        const physPart = Math.max(1, Math.floor((physBase * (skill.power ?? 1.0)) - physDef / 2));
        const magBase = actor.stats.magic;
        const magDef = target.stats.magicDefense;
        const magPart = Math.max(1, Math.floor((magBase * (skill.power ?? 1.0)) - magDef / 2));
        dmg = Math.max(1, Math.floor((physPart + magPart) * weaknessMultiplier));
        if (weaknessMultiplier > 1.0) {
          this.addLog(`${actor.name} uses ${skill.name} on ${target.name} — WEAKNESS! ${dmg} damage!`);
        } else {
          this.addLog(`${actor.name} uses ${skill.name} on ${target.name} for ${dmg} damage (physical+magic).`);
        }
      }
      // ── Pierce (flintlock) — ignores defense entirely ─────────────────────────
      else if (skillExt.pierce) {
        const base = actor.stats.strength;
        const rawDmg = Math.max(1, Math.floor(base * 2 * (skill.power ?? 1.0)));
        dmg = Math.max(1, Math.floor(rawDmg * weaknessMultiplier));
        this.addLog(`${actor.name} uses ${skill.name} on ${target.name} for ${dmg} damage (pierce).`);
      }
      // ── Standard physical or magic ──────────────────────────────────────────
      else {
        const base = skill.type === 'physical' ? actor.stats.strength : actor.stats.magic;
        const def = skill.type === 'physical' ? target.effectiveDefense() : target.stats.magicDefense;
        const rawDmg = Math.max(1, Math.floor((base * 2 * (skill.power ?? 1.0)) - def));
        dmg = Math.max(1, Math.floor(rawDmg * weaknessMultiplier));
        if (weaknessMultiplier > 1.0) {
          this.addLog(`${actor.name} uses ${skill.name} on ${target.name} — WEAKNESS! ${dmg} damage!`);
        } else {
          this.addLog(`${actor.name} uses ${skill.name} on ${target.name} for ${dmg} damage.`);
        }
      }

      target.applyDamage(dmg);
      this.bus.emit('combat:damage', target, dmg);
      this.checkDefeated(target);

      // Apply on-hit status effects (e.g. bleed from arrows)
      if (skillExt.applyStatus && !target.isDefeated) {
        this.statusSystem.apply(target, skillExt.applyStatus);
        this.addLog(`${target.name} is afflicted with ${skillExt.applyStatus}!`);
      }

    } else if (skill.type === 'heal') {
      const healed = Math.floor(actor.stats.magic * 3 * (skill.power ?? 1.0));
      this.applyHeal(target, healed);
      // Using a healing spell also fully restores the caster's stamina (if applicable)
      if (actor.stats.maxStm > 0 && actor === target) {
        actor.restoreStm(actor.stats.maxStm);
        this.bus.emit('combat:stmChange', actor);
      }
      this.addLog(`${actor.name} uses ${skill.name} on ${target.name}, restoring ${healed} HP.`);
    } else if (skill.type === 'revive') {
      if (!target.isDefeated) {
        this.addLog(`${target.name} doesn't need reviving!`);
        // Refund MP
        actor.stats.mp = Math.min(actor.stats.maxMp, actor.stats.mp + skill.mpCost);
        return;
      }
      const hpRestore = Math.max(1, Math.floor(target.stats.maxHp * (skill.power ?? 0.25)));
      target.stats.hp = hpRestore;
      this.addLog(`${actor.name} uses ${skill.name} — ${target.name} is revived with ${hpRestore} HP!`);
      this.bus.emit('combat:heal', target, hpRestore);
    } else if (skill.type === 'status_apply' && skill.statusEffect) {
      this.statusSystem.apply(target, skill.statusEffect);
      this.addLog(`${actor.name} applies ${skill.name} to ${target.name}.`);
    } else if (skill.type === 'status_remove') {
      target.statusEffects.forEach((eff) => this.statusSystem.remove(target, eff));
      this.addLog(`${actor.name} cures ${target.name}'s status effects.`);
    }
  }

  private useItem(actor: CombatEntity, itemId: string, target: CombatEntity | null): void {
    const item = itemsData.items.find((i) => i.id === itemId);
    if (!item) return;
    // Consume the item from inventory first; bail if it can't be removed.
    const state = GameState.getInstance();
    if (!state.removeItem(itemId)) {
      this.addLog(`No ${item.name} left!`);
      return;
    }
    // Using an item costs a small amount of stamina (reaching for a potion mid-battle).
    if (actor.stats.maxStm > 0) {
      actor.consumeStm(CombatSystem.ITEM_STM_COST);
      this.bus.emit('combat:stmChange', actor);
    }
    const t = target ?? actor;
    const effect = item.effect as Record<string, unknown>;
    if (effect['revive'] === true) {
      if (!t.isDefeated) {
        this.addLog(`${t.name} doesn't need reviving! (${item.name} wasted)`);
        // Item is already consumed — do NOT refund it. The turn is also consumed.
        return;
      }
      const hpRestore = typeof effect['hpPercent'] === 'number'
        ? Math.max(1, Math.floor(t.stats.maxHp * (effect['hpPercent'] as number)))
        : typeof effect['hp'] === 'number' ? (effect['hp'] as number) : 1;
      t.stats.hp = hpRestore; // directly set so defeated check clears
      this.addLog(`${actor.name} uses ${item.name} — ${t.name} is revived with ${hpRestore} HP!`);
      this.bus.emit('combat:heal', t, hpRestore);
    } else if (typeof effect['applyStatus'] === 'string') {
      const statusId = effect['applyStatus'] as string;
      this.statusSystem.apply(t, statusId);
      this.addLog(`${actor.name} uses ${item.name} on ${t.name}, inflicting ${statusId}!`);
    } else if (effect['dispel'] === true) {
      const removed = [...t.statusEffects];
      removed.forEach((eff) => this.statusSystem.remove(t, eff));
      this.addLog(`${actor.name} uses ${item.name} on ${t.name}, dispelling all status effects!`);
      this.bus.emit('combat:heal', t, 0);
    } else {
      if (typeof effect['hp'] === 'number') {
        this.applyHeal(t, effect['hp']);
        // Using a healing item also restores stamina fully (catching breath)
        if (t.stats.maxStm > 0) {
          t.restoreStm(t.stats.maxStm);
          this.bus.emit('combat:stmChange', t);
        }
        this.addLog(`${actor.name} uses ${item.name} on ${t.name}, restoring ${effect['hp']} HP.`);
      }
      if (typeof effect['mp'] === 'number') {
        t.stats.mp = Math.min(t.stats.maxMp, t.stats.mp + (effect['mp'] as number));
        this.addLog(`${actor.name} uses ${item.name} on ${t.name}, restoring ${effect['mp']} MP.`);
        this.bus.emit('combat:heal', t, effect['mp']);
      }
      if (typeof effect['stmPercent'] === 'number') {
        const stmRestore = Math.ceil(t.stats.maxStm * (effect['stmPercent'] as number));
        t.restoreStm(stmRestore);
        this.addLog(`${actor.name} uses ${item.name} on ${t.name}, restoring ${stmRestore} Stamina.`);
        this.bus.emit('combat:stmChange', t);
      }
      if (effect['removePoison'] === true) {
        this.statusSystem.remove(t, 'poison');
        this.addLog(`${actor.name} uses ${item.name} on ${t.name}, curing Poison.`);
        this.bus.emit('combat:heal', t, 0);
      }
    }
    this.bus.emit('combat:itemUsed', actor, item.id);
  }

  private resolveTargets(
    actor: CombatEntity,
    targetType: string,
    singleTarget: CombatEntity | null,
  ): CombatEntity[] {
    const isPlayer = this.players.includes(actor as PlayerCombatant);
    const _allies = isPlayer
      ? this.players.filter((p) => !p.isDefeated)
      : this.enemies.filter((e) => !e.isDefeated);
    const _deadAllies = isPlayer
      ? this.players.filter((p) => p.isDefeated)
      : this.enemies.filter((e) => e.isDefeated);
    const foes = isPlayer
      ? this.enemies.filter((e) => !e.isDefeated)
      : this.players.filter((p) => !p.isDefeated);

    switch (targetType) {
      case 'single_enemy':
        return singleTarget ? [singleTarget] : foes.slice(0, 1);
      case 'single_ally':
        return singleTarget ? [singleTarget] : _allies.slice(0, 1);
      case 'single_dead_ally':
        return singleTarget ? [singleTarget] : _deadAllies.slice(0, 1);
      case 'all_enemies':
        return foes;
      case 'all_allies':
        return _allies;
      case 'self':
        return [actor];
      default:
        return singleTarget ? [singleTarget] : [];
    }
  }

  private checkDefeated(entity: CombatEntity): void {
    if (entity.isDefeated) {
      if (entity.hasStatus('reraise')) {
        const hpRestore = Math.max(1, Math.floor(entity.stats.maxHp * 0.25));
        entity.stats.hp = hpRestore; // set directly to avoid zombie interaction on auto-revive
        entity.removeStatus('reraise');
        const skillDef = skillsData.skills.find((s) => s.id === 'reraise');
        const skillName = skillDef ? skillDef.name : 'Auto-Life';
        this.addLog(`${entity.name} is revived by ${skillName} with ${hpRestore} HP!`);
        // Emit heal so the UI re-renders the entity as alive.
        this.bus.emit('combat:heal', entity, hpRestore);
      } else {
        this.addLog(`${entity.name} is defeated!`);
        this.bus.emit('combat:defeated', entity);
      }
    }
  }

  private addLog(msg: string): void {
    this.log.push(msg);
    if (this.log.length > 20) this.log.shift();
    this.bus.emit('combat:log', msg);
  }

  /** Return the upcoming turn order for UI display. */
  getTimelinePreview(count = 10): CombatEntity[] {
    return this.timeline.preview(count);
  }

  /** Return the predicted turn order if actor uses a skill with the given speed modifier. */
  getTimelinePreviewWithModifier(actor: CombatEntity, speedModifier: number, count = 10): CombatEntity[] {
    return this.timeline.previewWithSpeedModifier(actor, speedModifier, count);
  }

  /** Return true if actor has a pending team-move combo waiting to be executed. */
  hasPendingCombo(actor: CombatEntity): boolean {
    return this.pendingCombos.has(actor.id);
  }

  /**
   * Execute the team-move combo for an ally who has a pending combo set by the initiator.
   * Both the initiator and the ally deal combined damage to the target using the team
   * move's type (physical, magic, elemental) and stats. Both then receive a CTB slowdown.
   */
  executePendingCombo(ally: CombatEntity): void {
    const combo = this.pendingCombos.get(ally.id);
    if (!combo) return;
    this.pendingCombos.delete(ally.id);

    const initiator = [...this.players, ...this.enemies].find((e) => e.id === combo.initiatorId);
    const target = [...this.players, ...this.enemies].find((e) => e.id === combo.targetId);

    // ── Look up the team move definition ──────────────────────────────────────
    type TeamMoveDef = (typeof skillsData.skills)[0] & {
      teamMove?: boolean;
      element?: string;
      comboSpeedModifier?: number;
    };
    const moveDef = combo.teamMoveId
      ? (skillsData.skills.find((s) => s.id === combo.teamMoveId) as TeamMoveDef | undefined)
      : undefined;
    const comboSpeed = moveDef?.comboSpeedModifier ?? CombatSystem.TEAM_MOVE_COMBO_SPEED;

    if (!initiator || !target || target.isDefeated) {
      this.addLog(`${ally.name}'s combo fizzled — target is gone!`);
      // Still consumes the ally's turn with a heavy penalty
      const beforeOrder = this.timeline.preview(10);
      this.timeline.endTurn(ally, comboSpeed);
      const afterOrder = this.timeline.preview(10);
      this.bus.emit('combat:timelineShift', ally, beforeOrder, afterOrder, comboSpeed);
      this.bus.emit('combat:actionEnd', ally);
      this.statusSystem.processTurn(ally);
      return;
    }

    // ── Animate both participants lunging at the target ──────────────────────
    this.bus.emit('combat:attackStart', initiator, target);
    this.bus.emit('combat:attackStart', ally, target);

    // ── Drain massive stamina from the ally executing the combo ─────────────
    if (ally.stats.maxStm > 0) {
      ally.consumeStm(CombatSystem.TEAM_MOVE_STM_COST);
      this.bus.emit('combat:stmChange', ally);
    }

    // ── Calculate combined damage based on move type ─────────────────────────
    // Elemental weakness map (same as regular skills)
    const weaknessMap: Record<string, string[]> = {
      fire: ['ice', 'water'],
      ice: ['fire'],
      lightning: ['water'],
      water: ['lightning'],
    };

    if (moveDef) {
      const power = moveDef.power ?? 2.0;
      const moveType = moveDef.type;
      const moveElement = moveDef.element ?? null;

      const targetWeaknesses = target.element ? (weaknessMap[target.element] ?? []) : [];
      const isWeakness = moveElement !== null && targetWeaknesses.includes(moveElement);
      const weaknessMultiplier = isWeakness ? 2.0 : 1.0;
      const moveName = moveDef.name;

      // ── Miss check: physical and hybrid team moves have 75% hit chance; magic always hits. ─
      const isMissableTeamMove = moveType === 'physical' || moveType === 'hybrid';
      if (isMissableTeamMove && Math.random() >= CombatSystem.PHYSICAL_HIT_CHANCE) {
        this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} — misses ${target.name}!`);
        this.bus.emit('combat:miss', ally, target);
        // Track the attempt for evolution even on miss, then skip damage.
        if (combo.teamMoveId) {
          const initiatorPlayer = initiator instanceof PlayerCombatant ? initiator : null;
          if (initiatorPlayer) {
            const evolved = GameState.getInstance().recordTeamMoveUse(initiatorPlayer.characterId, combo.teamMoveId);
            if (evolved) {
              this.bus.emit('skill:evolved', initiatorPlayer, evolved.skillId);
            }
          }
        }
        // Fall through to CTB slowdown below.
      } else {

      // Elemental absorption: if skill's element matches target's element, heal instead
      if (moveElement && target.element === moveElement) {
        const combinedMag = initiator.stats.magic + ally.stats.magic;
        const healed = Math.max(1, Math.floor(combinedMag * 2 * power - target.stats.magicDefense));
        this.applyHeal(target, healed);
        this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} on ${target.name} — ABSORBED! ${target.name} healed for ${healed} HP!`);
      } else if (moveType === 'physical') {
        const combinedStr = initiator.stats.strength + ally.stats.strength;
        const rawDmg = Math.max(1, Math.floor(combinedStr * 2 * power - target.effectiveDefense()));
        const comboDmg = Math.max(1, Math.floor(rawDmg * weaknessMultiplier));
        target.applyDamage(comboDmg);
        if (isWeakness) {
          this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} on ${target.name} — WEAKNESS! ${comboDmg} MASSIVE damage!`);
        } else {
          this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} on ${target.name} for ${comboDmg} MASSIVE physical damage!`);
        }
        this.bus.emit('combat:damage', target, comboDmg);
        this.checkDefeated(target);
      } else if (moveType === 'magic') {
        const combinedMag = initiator.stats.magic + ally.stats.magic;
        const rawDmg = Math.max(1, Math.floor(combinedMag * 2 * power - target.stats.magicDefense));
        const comboDmg = Math.max(1, Math.floor(rawDmg * weaknessMultiplier));
        target.applyDamage(comboDmg);
        if (isWeakness) {
          this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} on ${target.name} — WEAKNESS! ${comboDmg} MASSIVE magic damage!`);
        } else {
          this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} on ${target.name} for ${comboDmg} MASSIVE magic damage!`);
        }
        this.bus.emit('combat:damage', target, comboDmg);
        this.checkDefeated(target);
      } else if (moveType === 'hybrid') {
        const physPart = Math.max(1, Math.floor((initiator.stats.strength + ally.stats.strength) * power - target.effectiveDefense() / 2));
        const magPart = Math.max(1, Math.floor((initiator.stats.magic + ally.stats.magic) * power - target.stats.magicDefense / 2));
        const comboDmg = Math.max(1, Math.floor((physPart + magPart) * weaknessMultiplier));
        target.applyDamage(comboDmg);
        this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} on ${target.name} for ${comboDmg} MASSIVE damage (physical+magic)!`);
        this.bus.emit('combat:damage', target, comboDmg);
        this.checkDefeated(target);
      } else {
        // Fallback: generic physical formula
        const comboBase = (initiator.stats.strength + ally.stats.strength) * 2;
        const comboDmg = Math.max(1, Math.floor(comboBase * 2.0 - target.effectiveDefense()));
        target.applyDamage(comboDmg);
        this.addLog(`⚡ ${initiator.name} + ${ally.name} ${moveName} on ${target.name} for ${comboDmg} MASSIVE damage!`);
        this.bus.emit('combat:damage', target, comboDmg);
        this.checkDefeated(target);
      }

      // Track team move use on the initiator for evolution.
      if (combo.teamMoveId) {
        const initiatorPlayer = initiator instanceof PlayerCombatant ? initiator : null;
        if (initiatorPlayer) {
          const evolved = GameState.getInstance().recordTeamMoveUse(initiatorPlayer.characterId, combo.teamMoveId);
          if (evolved) {
            this.bus.emit('skill:evolved', initiatorPlayer, evolved.skillId);
          }
        }
      }
      } // end hit branch
    } else {
      // ── Legacy fallback: old combined physical formula ────────────────────
      // Formula: (initiator.str + ally.str) × 2 = comboBase  →  comboBase × 2.0 − def.
      const comboBase = (initiator.stats.strength + ally.stats.strength) * 2;
      const comboDmg = Math.max(1, Math.floor(comboBase * 2.0 - target.effectiveDefense()));
      target.applyDamage(comboDmg);
      this.addLog(`⚡ ${initiator.name} + ${ally.name} TEAM MOVE on ${target.name} for ${comboDmg} MASSIVE damage!`);
      this.bus.emit('combat:damage', target, comboDmg);
      this.checkDefeated(target);
    }

    // ── Apply heavy CTB slowdown to BOTH participants ────────────────────────
    // Initiator's turn was already ended in executeAction; apply extra penalty directly.
    const initiatorCtbPenalty = Math.ceil(initiator.effectiveAgility() * comboSpeed);
    initiator.ctbValue = Math.max(initiator.ctbValue, initiatorCtbPenalty);

    // End ally's turn with the heavy penalty
    const beforeOrder = this.timeline.preview(10);
    this.timeline.endTurn(ally, comboSpeed);
    const afterOrder = this.timeline.preview(10);
    this.bus.emit('combat:timelineShift', ally, beforeOrder, afterOrder, comboSpeed);
    this.bus.emit('combat:actionEnd', ally);
    this.statusSystem.processTurn(ally);
    this.checkDefeated(ally);
  }

  checkResult(): CombatResult | null {
    const allEnemiesDead = this.enemies.every((e) => e.isDefeated);
    const allPlayersDead = this.players.every((p) => p.isDefeated);

    if (allEnemiesDead) {
      const expGained = this.enemies.reduce((sum, e) => sum + e.rewards.exp, 0);
      const goldGained = this.enemies.reduce((sum, e) => sum + e.rewards.gold, 0);
      const itemsGained = this.enemies.flatMap((e) => e.rewards.items);
      return { victory: true, defeat: false, fled: false, expGained, goldGained, itemsGained };
    }
    if (allPlayersDead) {
      return { victory: false, defeat: true, fled: false, expGained: 0, goldGained: 0, itemsGained: [] };
    }
    return null;
  }
}
