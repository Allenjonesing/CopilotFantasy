import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EnemyCombatant } from '../systems/combat/EnemyCombatant';
import { CTBTimeline } from '../systems/combat/CTBTimeline';
import { CombatSystem } from '../systems/combat/CombatSystem';
import { StatusEffectSystem } from '../systems/combat/StatusEffectSystem';
import { EventBus } from '../core/events/EventBus';

describe('CTBTimeline', () => {
  it('initialises entities with a non-negative ctbValue', () => {
    const aria = new PlayerCombatant('aria');
    const slime = new EnemyCombatant('slime');
    new CTBTimeline([aria, slime]);
    expect(aria.ctbValue).toBeGreaterThanOrEqual(0);
    expect(slime.ctbValue).toBeGreaterThanOrEqual(0);
  });

  it('returns the entity with the lowest ctbValue first', () => {
    const kael = new PlayerCombatant('kael');   // agility 14
    const slime = new EnemyCombatant('slime');  // agility 8
    const timeline = new CTBTimeline([kael, slime]);
    const first = timeline.next();
    expect(first).toBe(kael); // kael acts first (higher agility = lower ctbValue)
  });

  it('preview returns the correct number of upcoming actors', () => {
    const aria = new PlayerCombatant('aria');
    const goblin = new EnemyCombatant('goblin');
    const timeline = new CTBTimeline([aria, goblin]);
    const preview = timeline.preview(6);
    expect(preview).toHaveLength(6);
  });
});

describe('CombatSystem', () => {
  let system: CombatSystem;

  beforeEach(() => {
    EventBus.getInstance().clear();
    system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
  });

  it('executes a basic attack and reduces enemy HP', () => {
    const slime = system.enemies[0];
    const initialHp = slime.stats.hp;
    system.nextTurn();
    const actor = system.currentActor!;
    system.executeAction(actor, { type: 'attack', target: slime });
    expect(slime.stats.hp).toBeLessThan(initialHp);
  });

  it('detects victory when all enemies are defeated', () => {
    const slime = system.enemies[0];
    slime.applyDamage(slime.stats.maxHp);
    const result = system.checkResult();
    expect(result).not.toBeNull();
    expect(result!.victory).toBe(true);
  });

  it('detects defeat when all players are defeated', () => {
    system.players.forEach((p) => p.applyDamage(p.stats.maxHp));
    const result = system.checkResult();
    expect(result).not.toBeNull();
    expect(result!.defeat).toBe(true);
  });

  it('logs actions', () => {
    system.nextTurn();
    const actor = system.currentActor!;
    system.executeAction(actor, { type: 'attack', target: system.enemies[0] });
    expect(system.log.length).toBeGreaterThan(0);
  });
});

describe('StatusEffectSystem', () => {
  it('applies and processes poison DoT', () => {
    EventBus.getInstance().clear();
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'poison');
    expect(aria.hasStatus('poison')).toBe(true);
    const hpBefore = aria.stats.hp;
    ses.processTurn(aria);
    expect(aria.stats.hp).toBeLessThan(hpBefore);
  });

  it('removes effects after duration expires', () => {
    EventBus.getInstance().clear();
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'slow'); // duration = 3
    ses.processTurn(aria);
    ses.processTurn(aria);
    ses.processTurn(aria);
    expect(aria.hasStatus('slow')).toBe(false);
  });

  it('haste doubles effective agility', () => {
    EventBus.getInstance().clear();
    const kael = new PlayerCombatant('kael'); // base agility 14
    const ses = new StatusEffectSystem();
    ses.apply(kael, 'haste');
    expect(kael.effectiveAgility()).toBe(28);
  });
});
