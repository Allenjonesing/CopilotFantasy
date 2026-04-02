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

  /** Advance time until the next entity is ready, return it.
   *  When multiple entities reach 0 simultaneously, the one with the highest
   *  effective agility acts first (higher agility breaks ties). */
  next(): CombatEntity {
    const active = this.entities.filter((e) => !e.isDefeated);
    if (active.length === 0) throw new Error('No active entities');
    const min = Math.min(...active.map((e) => e.ctbValue));
    active.forEach((e) => (e.ctbValue -= min));
    const atZero = active.filter((e) => e.ctbValue === 0);
    return atZero.reduce((best, e) =>
      e.effectiveAgility() > best.effectiveAgility() ? e : best,
    );
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

  /** Return the predicted turn order assuming actor just used a skill with the given speed modifier.
   *  The simulation starts with the actor's CTB set to what it would be after endTurn(actor, speedModifier)
   *  and all other entities keeping their current CTB values.  It then projects `count` future turns,
   *  cycling entities as the timeline advances — this does not mutate any entity's ctbValue.
   *  Ties are broken by effective agility (highest agility acts first). */
  previewWithSpeedModifier(actor: CombatEntity, speedModifier: number, count = 10): CombatEntity[] {
    const active = this.entities.filter((e) => !e.isDefeated);
    const base = Math.floor(CTB_SPEED_CONSTANT / actor.effectiveAgility());
    const newActorVal = Math.max(1, Math.round(base * speedModifier));
    type Snap = { entity: CombatEntity; val: number };
    const snap: Snap[] = active.map((e) => ({ entity: e, val: e === actor ? newActorVal : e.ctbValue }));
    const order: CombatEntity[] = [];
    for (let i = 0; i < count; i++) {
      if (snap.length === 0) break;
      const min = Math.min(...snap.map((s) => s.val));
      snap.forEach((s) => (s.val -= min));
      const atZero = snap.filter((s) => s.val === 0);
      const picked = atZero.reduce((best, s) =>
        s.entity.effectiveAgility() > best.entity.effectiveAgility() ? s : best,
      );
      snap.splice(snap.indexOf(picked), 1);
      order.push(picked.entity);
      picked.val = Math.floor(CTB_SPEED_CONSTANT / picked.entity.effectiveAgility());
      snap.push(picked);
    }
    return order;
  }

  /** Return entities sorted by who acts soonest.
   *  Ties are broken by effective agility (highest agility acts first). */
  preview(count = 10): CombatEntity[] {
    const active = this.entities.filter((e) => !e.isDefeated);
    type Snap = { entity: CombatEntity; val: number };
    const snap: Snap[] = active.map((e) => ({ entity: e, val: e.ctbValue }));
    const order: CombatEntity[] = [];
    for (let i = 0; i < count; i++) {
      if (snap.length === 0) break;
      const min = Math.min(...snap.map((s) => s.val));
      snap.forEach((s) => (s.val -= min));
      const atZero = snap.filter((s) => s.val === 0);
      const picked = atZero.reduce((best, s) =>
        s.entity.effectiveAgility() > best.entity.effectiveAgility() ? s : best,
      );
      snap.splice(snap.indexOf(picked), 1);
      order.push(picked.entity);
      picked.val = Math.floor(CTB_SPEED_CONSTANT / picked.entity.effectiveAgility());
      snap.push(picked);
    }
    return order;
  }
}
