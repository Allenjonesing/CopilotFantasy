import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EnemyCombatant } from '../systems/combat/EnemyCombatant';
import { CTBTimeline } from '../systems/combat/CTBTimeline';
import { CombatSystem } from '../systems/combat/CombatSystem';
import { StatusEffectSystem } from '../systems/combat/StatusEffectSystem';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';

describe('CTBTimeline', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('initialises entities with a non-negative ctbValue', () => {
    const aria = new PlayerCombatant('aria');
    const slime = new EnemyCombatant('slime');
    new CTBTimeline([aria, slime]);
    expect(aria.ctbValue).toBeGreaterThanOrEqual(0);
    expect(slime.ctbValue).toBeGreaterThanOrEqual(0);
  });

  it('returns the entity with the lowest ctbValue first', () => {
    const kael = new PlayerCombatant('kael');   // agility 9 (> slime agility 8)
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
    GameState.getInstance().reset();
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

  it('consumes item from inventory on use', () => {
    const state = GameState.getInstance();
    state.addItem('potion', 2);
    system.nextTurn();
    const actor = system.currentActor!;
    system.executeAction(actor, { type: 'item', itemId: 'potion', target: actor });
    const remaining = state.data.inventory.find((i) => i.id === 'potion');
    // Quantity should have dropped from 2 to 1.
    expect(remaining?.quantity ?? 0).toBe(1);
  });

  it('emits combat:heal event when a healing item is used', () => {
    const state = GameState.getInstance();
    state.addItem('potion', 1);
    system.nextTurn();
    const actor = system.currentActor!;
    // Damage the actor first so healing is visible.
    actor.applyDamage(50);
    const hpBefore = actor.stats.hp;
    let healEmitted = false;
    EventBus.getInstance().on('combat:heal', () => { healEmitted = true; });
    system.executeAction(actor, { type: 'item', itemId: 'potion', target: actor });
    expect(actor.stats.hp).toBeGreaterThan(hpBefore);
    expect(healEmitted).toBe(true);
  });

  it('defend action consumes the turn without adding sentinel status', () => {
    system.nextTurn();
    const actor = system.currentActor!;
    const consumed = system.executeAction(actor, { type: 'defend' });
    expect(consumed).toBe(true);
    expect(actor.hasStatus('sentinel')).toBe(false);
  });

  it('ambush: enemies act before players (all enemy CTB < all player CTB)', () => {
    system.applyBattleType('ambush');
    const maxEnemyCtb = Math.max(...system.enemies.map((e) => e.ctbValue));
    const minPlayerCtb = Math.min(...system.players.map((p) => p.ctbValue));
    expect(minPlayerCtb).toBeGreaterThan(maxEnemyCtb);
  });

  it('preemptive: players act before enemies (all player CTB < all enemy CTB)', () => {
    system.applyBattleType('preemptive');
    const maxPlayerCtb = Math.max(...system.players.map((p) => p.ctbValue));
    const minEnemyCtb = Math.min(...system.enemies.map((e) => e.ctbValue));
    expect(minEnemyCtb).toBeGreaterThan(maxPlayerCtb);
  });

  it('phoenix down revives a KO\'d ally', () => {
    const state = GameState.getInstance();
    state.addItem('phoenix', 1);
    system.nextTurn();
    const actor = system.currentActor!;
    // KO one of the players
    const target = system.players.find((p) => p !== actor)!;
    target.applyDamage(target.stats.maxHp);
    expect(target.isDefeated).toBe(true);
    system.executeAction(actor, { type: 'item', itemId: 'phoenix', target });
    expect(target.isDefeated).toBe(false);
    expect(target.stats.hp).toBeGreaterThan(0);
  });

  it('slime base HP is 10', () => {
    const slime = new EnemyCombatant('slime');
    expect(slime.stats.maxHp).toBe(10);
  });
});

describe('StatusEffectSystem', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('applies and processes poison DoT', () => {
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'poison');
    expect(aria.hasStatus('poison')).toBe(true);
    const hpBefore = aria.stats.hp;
    ses.processTurn(aria);
    expect(aria.stats.hp).toBeLessThan(hpBefore);
  });

  it('removes effects after duration expires', () => {
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'slow'); // duration = 3
    ses.processTurn(aria);
    ses.processTurn(aria);
    ses.processTurn(aria);
    expect(aria.hasStatus('slow')).toBe(false);
  });

  it('haste doubles effective agility', () => {
    const kael = new PlayerCombatant('kael'); // base agility 9
    const ses = new StatusEffectSystem();
    ses.apply(kael, 'haste');
    expect(kael.effectiveAgility()).toBe(18); // 9 * 2 = 18
  });
});
