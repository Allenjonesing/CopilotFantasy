import { CombatEntity } from './CombatEntity';
import { EventBus } from '../../core/events/EventBus';
import statusData from '../../data/statusEffects.json';

interface StatusDef {
  id: string;
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

  processTurn(entity: CombatEntity): void {
    const entityDurations = this.durations.get(entity.id);
    if (!entityDurations) return;

    for (const [effectId] of entityDurations) {
      const def = statusData.statusEffects.find((s) => s.id === effectId) as StatusDef | undefined;
      if (!def) continue;

      // DoT damage
      if (def.dotPercent) {
        const dmg = Math.floor(entity.stats.maxHp * def.dotPercent);
        entity.applyDamage(dmg);
        this.bus.emit('status:dot', entity, effectId, dmg);
      }

      // Tick duration
      if (def.duration > 0) {
        const remaining = (entityDurations.get(effectId) ?? 0) - 1;
        if (remaining <= 0) {
          this.remove(entity, effectId);
        } else {
          entityDurations.set(effectId, remaining);
        }
      }
    }
  }
}
