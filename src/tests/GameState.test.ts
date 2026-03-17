import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../core/state/GameState';

// ── localStorage mock ────────────────────────────────────────────────────────
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
};
Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

describe('GameState', () => {
  let state: GameState;

  beforeEach(() => {
    // Clear localStorage and reset state before each test.
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    state = GameState.getInstance();
    state.reset();
  });

  it('initialises with three party members', () => {
    expect(state.data.party).toHaveLength(3);
  });

  it('party members have valid stats', () => {
    state.data.party.forEach((c) => {
      expect(c.stats.hp).toBeGreaterThan(0);
      expect(c.stats.maxHp).toBeGreaterThan(0);
      expect(c.stats.hp).toBeLessThanOrEqual(c.stats.maxHp);
    });
  });

  it('adds and removes items correctly', () => {
    state.addItem('potion', 3);
    const inv = state.data.inventory;
    const potion = inv.find((i) => i.id === 'potion');
    expect(potion).toBeDefined();
    expect(potion!.quantity).toBeGreaterThanOrEqual(3);

    const removed = state.removeItem('potion', 2);
    expect(removed).toBe(true);
  });

  it('sets and gets flags', () => {
    state.setFlag('met_elder', true);
    expect(state.getFlag('met_elder')).toBe(true);
    expect(state.getFlag('undefined_flag')).toBe(false);
  });

  it('getCharacter returns the correct character', () => {
    const aria = state.getCharacter('aria');
    expect(aria).toBeDefined();
    expect(aria!.name).toBe('Aria');
  });

  it('starts with 0 gold (roguelike — earn from battles)', () => {
    expect(state.data.gold).toBe(0);
  });

  it('removeItem fails if not enough quantity', () => {
    const result = state.removeItem('nonexistent', 1);
    expect(result).toBe(false);
  });

  it('starts with potions, a mana brew, and revival herbs', () => {
    const potions = state.data.inventory.find((i) => i.id === 'potion');
    expect(potions).toBeDefined();
    expect(potions!.quantity).toBe(3);
    const phoenix = state.data.inventory.find((i) => i.id === 'phoenix');
    expect(phoenix).toBeDefined();
    expect(phoenix!.quantity).toBe(2);
    const ether = state.data.inventory.find((i) => i.id === 'ether');
    expect(ether).toBeDefined();
    expect(ether!.quantity).toBe(1);
  });

  it('starts at difficulty level 1 with score 0', () => {
    expect(state.data.difficultyLevel).toBe(1);
    expect(state.data.score).toBe(0);
    expect(state.data.level).toBe(1);
  });

  it('gainExp returns levelUp when threshold crossed', () => {
    const result = state.gainExp(100);
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
  });

  it('addScore accumulates and tracks high score', () => {
    state.addScore(500);
    expect(state.data.score).toBe(500);
    expect(state.data.highScore).toBe(500);
    state.addScore(300);
    expect(state.data.score).toBe(800);
    expect(state.data.highScore).toBe(800);
  });

  it('increaseDifficulty increments difficultyLevel', () => {
    state.increaseDifficulty();
    expect(state.data.difficultyLevel).toBe(2);
  });

  it('getEnemyScale scales with difficulty', () => {
    expect(state.getEnemyScale()).toBe(1.0);
    state.increaseDifficulty();
    expect(state.getEnemyScale()).toBeGreaterThan(1.0);
  });

  it('fullHealParty restores all party HP and MP to max', () => {
    // Damage and drain MP from party members
    state.data.party.forEach((c) => {
      c.stats.hp = 1;
      c.stats.mp = 0;
    });
    state.fullHealParty();
    state.data.party.forEach((c) => {
      expect(c.stats.hp).toBe(c.stats.maxHp);
      expect(c.stats.mp).toBe(c.stats.maxMp);
    });
  });

  // ── Autosave / persistence ──────────────────────────────────────────────
  it('hasSavedGame returns false when no save exists', () => {
    expect(state.hasSavedGame()).toBe(false);
  });

  it('saveGame persists state and hasSavedGame returns true afterwards', () => {
    state.addGold(999);
    state.saveGame();
    expect(state.hasSavedGame()).toBe(true);
  });

  it('loadSavedGame restores previously saved state', () => {
    state.addGold(777);
    state.saveGame();
    const snapshot = localStorageStore['cf_save'];

    // Reset wipes memory AND the save; restore the snapshot manually.
    state.reset();
    localStorageStore['cf_save'] = snapshot;

    const loaded = state.loadSavedGame();
    expect(loaded).toBe(true);
    expect(state.data.gold).toBe(777);
  });

  it('loadSavedGame returns false when no save exists', () => {
    const result = state.loadSavedGame();
    expect(result).toBe(false);
  });

  it('clearSavedGame removes the save', () => {
    state.saveGame();
    expect(state.hasSavedGame()).toBe(true);
    state.clearSavedGame();
    expect(state.hasSavedGame()).toBe(false);
  });

  it('reset clears the saved game', () => {
    state.saveGame();
    expect(state.hasSavedGame()).toBe(true);
    state.reset();
    expect(state.hasSavedGame()).toBe(false);
  });

  // ── pendingBattle (mid-battle autosave) ─────────────────────────────────
  it('starts with pendingBattle null', () => {
    expect(state.data.pendingBattle).toBeNull();
  });

  it('pendingBattle is saved and loaded correctly', () => {
    state.data.pendingBattle = {
      enemies: [{ typeId: 'slime', displayName: 'Slime', variantScale: 1.0 }],
      battleType: 'normal',
      difficultyLevel: 1,
      enemyHp: [18],
      enemyMp: [0],
      enemyCtb: [125],
      enemyStatuses: [['poison']],
      enemyStatusDurations: [{ poison: 2 }],
      playerCtb: [111, 143],
      playerStatuses: [[], []],
      playerStatusDurations: [{}, {}],
    };
    state.saveGame();
    const snapshot = localStorageStore['cf_save'];

    state.reset();
    localStorageStore['cf_save'] = snapshot;

    const loaded = state.loadSavedGame();
    expect(loaded).toBe(true);
    expect(state.data.pendingBattle).not.toBeNull();
    expect(state.data.pendingBattle!.enemies[0].typeId).toBe('slime');
    expect(state.data.pendingBattle!.enemyHp[0]).toBe(18);
    expect(state.data.pendingBattle!.enemyCtb![0]).toBe(125);
    expect(state.data.pendingBattle!.enemyStatuses![0]).toEqual(['poison']);
    expect(state.data.pendingBattle!.enemyStatusDurations![0]).toEqual({ poison: 2 });
    expect(state.data.pendingBattle!.playerCtb![0]).toBe(111);
    expect(state.data.pendingBattle!.playerCtb![1]).toBe(143);
  });

  it('increaseDifficulty clears pendingBattle', () => {
    state.data.pendingBattle = {
      enemies: [{ typeId: 'slime', displayName: 'Slime', variantScale: 1.0 }],
      battleType: 'normal',
      difficultyLevel: 1,
      enemyHp: [18],
      enemyMp: [0],
    };
    state.increaseDifficulty();
    expect(state.data.pendingBattle).toBeNull();
  });

  it('flee positions are restored from preCombatX/Y after save/load', () => {
    // Simulate entering combat from tile (5,7)
    state.data.playerX = 5;
    state.data.playerY = 7;
    state.data.preCombatX = 5;
    state.data.preCombatY = 7;
    state.saveGame();
    const snapshot = localStorageStore['cf_save'];

    state.reset();
    localStorageStore['cf_save'] = snapshot;
    state.loadSavedGame();

    expect(state.data.preCombatX).toBe(5);
    expect(state.data.preCombatY).toBe(7);
  });
});
