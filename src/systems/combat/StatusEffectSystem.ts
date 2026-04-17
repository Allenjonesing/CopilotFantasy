import { CombatEntity } from './CombatEntity';
import { EventBus } from '../../core/events/EventBus';
import statusData from '../../data/statusEffects.json';

interface StatusDef {
  id: string;
  name?: string;
  dotPercent?: number;
  agilityMod?: number;
  strengthMod?: number;
  autoRevive?: boolean;
  forcedTarget?: boolean;
  duration: number;
}

export class StatusEffectSystem {
  private bus: EventBus;
  private durations: Map<string, Map<string, number>> = new Map();

  constructor() {
    this.bus = EventBus.getInstance();
  }

  apply(entity: CombatEntity, effectId: string): void {
    const def = statusData.statusEffects.find((s) => s.id === effectId) as StatusDef | undefined;
    if (!def) return;
    // Skip application if the entity is immune to this status effect.
    if (entity.statusImmunities.has(effectId)) {
      this.bus.emit('combat:log', `${entity.name} is immune to ${def.name ?? effectId}!`);
      this.bus.emit('status:immune', entity, effectId);
      return;
    }
    entity.addStatus(effectId);
    if (!this.durations.has(entity.id)) this.durations.set(entity.id, new Map());
    this.durations.get(entity.id)!.set(effectId, def.duration);
    this.bus.emit('status:applied', entity, effectId);
  }

  remove(entity: CombatEntity, effectId: string): void {
    entity.removeStatus(effectId);
    this.durations.get(entity.id)?.delete(effectId);
    this.bus.emit('status:removed', entity, effectId);
  }

  /** Return a snapshot of remaining turn-durations for all active effects on the given entity. */
  getDurations(entityId: string): Record<string, number> {
    const entityDurations = this.durations.get(entityId);
    if (!entityDurations) return {};
    const result: Record<string, number> = {};
    entityDurations.forEach((duration, effectId) => {
      result[effectId] = duration;
    });
    return result;
  }

  /**
   * Restore a status effect with a specific remaining duration (used when resuming a saved
   * battle).  Does NOT emit 'status:applied' since this is a restore, not a fresh application.
   */
  restoreStatus(entity: CombatEntity, effectId: string, remainingDuration: number): void {
    entity.addStatus(effectId);
    if (!this.durations.has(entity.id)) this.durations.set(entity.id, new Map());
    this.durations.get(entity.id)!.set(effectId, remainingDuration);
  }

  processTurn(entity: CombatEntity): void {
    const entityDurations = this.durations.get(entity.id);
    if (!entityDurations) return;

    for (const [effectId] of [...entityDurations]) {
      const def = statusData.statusEffects.find((s) => s.id === effectId) as StatusDef | undefined;
      if (!def) continue;

      // DoT damage (e.g. Poison)
      if (def.dotPercent) {
        const dmg = Math.floor(entity.stats.maxHp * def.dotPercent);
        entity.applyDamage(dmg);
        this.bus.emit('status:dot', entity, effectId, dmg);
        this.bus.emit('combat:log', `${entity.name} takes ${dmg} damage from ${def.name ?? effectId}!`);
      }

      // All status effects are now permanent (duration: -1).
      // Effects are only removed by Dispel, Esuna, or specific cure items.
    }
  }
}
