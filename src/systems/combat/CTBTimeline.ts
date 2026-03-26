import { CombatEntity } from './CombatEntity';

const CTB_SPEED_CONSTANT = 1000;

export class CTBTimeline {
  private entities: CombatEntity[];

  constructor(entities: CombatEntity[]) {
    this.entities = entities;
    // Initialise CTB values so higher agility acts sooner
    entities.forEach((e) => {
      e.ctbValue = Math.floor(CTB_SPEED_CONSTANT / e.effectiveAgility());
    });
  }

  /** Advance time until the next entity is ready, return it. */
  next(): CombatEntity {
    const active = this.entities.filter((e) => !e.isDefeated);
    if (active.length === 0) throw new Error('No active entities');
    const min = Math.min(...active.map((e) => e.ctbValue));
    active.forEach((e) => (e.ctbValue -= min));
    const actor = active.find((e) => e.ctbValue === 0)!;
    return actor;
  }

  /** After an actor takes their turn, reset their CTB.
   *  @param speedModifier Values < 1.0 advance the next turn (fast moves),
   *                       values > 1.0 delay it (powerful/slow moves).
   *                       Defaults to 1.0 (no change).
   */
  endTurn(actor: CombatEntity, speedModifier = 1.0): void {
    const base = Math.floor(CTB_SPEED_CONSTANT / actor.effectiveAgility());
    actor.ctbValue = Math.max(1, Math.round(base * speedModifier));
  }

  /** Return entities sorted by who acts soonest. */
  preview(count = 10): CombatEntity[] {
    const active = this.entities.filter((e) => !e.isDefeated);
    type Snap = { entity: CombatEntity; val: number };
    const snap: Snap[] = active.map((e) => ({ entity: e, val: e.ctbValue }));
    const order: CombatEntity[] = [];
    for (let i = 0; i < count; i++) {
      if (snap.length === 0) break;
      const min = Math.min(...snap.map((s) => s.val));
      snap.forEach((s) => (s.val -= min));
      const idx = snap.findIndex((s) => s.val === 0);
      const [picked] = snap.splice(idx, 1);
      order.push(picked.entity);
      picked.val = Math.floor(CTB_SPEED_CONSTANT / picked.entity.effectiveAgility());
      snap.push(picked);
    }
    return order;
  }
}
