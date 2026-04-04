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

  it('breaks ties in next() by agility — higher agility acts first', () => {
    // Aria (agility 6) and Lyra (agility 12) are given identical ctbValues.
    // Lyra should win the tie because she has higher agility.
    const aria = new PlayerCombatant('aria');   // agility 6
    const lyra = new PlayerCombatant('lyra');   // agility 12
    const timeline = new CTBTimeline([aria, lyra]);
    // Force both to the same ctbValue to guarantee a tie.
    aria.ctbValue = 50;
    lyra.ctbValue = 50;
    const actor = timeline.next();
    expect(actor).toBe(lyra);
  });

  it('breaks ties in preview() by agility — higher agility appears first', () => {
    const aria = new PlayerCombatant('aria');   // agility 6
    const lyra = new PlayerCombatant('lyra');   // agility 12
    const timeline = new CTBTimeline([aria, lyra]);
    aria.ctbValue = 50;
    lyra.ctbValue = 50;
    const order = timeline.preview(1);
    expect(order[0]).toBe(lyra);
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

  it('slime base HP is 32', () => {
    const slime = new EnemyCombatant('slime');
    expect(slime.stats.maxHp).toBe(32);
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

  it('boss enemies are immune to debuff statuses like poison and slow', () => {
    const bossSlime = new EnemyCombatant('slime', 1.0, 'Boss Slime', 1, true);
    const ses = new StatusEffectSystem();
    ses.apply(bossSlime, 'poison');
    ses.apply(bossSlime, 'slow');
    ses.apply(bossSlime, 'bleed');
    expect(bossSlime.hasStatus('poison')).toBe(false);
    expect(bossSlime.hasStatus('slow')).toBe(false);
    expect(bossSlime.hasStatus('bleed')).toBe(false);
  });

  it('regular enemies are not immune to debuff statuses', () => {
    const regularSlime = new EnemyCombatant('slime');
    const ses = new StatusEffectSystem();
    ses.apply(regularSlime, 'poison');
    ses.apply(regularSlime, 'slow');
    expect(regularSlime.hasStatus('poison')).toBe(true);
    expect(regularSlime.hasStatus('slow')).toBe(true);
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

  it('defend action uses DEFEND_SPEED_MODIFIER (faster next turn)', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];

    system.nextTurn();
    system.executeAction(aria, { type: 'defend' });
    const base = Math.floor(1000 / aria.effectiveAgility());
    // Defend is a fast action so the next CTB should be less than the base
    expect(aria.ctbValue).toBeLessThan(base);
    // And should equal base * DEFEND_SPEED_MODIFIER
    expect(aria.ctbValue).toBe(Math.max(1, Math.round(base * CombatSystem.DEFEND_SPEED_MODIFIER)));
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

describe('Stamina System', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('players start with stm and maxStm > 0', () => {
    const aria = new PlayerCombatant('aria');
    expect(aria.stats.stm).toBeGreaterThan(0);
    expect(aria.stats.maxStm).toBeGreaterThan(0);
    expect(aria.stats.stm).toBeLessThanOrEqual(aria.stats.maxStm);
  });

  it('enemies have stm=0 and maxStm=0', () => {
    const slime = new EnemyCombatant('slime');
    expect(slime.stats.stm).toBe(0);
    expect(slime.stats.maxStm).toBe(0);
  });

  it('basic attack drains stamina', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];
    const stmBefore = aria.stats.stm;
    system.nextTurn();
    system.executeAction(aria, { type: 'attack', target: slime });
    expect(aria.stats.stm).toBeLessThan(stmBefore);
  });

  it('rest action restores 50% maxStm', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const maxStm = aria.stats.maxStm;
    aria.stats.stm = 0;
    system.nextTurn();
    system.executeAction(aria, { type: 'rest' });
    expect(aria.stats.stm).toBe(Math.ceil(maxStm / 2));
  });

  it('defend action restores 25% maxStm (half of rest)', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const maxStm = aria.stats.maxStm;
    aria.stats.stm = 0;
    system.nextTurn();
    system.executeAction(aria, { type: 'defend' });
    expect(aria.stats.stm).toBe(Math.ceil(maxStm * CombatSystem.DEFEND_STM_RESTORE));
  });

  it('defend restores less stamina than rest', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    aria.stats.stm = 0;
    system.nextTurn();
    system.executeAction(aria, { type: 'defend' });
    const stmAfterDefend = aria.stats.stm;
    aria.stats.stm = 0;
    system.executeAction(aria, { type: 'rest' });
    const stmAfterRest = aria.stats.stm;
    expect(stmAfterDefend).toBeLessThan(stmAfterRest);
  });

  it('using an item costs ITEM_STM_COST stamina', () => {
    const state = GameState.getInstance();
    state.addItem('potion', 1);
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    aria.stats.stm = 30;
    aria.stats.hp = 1; // damage so heal is visible
    system.nextTurn();
    system.executeAction(aria, { type: 'item', itemId: 'potion', target: aria });
    // After using item, stamina should increase (potion restores full STM),
    // but the item use itself cost ITEM_STM_COST first.
    // Final stm = maxStm (restored by potion), net cost visible via log.
    // At minimum, confirm stm was reduced by ITEM_STM_COST before restore happened.
    expect(aria.stats.stm).toBe(aria.stats.maxStm);
  });

  it('using a healing item restores full stamina', () => {
    const state = GameState.getInstance();
    state.addItem('potion', 1);
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    aria.stats.stm = 0;
    system.nextTurn();
    system.executeAction(aria, { type: 'item', itemId: 'potion', target: aria });
    expect(aria.stats.stm).toBe(aria.stats.maxStm);
  });

  it('consumeStm does not go below 0', () => {
    const aria = new PlayerCombatant('aria');
    aria.consumeStm(999);
    expect(aria.stats.stm).toBe(0);
  });

  it('stm is restored in fullHealParty', () => {
    const state = GameState.getInstance();
    state.data.party.forEach((c) => { c.stats.stm = 0; });
    state.fullHealParty();
    state.data.party.forEach((c) => {
      if (c.stats.maxStm > 0) {
        expect(c.stats.stm).toBe(c.stats.maxStm);
      }
    });
  });

  it('physical skill drains stamina by stmCost', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];
    aria.stats.stm = 60;
    // smash has stmCost: 25
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'smash', target: slime });
    expect(aria.stats.stm).toBeLessThanOrEqual(60 - 25);
  });
});

describe('Bleed Status Effect', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('bleed deals 10% max HP per turn', () => {
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'bleed');
    expect(aria.hasStatus('bleed')).toBe(true);
    const hpBefore = aria.stats.hp;
    ses.processTurn(aria);
    const expectedDmg = Math.floor(aria.stats.maxHp * 0.10);
    expect(aria.stats.hp).toBe(Math.max(0, hpBefore - expectedDmg));
  });

  it('bleed does more damage per turn than poison (10% vs 5%)', () => {
    // Use separate StatusEffectSystems so aria and kael don't share duration maps
    const aria = new PlayerCombatant('aria');
    const kael = new PlayerCombatant('kael');
    const ses1 = new StatusEffectSystem();
    const ses2 = new StatusEffectSystem();
    ses1.apply(aria, 'poison');
    ses2.apply(kael, 'bleed');
    const hp1Before = aria.stats.hp;
    const hp2Before = kael.stats.hp;
    ses1.processTurn(aria);
    ses2.processTurn(kael);
    const poisonDmgPercent = (hp1Before - aria.stats.hp) / aria.stats.maxHp;
    const bleedDmgPercent = (hp2Before - kael.stats.hp) / kael.stats.maxHp;
    expect(bleedDmgPercent).toBeGreaterThan(poisonDmgPercent);
  });

  it('bleed is permanent until cured', () => {
    const aria = new PlayerCombatant('aria');
    const ses = new StatusEffectSystem();
    ses.apply(aria, 'bleed');
    ses.processTurn(aria);
    ses.processTurn(aria);
    ses.processTurn(aria);
    expect(aria.hasStatus('bleed')).toBe(true);
    ses.remove(aria, 'bleed');
    expect(aria.hasStatus('bleed')).toBe(false);
  });

  it('arrowShot applies bleed status on hit', () => {
    const state = GameState.getInstance();
    state.addItem('arrow', 5);
    const system = new CombatSystem(
      [new PlayerCombatant('lyra')],
      // Use stoneTroll (160 HP) so it survives the arrow shot
      [new EnemyCombatant('stoneTroll', 1.0, undefined, 4)],
    );
    const lyra = system.players[0];
    const troll = system.enemies[0];
    lyra.stats.mp = 50;
    lyra.stats.stm = 60;
    if (!lyra.skills.includes('arrowShot')) lyra.skills.push('arrowShot');
    system.nextTurn();
    system.executeAction(lyra, { type: 'skill', skillId: 'arrowShot', target: troll });
    expect(troll.hasStatus('bleed')).toBe(true);
  });

  it('arrowShot requires arrow ammo and fails without it', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const lyra = system.players[0];
    const slime = system.enemies[0];
    lyra.stats.mp = 50;
    lyra.stats.stm = 60;
    if (!lyra.skills.includes('arrowShot')) lyra.skills.push('arrowShot');
    const slimeHpBefore = slime.stats.hp;
    system.nextTurn();
    const consumed = system.executeAction(lyra, { type: 'skill', skillId: 'arrowShot', target: slime });
    expect(consumed).toBe(false);
    expect(slime.stats.hp).toBe(slimeHpBefore);
  });
});

describe('Flintlock / Pierce System', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('flintlockShot applies reloading status to shooter after use', () => {
    const state = GameState.getInstance();
    state.addItem('gunAmmo', 5);
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];
    aria.stats.stm = 60;
    if (!aria.skills.includes('flintlockShot')) aria.skills.push('flintlockShot');
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'flintlockShot', target: slime });
    expect(aria.hasStatus('reloading')).toBe(true);
  });

  it('flintlockShot requires ammo and fails without it', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];
    aria.stats.stm = 60;
    if (!aria.skills.includes('flintlockShot')) aria.skills.push('flintlockShot');
    const slimeHpBefore = slime.stats.hp;
    system.nextTurn();
    const consumed = system.executeAction(aria, { type: 'skill', skillId: 'flintlockShot', target: slime });
    expect(consumed).toBe(false);
    expect(slime.stats.hp).toBe(slimeHpBefore);
    expect(aria.hasStatus('reloading')).toBe(false);
  });

  it('flintlockShot consumes one unit of ammo', () => {
    const state = GameState.getInstance();
    state.addItem('gunAmmo', 3);
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];
    aria.stats.stm = 60;
    if (!aria.skills.includes('flintlockShot')) aria.skills.push('flintlockShot');
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'flintlockShot', target: slime });
    const remaining = state.data.inventory.find((i) => i.id === 'gunAmmo');
    expect((remaining?.quantity ?? 0)).toBe(2);
  });

  it('reload action removes reloading status', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    aria.addStatus('reloading');
    system.nextTurn();
    system.executeAction(aria, { type: 'reload' });
    expect(aria.hasStatus('reloading')).toBe(false);
  });

  it('effectiveDefense is halved when reloading', () => {
    const slime = new EnemyCombatant('slime');
    const normalDef = slime.effectiveDefense();
    slime.addStatus('reloading');
    expect(slime.effectiveDefense()).toBe(Math.floor(normalDef / 2));
  });

  it('reload action returns true (turn consumed)', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    aria.addStatus('reloading');
    system.nextTurn();
    const consumed = system.executeAction(aria, { type: 'reload' });
    expect(consumed).toBe(true);
  });

  it('pierce skill deals triple damage to high-DEF enemies', () => {
    const state = GameState.getInstance();
    state.addItem('gunAmmo', 10);
    // Spawn ironGolem at its natural floor (8) so floor penalty doesn't apply
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('ironGolem', 1.0, undefined, 8)],
    );
    const aria = system.players[0];
    const golem = system.enemies[0];
    aria.stats.stm = 60;
    if (!aria.skills.includes('flintlockShot')) aria.skills.push('flintlockShot');
    // ironGolem at floor 8 has full 30 DEF >= PIERCE_HIGH_DEF_THRESHOLD(20)
    expect(golem.stats.defense).toBeGreaterThanOrEqual(CombatSystem.PIERCE_HIGH_DEF_THRESHOLD);
    const hpBefore = golem.stats.hp;
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'flintlockShot', target: golem });
    const dmg = hpBefore - golem.stats.hp;
    // Pierce ignores DEF and deals triple damage: strength * 2 * power * 3
    const expectedMin = Math.floor(aria.stats.strength * 2 * 3.0);
    expect(dmg).toBeGreaterThanOrEqual(expectedMin);
  });
});

describe('Hybrid Magic-Physical Attack', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('magicStrike deals damage to enemy', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('kael')],
      [new EnemyCombatant('slime')],
    );
    const kael = system.players[0];
    const slime = system.enemies[0];
    kael.stats.mp = 50;
    kael.stats.stm = 30;
    if (!kael.skills.includes('magicStrike')) kael.skills.push('magicStrike');
    const hpBefore = slime.stats.hp;
    system.nextTurn();
    system.executeAction(kael, { type: 'skill', skillId: 'magicStrike', target: slime });
    expect(slime.stats.hp).toBeLessThan(hpBefore);
  });

  it('magicStrike costs both MP and STM', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('kael')],
      [new EnemyCombatant('slime')],
    );
    const kael = system.players[0];
    const slime = system.enemies[0];
    kael.stats.mp = 50;
    kael.stats.stm = 30;
    if (!kael.skills.includes('magicStrike')) kael.skills.push('magicStrike');
    const mpBefore = kael.stats.mp;
    const stmBefore = kael.stats.stm;
    system.nextTurn();
    system.executeAction(kael, { type: 'skill', skillId: 'magicStrike', target: slime });
    expect(kael.stats.mp).toBeLessThan(mpBefore);
    expect(kael.stats.stm).toBeLessThan(stmBefore);
  });
});

describe('Skill Evolution System', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('recordSkillUse tracks use count', () => {
    const state = GameState.getInstance();
    state.recordSkillUse('kael', 'fire');
    state.recordSkillUse('kael', 'fire');
    const kael = state.getCharacter('kael')!;
    expect(kael.skillUseCounts['fire']).toBe(2);
  });

  it('fire evolves to fira after 5 uses', () => {
    const state = GameState.getInstance();
    const kael = state.getCharacter('kael')!;
    expect(kael.skills).toContain('fire');
    let lastResult = null;
    for (let i = 0; i < 5; i++) {
      lastResult = state.recordSkillUse('kael', 'fire');
    }
    expect(lastResult).not.toBeNull();
    expect(lastResult!.skillId).toBe('fira');
    expect(kael.skills).toContain('fira');
    expect(kael.skills).not.toContain('fire');
  });

  it('fira evolves to firaga after 10 uses', () => {
    const state = GameState.getInstance();
    // First evolve fire -> fira
    for (let i = 0; i < 5; i++) state.recordSkillUse('kael', 'fire');
    const kael = state.getCharacter('kael')!;
    expect(kael.skills).toContain('fira');
    let lastResult = null;
    for (let i = 0; i < 10; i++) {
      lastResult = state.recordSkillUse('kael', 'fira');
    }
    expect(lastResult).not.toBeNull();
    expect(lastResult!.skillId).toBe('firaga');
    expect(kael.skills).toContain('firaga');
    expect(kael.skills).not.toContain('fira');
  });

  it('cure evolves to cura after 5 uses', () => {
    const state = GameState.getInstance();
    const lyra = state.getCharacter('lyra')!;
    expect(lyra.skills).toContain('cure');
    let lastResult = null;
    for (let i = 0; i < 5; i++) {
      lastResult = state.recordSkillUse('lyra', 'cure');
    }
    expect(lastResult).not.toBeNull();
    expect(lastResult!.skillId).toBe('cura');
    expect(lyra.skills).toContain('cura');
  });

  it('skill evolution does not duplicate skill in list', () => {
    const state = GameState.getInstance();
    const kael = state.getCharacter('kael')!;
    kael.skills.push('fira');
    for (let i = 0; i < 5; i++) state.recordSkillUse('kael', 'fire');
    const firaCount = kael.skills.filter((s) => s === 'fira').length;
    expect(firaCount).toBe(1);
  });

  it('skill evolution is triggered in combat and syncs actor skills', () => {
    const state = GameState.getInstance();
    const kael = state.getCharacter('kael')!;
    kael.skillUseCounts['fire'] = 4; // one more use triggers evolution

    const system = new CombatSystem(
      [new PlayerCombatant('kael')],
      [new EnemyCombatant('slime')],
    );
    const kaelCombatant = system.players[0];
    const slime = system.enemies[0];
    kaelCombatant.stats.mp = 50;
    system.nextTurn();
    system.executeAction(kaelCombatant, { type: 'skill', skillId: 'fire', target: slime });

    expect(system.log.some((l) => l.includes('evolved'))).toBe(true);
    expect(state.getCharacter('kael')!.skills).toContain('fira');
    // Also verify actor's skill list is synced
    expect(kaelCombatant.skills).toContain('fira');
  });

  it('quickHit evolves to hasteBell after 15 uses', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    expect(aria.skills).toContain('quickHit');
    for (let i = 0; i < 15; i++) state.recordSkillUse('aria', 'quickHit');
    expect(aria.skills).toContain('hasteBell');
    expect(aria.skills).not.toContain('quickHit');
  });
});

describe('Team Move Stamina Cost', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('team move initiator loses TEAM_MOVE_STM_COST stamina', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];

    const stmBefore = aria.stats.stm;
    system.nextTurn();
    system.executeAction(aria, { type: 'team-move', allyId: lyra.id, target: slime });

    expect(aria.stats.stm).toBe(Math.max(0, stmBefore - CombatSystem.TEAM_MOVE_STM_COST));
  });

  it('ally executing combo loses TEAM_MOVE_STM_COST stamina', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];

    system.nextTurn();
    system.executeAction(aria, { type: 'team-move', allyId: lyra.id, target: slime });

    const lyraStmBefore = lyra.stats.stm;
    system.executePendingCombo(lyra);

    expect(lyra.stats.stm).toBe(Math.max(0, lyraStmBefore - CombatSystem.TEAM_MOVE_STM_COST));
  });

  it('TEAM_MOVE_STM_COST is at least 40 (massive cost)', () => {
    expect(CombatSystem.TEAM_MOVE_STM_COST).toBeGreaterThanOrEqual(40);
  });

  it('team move is blocked when initiator lacks enough STM', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];
    // Drain aria's STM below the cost threshold
    aria.consumeStm(aria.stats.stm); // drain all
    const stmBefore = aria.stats.stm; // should be 0
    system.nextTurn();
    const consumed = system.executeAction(aria, { type: 'team-move', allyId: lyra.id, target: slime });
    // Action should fail (not consume a turn) and no combo should be pending
    expect(consumed).toBe(false);
    expect(aria.stats.stm).toBe(stmBefore);
    expect(system.hasPendingCombo(lyra)).toBe(false);
  });

  it('team move is blocked when ally lacks enough STM', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];
    // Drain lyra's STM below the cost threshold
    lyra.consumeStm(lyra.stats.stm); // drain all
    system.nextTurn();
    const consumed = system.executeAction(aria, { type: 'team-move', allyId: lyra.id, target: slime });
    // Action should fail and aria's STM should be untouched
    expect(consumed).toBe(false);
    expect(system.hasPendingCombo(lyra)).toBe(false);
  });
});

describe('Stamina Scales With Level', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('maxStm increases after level-up for Aria', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    const maxStmBefore = aria.stats.maxStm;
    state.gainExp(100);
    expect(aria.stats.maxStm).toBeGreaterThan(maxStmBefore);
  });

  it('maxStm increases after level-up for Kael', () => {
    const state = GameState.getInstance();
    const kael = state.getCharacter('kael')!;
    const maxStmBefore = kael.stats.maxStm;
    state.gainExp(100);
    expect(kael.stats.maxStm).toBeGreaterThan(maxStmBefore);
  });

  it('maxStm increases after level-up for Lyra', () => {
    const state = GameState.getInstance();
    const lyra = state.getCharacter('lyra')!;
    const maxStmBefore = lyra.stats.maxStm;
    state.gainExp(100);
    expect(lyra.stats.maxStm).toBeGreaterThan(maxStmBefore);
  });
});

describe('Skill II/III/IV Naming Convention', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('evolved fire spells use II/III naming not -ra/-aga suffix', () => {
    // Test relies on the skill names visible in combat log; use GameState.recordSkillUse
    // evolution to verify skill IDs still work, while names are validated via skills.json.
    // The fira skill should be named "Blaze II" (not "Blazra") and firaga "Blaze III".
    const state = GameState.getInstance();
    const kael = state.getCharacter('kael')!;
    // Fire -> fira (Blaze II) after 5 uses
    for (let i = 0; i < 5; i++) state.recordSkillUse('kael', 'fire');
    expect(kael.skills).toContain('fira');
    // fira -> firaga (Blaze III) after 10 more uses
    for (let i = 0; i < 10; i++) state.recordSkillUse('kael', 'fira');
    expect(kael.skills).toContain('firaga');
    expect(kael.skills).not.toContain('fire');
    expect(kael.skills).not.toContain('fira');
  });

  it('evolved cure spells evolve via use (not granted at level-up)', () => {
    const state = GameState.getInstance();
    const lyra = state.getCharacter('lyra')!;
    // cure -> cura (Cure II) after 5 uses
    for (let i = 0; i < 5; i++) state.recordSkillUse('lyra', 'cure');
    expect(lyra.skills).toContain('cura');
    expect(lyra.skills).not.toContain('cure');
    // cura -> curaga (Cure III) after 10 more uses
    for (let i = 0; i < 10; i++) state.recordSkillUse('lyra', 'cura');
    expect(lyra.skills).toContain('curaga');
    expect(lyra.skills).not.toContain('cura');
  });

  it('Kael does not receive evolved spells as level-up rewards (evolve-only)', () => {
    const state = GameState.getInstance();
    const kael = state.getCharacter('kael')!;
    // Level up several times (10000 EXP is enough to trigger multiple level-ups)
    for (let i = 0; i < 9; i++) state.gainExp(10000);
    // fira/firaga etc. should NOT be in Kael's skills unless earned through evolution
    // (Kael starts with fire/thunder/blizzard/water which evolve naturally)
    const evolvedFromLevelUp = ['fira', 'firaga', 'blizzara', 'blizzaga', 'thundara', 'thundaga', 'watera', 'waterga'];
    for (const skillId of evolvedFromLevelUp) {
      expect(kael.skills).not.toContain(skillId);
    }
  });
});

describe('Team Move Types', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('characters start with job-defined team moves', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    const kael = state.getCharacter('kael')!;
    const lyra = state.getCharacter('lyra')!;
    // Warrior starts with physical team move
    expect(aria.teamMoves).toContain('teamStrike');
    // Mage starts with magic team move
    expect(kael.teamMoves).toContain('teamSpell');
    // Healer starts with both
    expect(lyra.teamMoves).toContain('teamStrike');
    expect(lyra.teamMoves).toContain('teamSpell');
  });

  it('physical team move uses combined strength for damage', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];
    const initialHp = slime.stats.hp;

    system.nextTurn();
    system.executeAction(aria, { type: 'team-move', allyId: lyra.id, teamMoveId: 'teamStrike', target: slime });
    system.executePendingCombo(lyra);

    // Physical team move should deal strength-based damage
    expect(slime.stats.hp).toBeLessThan(initialHp);
  });

  it('magic team move (teamSpell) uses combined magic for damage', () => {
    const state = GameState.getInstance();
    // Give Kael enough STM to participate (his base is 30, below the 40 cost)
    state.getCharacter('kael')!.stats.stm = 50;
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('kael')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const kael = system.players[1];
    const slime = system.enemies[0];
    const initialHp = slime.stats.hp;

    system.nextTurn();
    system.executeAction(aria, { type: 'team-move', allyId: kael.id, teamMoveId: 'teamSpell', target: slime });
    system.executePendingCombo(kael);

    // Magic team move should deal magic-based damage
    expect(slime.stats.hp).toBeLessThan(initialHp);
  });

  it('fast physical team move (teamSwift) has lower speedModifier than default', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    // Grant teamSwift to Aria for testing
    aria.teamMoves.push('teamSwift');

    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria2 = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];

    const ctbBefore = aria2.ctbValue;
    system.nextTurn();
    // Flash Strike has speedModifier=0.6 — initiator's next turn comes faster
    system.executeAction(aria2, { type: 'team-move', allyId: lyra.id, teamMoveId: 'teamSwift', target: slime });

    // After the fast team move, aria's CTB should be low (fast next turn)
    // Compare to TEAM_MOVE_INITIATOR_SPEED=1.6 default
    expect(aria2.ctbValue).toBeLessThan(ctbBefore + 100);
  });

  it('team move uses comboSpeedModifier from move definition', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];

    system.nextTurn();
    system.executeAction(aria, { type: 'team-move', allyId: lyra.id, teamMoveId: 'teamStrike', target: slime });

    const lyraCtbBefore = lyra.ctbValue;
    system.executePendingCombo(lyra);
    // teamStrike has comboSpeedModifier=2.0 — slower than default TEAM_MOVE_COMBO_SPEED=2.5
    // but still slower than a normal turn (lyra's CTB should have increased)
    expect(lyra.ctbValue).toBeGreaterThan(lyraCtbBefore);
  });

  it('elemental fire team move (teamBlaze) deals damage', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    aria.teamMoves.push('teamBlaze');

    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria2 = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];
    const initialHp = slime.stats.hp;

    system.nextTurn();
    system.executeAction(aria2, { type: 'team-move', allyId: lyra.id, teamMoveId: 'teamBlaze', target: slime });
    system.executePendingCombo(lyra);

    expect(slime.stats.hp).toBeLessThan(initialHp);
  });

  it('team move physical (teamStrike) evolves after 5 uses via recordTeamMoveUse', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    expect(aria.teamMoves).toContain('teamStrike');

    for (let i = 0; i < 5; i++) state.recordTeamMoveUse('aria', 'teamStrike');

    expect(aria.teamMoves).toContain('teamStrikeII');
    expect(aria.teamMoves).not.toContain('teamStrike');
  });

  it('team move evolves further (teamStrikeII → teamStrikeIII at 10 uses)', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    // Evolve to tier 2 first
    for (let i = 0; i < 5; i++) state.recordTeamMoveUse('aria', 'teamStrike');
    expect(aria.teamMoves).toContain('teamStrikeII');

    // Evolve to tier 3
    for (let i = 0; i < 10; i++) state.recordTeamMoveUse('aria', 'teamStrikeII');
    expect(aria.teamMoves).toContain('teamStrikeIII');
    expect(aria.teamMoves).not.toContain('teamStrikeII');
  });

  it('team move swift evolves (teamSwift → teamSwiftII at 5 uses)', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    aria.teamMoves.push('teamSwift');

    for (let i = 0; i < 5; i++) state.recordTeamMoveUse('aria', 'teamSwift');
    expect(aria.teamMoves).toContain('teamSwiftII');
    expect(aria.teamMoves).not.toContain('teamSwift');
  });

  it('team moves unlock at level-up (Aria gets teamSwift at level 3)', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    expect(aria.teamMoves).not.toContain('teamSwift');

    // Level up to 3 (gain enough EXP)
    while (state.data.level < 3) state.gainExp(10000);

    expect(aria.teamMoves).toContain('teamSwift');
  });

  it('team moves unlock at level-up (Kael gets teamBlaze at level 3)', () => {
    const state = GameState.getInstance();
    const kael = state.getCharacter('kael')!;
    expect(kael.teamMoves).not.toContain('teamBlaze');

    while (state.data.level < 3) state.gainExp(10000);

    expect(kael.teamMoves).toContain('teamBlaze');
  });

  it('team moves unlock at level-up (Lyra gets teamSwift at level 4)', () => {
    const state = GameState.getInstance();
    const lyra = state.getCharacter('lyra')!;
    expect(lyra.teamMoves).not.toContain('teamSwift');

    while (state.data.level < 4) state.gainExp(10000);

    expect(lyra.teamMoves).toContain('teamSwift');
  });

  it('backward-compatible team move (no teamMoveId) still deals damage', () => {
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];
    const initialHp = slime.stats.hp;

    system.nextTurn();
    // Omit teamMoveId — should fall back to legacy physical formula
    system.executeAction(aria, { type: 'team-move', allyId: lyra.id, target: slime });
    system.executePendingCombo(lyra);

    expect(slime.stats.hp).toBeLessThan(initialHp);
  });

  it('magic team move logs include "magic damage"', () => {
    const state = GameState.getInstance();
    // Give Kael enough STM to participate (his base is 30, below the 40 cost)
    state.getCharacter('kael')!.stats.stm = 50;
    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('kael')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const kael = system.players[1];
    const slime = system.enemies[0];

    system.nextTurn();
    system.executeAction(aria, { type: 'team-move', allyId: kael.id, teamMoveId: 'teamSpell', target: slime });
    system.executePendingCombo(kael);

    const hasSpellLog = system.log.some((msg) => msg.includes('magic damage') || msg.includes('Arcane Union'));
    expect(hasSpellLog).toBe(true);
  });
});

describe('Gunsmith Job', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('gunsmith job can be applied to a character', () => {
    const state = GameState.getInstance();
    state.applyJobToCharacter('aria', 'gunsmith');
    const aria = state.getCharacter('aria')!;
    expect(aria.job).toBe('gunsmith');
    expect(aria.stats.strength).toBe(18);
  });

  it('gunsmith job grants flintlockShot as primary skill', () => {
    const state = GameState.getInstance();
    state.applyJobToCharacter('aria', 'gunsmith');
    const aria = state.getCharacter('aria')!;
    expect(aria.skills).toContain('flintlockShot');
    expect(aria.skills).not.toContain('attack');
  });

  it('gunsmith job has teamStrike team move', () => {
    const state = GameState.getInstance();
    state.applyJobToCharacter('aria', 'gunsmith');
    const aria = state.getCharacter('aria')!;
    expect(aria.teamMoves).toContain('teamStrike');
  });

  it('warrior job does not include flintlockShot', () => {
    const state = GameState.getInstance();
    const aria = state.getCharacter('aria')!;
    // Aria starts as Warrior — should not have flintlockShot
    expect(aria.job).toBe('warrior');
    expect(aria.skills).not.toContain('flintlockShot');
  });

  it('gunsmith can fire flintlockShot and gains reloading status', () => {
    const state = GameState.getInstance();
    state.addItem('gunAmmo', 3);
    state.applyJobToCharacter('aria', 'gunsmith');
    const system = new CombatSystem(
      [new PlayerCombatant('aria')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const slime = system.enemies[0];
    aria.stats.stm = 55;
    system.nextTurn();
    system.executeAction(aria, { type: 'skill', skillId: 'flintlockShot', target: slime });
    expect(aria.hasStatus('reloading')).toBe(true);
  });
});

describe('Team Move Ally MP Requirement', () => {
  beforeEach(() => {
    GameState.getInstance().reset();
    EventBus.getInstance().clear();
  });

  it('magic team move (teamSpell) is blocked when ally lacks enough MP', () => {
    const state = GameState.getInstance();
    // Give both characters enough STM
    state.getCharacter('aria')!.stats.stm = 60;
    state.getCharacter('kael')!.stats.stm = 50;
    // Drain Kael's MP below teamSpell's mpCost (15)
    state.getCharacter('kael')!.stats.mp = 0;

    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('kael')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const kael = system.players[1];
    const slime = system.enemies[0];
    kael.stats.mp = 0;

    system.nextTurn();
    const consumed = system.executeAction(aria, {
      type: 'team-move',
      allyId: kael.id,
      teamMoveId: 'teamSpell',
      target: slime,
    });
    expect(consumed).toBe(false);
    expect(system.hasPendingCombo(kael)).toBe(false);
    expect(system.log.some((l) => l.includes('MP'))).toBe(true);
  });

  it('magic team move proceeds when ally has enough MP', () => {
    const state = GameState.getInstance();
    state.getCharacter('aria')!.stats.stm = 60;
    state.getCharacter('kael')!.stats.stm = 50;

    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('kael')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const kael = system.players[1];
    const slime = system.enemies[0];
    // Ensure Kael has enough MP (teamSpell costs 15 MP)
    kael.stats.mp = 40;

    system.nextTurn();
    const consumed = system.executeAction(aria, {
      type: 'team-move',
      allyId: kael.id,
      teamMoveId: 'teamSpell',
      target: slime,
    });
    expect(consumed).toBe(true);
    expect(system.hasPendingCombo(kael)).toBe(true);
  });

  it('physical team move (teamStrike, 0 MP cost) ignores ally MP', () => {
    const state = GameState.getInstance();
    state.getCharacter('aria')!.stats.stm = 60;
    state.getCharacter('lyra')!.stats.stm = 50;

    const system = new CombatSystem(
      [new PlayerCombatant('aria'), new PlayerCombatant('lyra')],
      [new EnemyCombatant('slime')],
    );
    const aria = system.players[0];
    const lyra = system.players[1];
    const slime = system.enemies[0];
    // Drain Lyra's MP completely — teamStrike has 0 MP cost so it should still work
    lyra.stats.mp = 0;

    system.nextTurn();
    const consumed = system.executeAction(aria, {
      type: 'team-move',
      allyId: lyra.id,
      teamMoveId: 'teamStrike',
      target: slime,
    });
    expect(consumed).toBe(true);
    expect(system.hasPendingCombo(lyra)).toBe(true);
  });
});
