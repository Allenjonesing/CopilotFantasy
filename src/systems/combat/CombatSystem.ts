import { CombatEntity } from './CombatEntity';
import { PlayerCombatant } from './PlayerCombatant';
import { EnemyCombatant } from './EnemyCombatant';
import { CTBTimeline } from './CTBTimeline';
import { StatusEffectSystem } from './StatusEffectSystem';
import { EventBus } from '../../core/events/EventBus';
import { GameState } from '../../core/state/GameState';
import skillsData from '../../data/skills.json';
import itemsData from '../../data/items.json';

export type ActionType = 'attack' | 'skill' | 'item' | 'defend' | 'flee';

export interface CombatAction {
  type: ActionType;
  skillId?: string;
  itemId?: string;
  target?: CombatEntity;
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
      case 'defend':
        this.addLog(`${actor.name} takes a defensive stance.`);
        break;
      case 'flee':
        this.bus.emit('combat:fled');
        break;
    }
    if (turnConsumed) {
      this.timeline.endTurn(actor);
      this.bus.emit('combat:actionEnd', actor);
      // Process end-of-turn status effects (DoT, duration ticks) AFTER the actor has acted.
      this.statusSystem.processTurn(actor);
      this.checkDefeated(actor);
    }
    return turnConsumed;
  }

  private physicalAttack(actor: CombatEntity, target: CombatEntity): void {
    this.bus.emit('combat:attackStart', actor, target);
    const raw = actor.stats.strength * 2;
    const dmg = Math.max(1, Math.floor(raw - target.stats.defense));
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
    if (!actor.consumeMp(skill.mpCost)) {
      this.addLog(`${actor.name} doesn't have enough MP!`);
      return false;
    }
    this.bus.emit('combat:mpChange', actor);
    // Resolve targets first so the primary target can be included in the spell animation.
    const targets = this.resolveTargets(actor, skill.target, target);
    const skillElement = (skill as { element?: string }).element ?? null;
    // For status-apply skills (e.g. Venom Strike), use the statusEffect id as the animation
    // element so the animation can use a distinctive colour and shape for that effect.
    const animElement = skillElement ?? (skill as { statusEffect?: string }).statusEffect ?? skill.type;
    const animTarget = targets.length > 0 ? targets[0] : null;
    if (skill.type === 'magic' || skill.type === 'heal' || skill.type === 'revive' || skill.type === 'status_apply') {
      this.bus.emit('combat:spellStart', actor, animTarget, animElement, skill.name);
    }
    // Physical skills use an attack-move animation; emit it once toward the first
    // target rather than once per target to avoid redundant animations on AoE hits.
    if (skill.type === 'physical' && targets.length > 0) {
      this.bus.emit('combat:attackStart', actor, targets[0]);
    }
    targets.forEach((t) => this.applySkillEffect(actor, skill, t));
    return true;
  }

  private applySkillEffect(
    actor: CombatEntity,
    skill: (typeof skillsData.skills)[0],
    target: CombatEntity,
  ): void {
    if (skill.type === 'physical' || skill.type === 'magic') {
      const skillElement = (skill as { element?: string }).element ?? null;

      // Elemental absorption: if the skill's element matches the target's element, heal instead.
      if (skillElement && target.element === skillElement) {
        const base = skill.type === 'physical' ? actor.stats.strength : actor.stats.magic;
        const def = skill.type === 'physical' ? target.stats.defense : target.stats.magicDefense;
        const healed = Math.max(1, Math.floor((base * 2 * (skill.power ?? 1.0)) - def));
        target.restoreHp(healed);
        this.addLog(`${target.name} absorbs ${skill.name}! Healed for ${healed} HP.`);
        this.bus.emit('combat:heal', target, healed);
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
      const weaknessMultiplier = skillElement && targetWeaknesses.includes(skillElement) ? 2.0 : 1.0;

      // Bio Drain: use the caster's strongest offensive stat as the base.
      if (skill.id === 'drain') {
        const base = Math.max(actor.stats.strength, actor.stats.magic);
        const def = target.stats.magicDefense;
        const dmg = Math.max(1, Math.floor((base * 2 * (skill.power ?? 1.0)) - def));
        target.applyDamage(dmg);
        const restore = Math.max(1, Math.floor(dmg / 2));
        actor.restoreHp(restore);
        this.addLog(`${actor.name} uses ${skill.name} on ${target.name} for ${dmg} damage (restored ${restore} HP).`);
        this.bus.emit('combat:damage', target, dmg);
        this.bus.emit('combat:heal', actor, restore);
        this.checkDefeated(target);
        return;
      }

      const base = skill.type === 'physical' ? actor.stats.strength : actor.stats.magic;
      const def = skill.type === 'physical' ? target.stats.defense : target.stats.magicDefense;
      const rawDmg = Math.max(1, Math.floor((base * 2 * (skill.power ?? 1.0)) - def));
      const dmg = Math.max(1, Math.floor(rawDmg * weaknessMultiplier));

      if (weaknessMultiplier > 1.0) {
        this.addLog(`${actor.name} uses ${skill.name} on ${target.name} — WEAKNESS! ${dmg} damage!`);
      } else {
        this.addLog(`${actor.name} uses ${skill.name} on ${target.name} for ${dmg} damage.`);
      }
      target.applyDamage(dmg);
      this.bus.emit('combat:damage', target, dmg);
      this.checkDefeated(target);
    } else if (skill.type === 'heal') {
      const healed = Math.floor(actor.stats.magic * 3 * (skill.power ?? 1.0));
      target.restoreHp(healed);
      this.addLog(`${actor.name} uses ${skill.name} on ${target.name}, restoring ${healed} HP.`);
      this.bus.emit('combat:heal', target, healed);
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
    const t = target ?? actor;
    const effect = item.effect as Record<string, unknown>;
    if (effect['revive'] === true) {
      if (!t.isDefeated) {
        this.addLog(`${t.name} doesn't need reviving!`);
        state.addItem(itemId); // refund
        return;
      }
      const hpRestore = typeof effect['hpPercent'] === 'number'
        ? Math.max(1, Math.floor(t.stats.maxHp * (effect['hpPercent'] as number)))
        : typeof effect['hp'] === 'number' ? (effect['hp'] as number) : 1;
      t.stats.hp = hpRestore; // directly set so defeated check clears
      this.addLog(`${actor.name} uses ${item.name} — ${t.name} is revived with ${hpRestore} HP!`);
      this.bus.emit('combat:heal', t, hpRestore);
    } else {
      if (typeof effect['hp'] === 'number') {
        t.restoreHp(effect['hp']);
        this.addLog(`${actor.name} uses ${item.name} on ${t.name}, restoring ${effect['hp']} HP.`);
        this.bus.emit('combat:heal', t, effect['hp']);
      }
      if (typeof effect['mp'] === 'number') {
        t.stats.mp = Math.min(t.stats.maxMp, t.stats.mp + (effect['mp'] as number));
        this.addLog(`${actor.name} uses ${item.name} on ${t.name}, restoring ${effect['mp']} MP.`);
        this.bus.emit('combat:heal', t, effect['mp']);
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
        entity.restoreHp(1);
        entity.removeStatus('reraise');
        const skillDef = skillsData.skills.find((s) => s.id === 'reraise');
        const skillName = skillDef ? skillDef.name : 'Auto-Life';
        this.addLog(`${entity.name} is revived by ${skillName}!`);
        // Emit heal so the UI re-renders the entity as alive.
        this.bus.emit('combat:heal', entity, 1);
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
