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

  it('gil starts at 150', () => {
    expect(state.data.gil).toBe(150);
  });

  it('removeItem fails if not enough quantity', () => {
    const result = state.removeItem('nonexistent', 1);
    expect(result).toBe(false);
  });

  it('starting inventory includes potions and ether from lyra', () => {
    const inv = state.data.inventory;
    const potion = inv.find((i) => i.id === 'potion');
    const ether = inv.find((i) => i.id === 'ether');
    expect(potion).toBeDefined();
    expect(ether).toBeDefined();
  });
});
