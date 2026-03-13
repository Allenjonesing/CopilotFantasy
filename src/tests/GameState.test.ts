import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../core/state/GameState';

describe('GameState', () => {
  let state: GameState;

  beforeEach(() => {
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

  it('starts with 2 potions (starting items for the first run)', () => {
    const potions = state.data.inventory.find((i) => i.id === 'potion');
    expect(potions).toBeDefined();
    expect(potions!.quantity).toBe(2);
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
});
