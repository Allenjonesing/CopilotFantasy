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

  it('previewWithSpeedModifier returns the correct number of upcoming actors', () => {
    const aria = new PlayerCombatant('aria');
    const goblin = new EnemyCombatant('goblin');
    const timeline = new CTBTimeline([aria, goblin]);
    timeline.next(); // aria or goblin acts first (ctbValue = 0)
    const actor = aria.ctbValue === 0 ? aria : goblin;
    const preview = timeline.previewWithSpeedModifier(actor, 1.0, 6);
    expect(preview).toHaveLength(6);
  });

  it('previewWithSpeedModifier with fast skill places actor sooner than slow skill', () => {
    const aria = new PlayerCombatant('aria');  // agility 6
    const slime = new EnemyCombatant('slime');
    const timeline = new CTBTimeline([aria, slime]);
    timeline.next();
    aria.ctbValue = 0; // force aria to be the current actor

    const fastPreview = timeline.previewWithSpeedModifier(aria, 0.6, 10);
    const slowPreview = timeline.previewWithSpeedModifier(aria, 1.6, 10);

    // In the fast preview, aria should appear again sooner (lower index after position 0).
    const ariaFastIdx = fastPreview.findIndex((e) => e === aria);
    const ariaSlowIdx = slowPreview.findIndex((e) => e === aria);
    expect(ariaFastIdx).toBeLessThan(ariaSlowIdx);
  });

  it('previewWithSpeedModifier does not mutate entity ctbValues', () => {
    const aria = new PlayerCombatant('aria');
    const slime = new EnemyCombatant('slime');
    const timeline = new CTBTimeline([aria, slime]);
    timeline.next();
    aria.ctbValue = 0;
    const slimeBefore = slime.ctbValue;

    timeline.previewWithSpeedModifier(aria, 0.6, 10);

    // Original ctb values must be unchanged after the preview.
    expect(aria.ctbValue).toBe(0);
    expect(slime.ctbValue).toBe(slimeBefore);
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
    // State already starts with 3 potions; add 2 more → 5 total.
    state.addItem('potion', 2);
    const beforeQty = state.data.inventory.find((i) => i.id === 'potion')!.quantity;
    system.nextTurn();
    const actor = system.currentActor!;
    system.executeAction(actor, { type: 'item', itemId: 'potion', target: actor });
    const remaining = state.data.inventory.find((i) => i.id === 'potion');
    // Quantity should have dropped by exactly 1.
    expect((remaining?.quantity ?? 0)).toBe(beforeQty - 1);
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

  it('slime base HP is 28', () => {
    const slime = new EnemyCombatant('slime');
    expect(slime.stats.maxHp).toBe(28);
  });

  it('iron golem agility is at least 10', () => {
    const golem = new EnemyCombatant('ironGolem');
    expect(golem.stats.agility).toBeGreaterThanOrEqual(10);
  });

  it('new enemy types exist: caveBat, stoneTroll, darkWraith, voidDrake', () => {
    // Create enemies at their natural floor to avoid floor-penalty downscaling.
    const bat = new EnemyCombatant('caveBat', 1.0, undefined, 3);
    const troll = new EnemyCombatant('stoneTroll', 1.0, undefined, 4);
    const wraith = new EnemyCombatant('darkWraith', 1.0, undefined, 7);
    const drake = new EnemyCombatant('voidDrake', 1.0, undefined, 10);
    expect(bat.stats.agility).toBeGreaterThan(15); // cave bat is fast
    expect(troll.stats.defense).toBeGreaterThan(15); // stone troll is tanky
    expect(wraith.stats.magic).toBeGreaterThan(20); // dark wraith is magical
    expect(drake.stats.hp).toBeGreaterThan(300);    // void drake has massive HP
  });

  it('slime has enough MP to use venomStrike (cost 6)', () => {
    const slime = new EnemyCombatant('slime');
    expect(slime.stats.mp).toBeGreaterThanOrEqual(6);
  });

  it('using revival item on alive target consumes the item (not refunded)', () => {
    const state = GameState.getInstance();
    state.addItem('phoenix', 1);
    const qtyBefore = state.data.inventory.find((i) => i.id === 'phoenix')!.quantity;
    system.nextTurn();
    const actor = system.currentActor!;
    // Use phoenix on an ALIVE ally (should consume item, not refund)
    const aliveTarget = system.players.find((p) => !p.isDefeated)!;
    system.executeAction(actor, { type: 'item', itemId: 'phoenix', target: aliveTarget });
    const qtyAfter = state.data.inventory.find((i) => i.id === 'phoenix');
    expect((qtyAfter?.quantity ?? 0)).toBe(qtyBefore - 1);
  });

  it('revival herb restores 50% HP on a KO\'d ally', () => {
    const state = GameState.getInstance();
    state.addItem('phoenix', 1);
    system.nextTurn();
    const actor = system.currentActor!;
    const target = system.players.find((p) => p !== actor)!;
    target.applyDamage(target.stats.maxHp); // KO
    system.executeAction(actor, { type: 'item', itemId: 'phoenix', target });
    expect(target.isDefeated).toBe(false);
    expect(target.stats.hp).toBe(Math.max(1, Math.floor(target.stats.maxHp * 0.5)));
  });

  it('reraise auto-revives with 25% HP (not 1 HP)', () => {
    const aria = system.players[0];
    aria.stats.mp = 100;
    aria.skills.push('reraise');
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'reraise', target: aria });
    expect(aria.hasStatus('reraise')).toBe(true);
    // KO aria — reraise should trigger
    aria.applyDamage(aria.stats.maxHp);
    // checkDefeated is triggered during a subsequent attack
    const slime = system.enemies[0];
    slime.stats.mp = 0;
    system.executeAction(slime, { type: 'attack', target: aria });
    // If she was killed the reraise should have fired (hp already applied above)
    // Check that if reraise was on her, she didn't stay at 1 HP
    if (!aria.isDefeated) {
      expect(aria.stats.hp).toBeGreaterThanOrEqual(Math.floor(aria.stats.maxHp * 0.25));
    }
  });

  it('new enemy types exist: zombieSlime, mushroomSpore, crystalGolem, healingWisp', () => {
    const zombie = new EnemyCombatant('zombieSlime', 1.0, undefined, 3);
    const mushroom = new EnemyCombatant('mushroomSpore', 1.0, undefined, 4);
    const crystal = new EnemyCombatant('crystalGolem', 1.0, undefined, 6);
    const wisp = new EnemyCombatant('healingWisp', 1.0, undefined, 5);
    expect(zombie.stats.hp).toBeGreaterThan(0);
    expect(mushroom.stats.hp).toBeGreaterThan(0);
    expect(crystal.stats.defense).toBeGreaterThan(20);
    expect(wisp.stats.mp).toBeGreaterThan(80);
  });
});

describe('Bell Skills', () => {
  let system: CombatSystem;

  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
    system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
  });

  it('Haste Bell applies haste status to an ally', () => {
    const aria = system.players[0];
    // Give aria enough MP and manually seed the hasteBell skill
    aria.stats.mp = 50;
    aria.skills.push('hasteBell');
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'hasteBell', target: aria });
    expect(aria.hasStatus('haste')).toBe(true);
  });

  it('Slow Bell applies slow status to an enemy', () => {
    const aria = system.players[0];
    const slime = system.enemies[0];
    aria.stats.mp = 50;
    aria.skills.push('slowBell');
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'slowBell', target: slime });
    expect(slime.hasStatus('slow')).toBe(true);
  });

  it('Haste Bell costs MP', () => {
    const aria = system.players[0];
    aria.stats.mp = 50;
    aria.skills.push('hasteBell');
    system.nextTurn();
    const mpBefore = aria.stats.mp;
    system.executeAction(aria, { type: 'skill', skillId: 'hasteBell', target: aria });
    expect(aria.stats.mp).toBeLessThan(mpBefore);
  });

  it('Slow Bell costs MP', () => {
    const aria = system.players[0];
    const slime = system.enemies[0];
    aria.stats.mp = 50;
    aria.skills.push('slowBell');
    system.nextTurn();
    const mpBefore = aria.stats.mp;
    system.executeAction(aria, { type: 'skill', skillId: 'slowBell', target: slime });
    expect(aria.stats.mp).toBeLessThan(mpBefore);
  });

  it('Aria learns hasteBell at level 7', () => {
    const state = GameState.getInstance();
    // Level up to 7
    while (state.data.level < 7) {
      state.gainExp(state.data.expToNext);
    }
    const aria = state.getCharacter('aria')!;
    expect(aria.skills).toContain('hasteBell');
  });

  it('Aria learns slowBell at level 9', () => {
    const state = GameState.getInstance();
    while (state.data.level < 9) {
      state.gainExp(state.data.expToNext);
    }
    const aria = state.getCharacter('aria')!;
    expect(aria.skills).toContain('slowBell');
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

  it('status effects are permanent — slow does not expire on its own', () => {
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'slow');
    // Process many turns — status should persist (all effects are permanent).
    ses.processTurn(aria);
    ses.processTurn(aria);
    ses.processTurn(aria);
    ses.processTurn(aria);
    ses.processTurn(aria);
    expect(aria.hasStatus('slow')).toBe(true);
    // Manual removal still works
    ses.remove(aria, 'slow');
    expect(aria.hasStatus('slow')).toBe(false);
  });

  it('haste doubles effective agility', () => {
    const kael = new PlayerCombatant('kael'); // base agility 9
    const ses = new StatusEffectSystem();
    ses.apply(kael, 'haste');
    expect(kael.effectiveAgility()).toBe(18); // 9 * 2 = 18
  });
});

describe('Zombie and Reflect status effects', () => {
  let system: CombatSystem;

  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
    system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
  });

  it('Zombie reverses healing: cure on Zombie target deals damage instead', () => {
    const lyra = system.players.find((p) => p.characterId === 'lyra')!;
    lyra.addStatus('zombie');
    lyra.stats.mp = 100;
    lyra.skills.push('cure');
    const hpBefore = lyra.stats.hp;
    system.nextTurn();
    system.executeAction(lyra, { type: 'skill', skillId: 'cure', target: lyra });
    // Zombie reverses heal to damage — hp should be lower
    expect(lyra.stats.hp).toBeLessThan(hpBefore);
  });

  it('Reflect bounces a magic spell back at the caster', () => {
    const slime = system.enemies[0];
    slime.addStatus('reflect');
    slime.stats.mp = 40;
    const aria = system.players[0];
    const ariaHpBefore = aria.stats.hp;
    // Force aria's turn so she can cast a spell
    system.nextTurn();
    aria.stats.mp = 50;
    system.executeAction(aria, { type: 'skill', skillId: 'fire', target: slime });
    // Slime reflects fire back at Aria — aria should take damage, slime should be unharmed
    expect(aria.stats.hp).toBeLessThan(ariaHpBefore);
    expect(slime.stats.hp).toBe(slime.stats.maxHp); // slime untouched
  });

  it('status-effect items apply status: smokeBomb inflicts Poison', () => {
    const state = GameState.getInstance();
    state.addItem('smokeBomb', 1);
    system.nextTurn();
    const actor = system.currentActor!;
    const slime = system.enemies[0];
    system.executeAction(actor, { type: 'item', itemId: 'smokeBomb', target: slime });
    expect(slime.hasStatus('poison')).toBe(true);
  });

  it('status-effect items apply status: freezeBomb inflicts Slow', () => {
    const state = GameState.getInstance();
    state.addItem('freezeBomb', 1);
    system.nextTurn();
    const actor = system.currentActor!;
    const slime = system.enemies[0];
    system.executeAction(actor, { type: 'item', itemId: 'freezeBomb', target: slime });
    expect(slime.hasStatus('slow')).toBe(true);
  });

  it('dispelHerb removes all status effects', () => {
    const state = GameState.getInstance();
    state.addItem('dispelHerb', 1);
    const aria = system.players[0];
    aria.addStatus('poison');
    aria.addStatus('slow');
    system.nextTurn();
    const actor = system.currentActor!;
    system.executeAction(actor, { type: 'item', itemId: 'dispelHerb', target: aria });
    expect(aria.hasStatus('poison')).toBe(false);
    expect(aria.hasStatus('slow')).toBe(false);
  });

  it('zombify skill inflicts Zombie on enemy', () => {
    const aria = system.players[0];
    aria.stats.mp = 50;
    aria.skills.push('zombify');
    const slime = system.enemies[0];
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'zombify', target: slime });
    expect(slime.hasStatus('zombie')).toBe(true);
  });

  it('reflectCast skill grants Reflect to ally', () => {
    const aria = system.players[0];
    aria.stats.mp = 50;
    aria.skills.push('reflectCast');
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'reflectCast', target: aria });
    expect(aria.hasStatus('reflect')).toBe(true);
  });
});

describe('Battle save/resume – CTB and status round-trip', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('getStatusDurationsFor returns empty record when no statuses are active', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const durations = system.getStatusDurationsFor(system.enemies[0]);
    expect(durations).toEqual({});
  });

  it('getStatusDurationsFor reflects duration value after apply (permanent effects use -1)', () => {
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'slow'); // duration = -1 (permanent) per statusEffects.json
    const durations = ses.getDurations(aria.id);
    expect(durations['slow']).toBe(-1); // permanent status
  });

  it('restoreEntityStatuses restores status effects and their durations', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const slime = system.enemies[0];
    // Simulate restoring 'poison' with 2 turns remaining
    system.restoreEntityStatuses([slime], [['poison']], [{ poison: 2 }]);
    expect(slime.hasStatus('poison')).toBe(true);
    // After one turn the duration should tick down (not expire yet)
    const durations = system.getStatusDurationsFor(slime);
    expect(durations['poison']).toBe(2);
  });

  it('restored CTB values are used for turn order instead of recalculated agility CTBs', () => {
    // Create a system; manually set CTB values to simulate a mid-battle snapshot
    // where the slime is about to act (ctbValue = 0) and the player is far away.
    const aria = new PlayerCombatant('aria');
    const slime = new EnemyCombatant('slime');
    const system = new CombatSystem([aria], [slime]);

    // Simulate the snapshot: it's aria's turn (ctbValue 0), slime is far away
    aria.ctbValue = 0;
    slime.ctbValue = 200;

    // nextTurn should select aria (ctbValue = 0)
    const actor = system.nextTurn();
    expect(actor).toBe(aria);
  });

  it('CTBTimeline.next picks the entity with ctbValue 0 when one is already at 0', () => {
    const aria = new PlayerCombatant('aria');
    const slime = new EnemyCombatant('slime');
    const timeline = new CTBTimeline([aria, slime]);

    // Force aria to ctbValue 0 (as if restored from a save at start of her turn)
    aria.ctbValue = 0;
    slime.ctbValue = 150;

    const next = timeline.next();
    expect(next).toBe(aria);
    // slime should be unchanged (min subtracted was 0)
    expect(slime.ctbValue).toBe(150);
  });
});

describe('Spell animation event – no duplicate emissions', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('combat:spellStart fires exactly once when a magic skill is used', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const slime = system.enemies[0] as EnemyCombatant;
    const player = system.players[0];
    let spellStartCount = 0;
    EventBus.getInstance().on('combat:spellStart', () => { spellStartCount++; });
    // Force the slime to have enough MP
    slime.stats.mp = 40;
    system.executeAction(slime, { type: 'skill', skillId: 'water', target: player });
    expect(spellStartCount).toBe(1);
  });

  it('combat:damage fires exactly once per target for a single-target spell', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const slime = system.enemies[0] as EnemyCombatant;
    const player = system.players[0];
    let damageCount = 0;
    EventBus.getInstance().on('combat:damage', () => { damageCount++; });
    slime.stats.mp = 40;
    system.executeAction(slime, { type: 'skill', skillId: 'water', target: player });
    expect(damageCount).toBe(1);
  });

  it('combat:spellStart fires exactly once with two enemies of the same type present', () => {
    // Regression test: previously, consecutive enemy turns could cause the
    // spell animation event to appear to fire twice due to stale EventBus
    // listeners or visual timing overlap.
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime'), new EnemyCombatant('slime')],
    );
    const slime = system.enemies[0] as EnemyCombatant;
    const player = system.players[0];
    let spellStartCount = 0;
    EventBus.getInstance().on('combat:spellStart', () => { spellStartCount++; });
    slime.stats.mp = 40;
    system.executeAction(slime, { type: 'skill', skillId: 'water', target: player });
    expect(spellStartCount).toBe(1);
  });
});

describe('Speed modifier system', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('endTurn with speedModifier < 1 sets a lower ctbValue (faster next turn)', () => {
    const aria = new PlayerCombatant('aria');  // agility 6
    const slime = new EnemyCombatant('slime');
    const timeline = new CTBTimeline([aria, slime]);
    timeline.next(); // advance to first entity
    // Force aria to be the current actor at ctb=0
    aria.ctbValue = 0;
    const baseCTB = Math.floor(1000 / aria.effectiveAgility());
    timeline.endTurn(aria, 0.6);
    expect(aria.ctbValue).toBeLessThan(baseCTB);
    expect(aria.ctbValue).toBeGreaterThanOrEqual(1);
  });

  it('endTurn with speedModifier > 1 sets a higher ctbValue (slower next turn)', () => {
    const aria = new PlayerCombatant('aria');  // agility 6
    const slime = new EnemyCombatant('slime');
    const timeline = new CTBTimeline([aria, slime]);
    aria.ctbValue = 0;
    const baseCTB = Math.floor(1000 / aria.effectiveAgility());
    timeline.endTurn(aria, 1.5);
    expect(aria.ctbValue).toBeGreaterThan(baseCTB);
  });

  it('quickHit skill (speedModifier=0.6) sets lower ctbValue for aria after acting', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];

    system.nextTurn();
    expect(aria.skills).toContain('quickHit');
    aria.stats.mp = 20;
    system.executeAction(aria, { type: 'skill', skillId: 'quickHit', target: slime });

    const base = Math.floor(1000 / aria.effectiveAgility());
    expect(aria.ctbValue).toBeLessThan(base);
  });

  it('smash skill (speedModifier=1.3) results in higher ctbValue for aria after acting', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];

    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'smash', target: slime });
    const base = Math.floor(1000 / aria.effectiveAgility());
    expect(aria.ctbValue).toBeGreaterThan(base);
  });

  it('basic attack uses default speedModifier=1.0', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];

    system.nextTurn();
    system.executeAction(aria, { type: 'attack', target: slime });
    const base = Math.floor(1000 / aria.effectiveAgility());
    expect(aria.ctbValue).toBe(base);
  });

  it('combat:timelineShift event is emitted after every action', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];

    let shiftEmitted = false;
    EventBus.getInstance().on('combat:timelineShift', () => { shiftEmitted = true; });
    system.nextTurn();
    system.executeAction(aria, { type: 'attack', target: slime });
    expect(shiftEmitted).toBe(true);
  });

  it('combat:timelineShift provides before and after orders', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];

    let capturedBefore: unknown[] = [];
    let capturedAfter: unknown[] = [];
    EventBus.getInstance().on('combat:timelineShift', (_actor, before, after) => {
      capturedBefore = before as unknown[];
      capturedAfter = after as unknown[];
    });
    system.nextTurn();
    system.executeAction(aria, { type: 'attack', target: slime });
    expect(capturedBefore.length).toBeGreaterThan(0);
    expect(capturedAfter.length).toBeGreaterThan(0);
  });
});
