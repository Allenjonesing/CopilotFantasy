import { CombatEntity } from './CombatEntity';
import { PlayerCombatant } from './PlayerCombatant';
import { EnemyCombatant } from './EnemyCombatant';
import { CTBTimeline } from './CTBTimeline';
import { StatusEffectSystem } from './StatusEffectSystem';
import { EventBus } from '../../core/events/EventBus';
import skillsData from '../../data/skills.json';
import itemsData from '../../data/items.json';

export type ActionType = 'attack' | 'skill' | 'item' | 'defend' | 'flee';

export interface CombatAction {
  type: ActionType;
  skillId?: string;
  itemId?: string;
  target?: CombatEntity;
}

export interface CombatResult {
  victory: boolean;
  defeat: boolean;
  fled: boolean;
  expGained: number;
  gilGained: number;
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

  /** Advance to the next actor's turn. */
  nextTurn(): CombatEntity {
    this.currentActor = this.timeline.next();
    this.statusSystem.processTurn(this.currentActor);
    this.bus.emit('combat:turnStart', this.currentActor);
    return this.currentActor;
  }

  /** Execute an action for the current actor. */
  executeAction(actor: CombatEntity, action: CombatAction): void {
    switch (action.type) {
      case 'attack':
        this.physicalAttack(actor, action.target!);
        break;
      case 'skill':
        this.useSkill(actor, action.skillId!, action.target ?? null);
        break;
      case 'item':
        this.useItem(actor, action.itemId!, action.target ?? null);
        break;
      case 'defend':
        actor.addStatus('sentinel');
        this.addLog(`${actor.name} takes a defensive stance.`);
        break;
      case 'flee':
        this.bus.emit('combat:fled');
        break;
    }
    this.timeline.endTurn(actor);
    this.bus.emit('combat:actionEnd', actor);
  }

  private physicalAttack(actor: CombatEntity, target: CombatEntity): void {
    const raw = actor.stats.strength * 2;
    const reduction = target.hasStatus('sentinel') ? 0.5 : 1.0;
    const dmg = Math.max(1, Math.floor((raw - target.stats.defense) * reduction));
    target.applyDamage(dmg);
    this.addLog(`${actor.name} attacks ${target.name} for ${dmg} damage.`);
    this.bus.emit('combat:damage', target, dmg);
    this.checkDefeated(target);
  }

  private useSkill(actor: CombatEntity, skillId: string, target: CombatEntity | null): void {
    const skill = skillsData.skills.find((s) => s.id === skillId);
    if (!skill) return;
    if (!actor.consumeMp(skill.mpCost)) {
      this.addLog(`${actor.name} doesn't have enough MP!`);
      return;
    }
    const targets = this.resolveTargets(actor, skill.target, target);
    targets.forEach((t) => this.applySkillEffect(actor, skill, t));
  }

  private applySkillEffect(
    actor: CombatEntity,
    skill: (typeof skillsData.skills)[0],
    target: CombatEntity,
  ): void {
    if (skill.type === 'physical' || skill.type === 'magic') {
      const base = skill.type === 'physical' ? actor.stats.strength : actor.stats.magic;
      const def = skill.type === 'physical' ? target.stats.defense : target.stats.magicDefense;
      const dmg = Math.max(1, Math.floor((base * 2 * (skill.power ?? 1.0)) - def));
      target.applyDamage(dmg);
      this.addLog(`${actor.name} uses ${skill.name} on ${target.name} for ${dmg} damage.`);
      this.bus.emit('combat:damage', target, dmg);
      this.checkDefeated(target);
    } else if (skill.type === 'heal') {
      const healed = Math.floor(actor.stats.magic * 3 * (skill.power ?? 1.0));
      target.restoreHp(healed);
      this.addLog(`${actor.name} heals ${target.name} for ${healed} HP.`);
      this.bus.emit('combat:heal', target, healed);
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
    const t = target ?? actor;
    const effect = item.effect as Record<string, unknown>;
    if (typeof effect['hp'] === 'number') {
      t.restoreHp(effect['hp']);
      this.addLog(`${actor.name} uses ${item.name} on ${t.name}, restoring ${effect['hp']} HP.`);
    }
    if (typeof effect['mp'] === 'number') {
      t.stats.mp = Math.min(t.stats.maxMp, t.stats.mp + (effect['mp'] as number));
      this.addLog(`${actor.name} uses ${item.name} on ${t.name}, restoring ${effect['mp']} MP.`);
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
    const foes = isPlayer
      ? this.enemies.filter((e) => !e.isDefeated)
      : this.players.filter((p) => !p.isDefeated);

    switch (targetType) {
      case 'single_enemy':
        return singleTarget ? [singleTarget] : foes.slice(0, 1);
      case 'single_ally':
        return singleTarget ? [singleTarget] : _allies.slice(0, 1);
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
        this.addLog(`${entity.name} is revived by Reraise!`);
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
      const gilGained = this.enemies.reduce((sum, e) => sum + e.rewards.gil, 0);
      const itemsGained = this.enemies.flatMap((e) => e.rewards.items);
      return { victory: true, defeat: false, fled: false, expGained, gilGained, itemsGained };
    }
    if (allPlayersDead) {
      return { victory: false, defeat: true, fled: false, expGained: 0, gilGained: 0, itemsGained: [] };
    }
    return null;
  }
}
