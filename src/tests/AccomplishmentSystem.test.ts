import { describe, it, expect, beforeEach } from 'vitest';
import { AccomplishmentSystem, ALL_ACCOMPLISHMENTS } from '../core/state/AccomplishmentSystem';

describe('AccomplishmentSystem', () => {
  let sys: AccomplishmentSystem;

  beforeEach(() => {
    sys = AccomplishmentSystem.getInstance();
    sys.reset();
  });

  it('has a complete list of accomplishments', () => {
    expect(ALL_ACCOMPLISHMENTS.length).toBeGreaterThan(0);
    ALL_ACCOMPLISHMENTS.forEach((a) => {
      expect(a.id).toBeTruthy();
      expect(a.name).toBeTruthy();
      expect(a.description).toBeTruthy();
    });
  });

  it('starts with no unlocked accomplishments after reset', () => {
    expect(sys.getUnlocked()).toHaveLength(0);
  });

  it('unlocks an accomplishment and returns it via getUnlocked', () => {
    const wasNew = sys.unlock('first_blood');
    expect(wasNew).toBe(true);
    expect(sys.getUnlocked()).toHaveLength(1);
    expect(sys.isUnlocked('first_blood')).toBe(true);
  });

  it('does not double-unlock an accomplishment', () => {
    sys.unlock('first_blood');
    const wasNew = sys.unlock('first_blood');
    expect(wasNew).toBe(false);
    expect(sys.getUnlocked()).toHaveLength(1);
  });

  it('recordBattleWin unlocks first_blood on first win', () => {
    sys.recordBattleWin();
    expect(sys.isUnlocked('first_blood')).toBe(true);
  });

  it('recordFloor unlocks correct floor accomplishments', () => {
    sys.recordFloor(3);
    expect(sys.isUnlocked('floor_3')).toBe(true);
    expect(sys.isUnlocked('floor_5')).toBe(false);

    sys.recordFloor(5);
    expect(sys.isUnlocked('floor_5')).toBe(true);

    sys.recordFloor(10);
    expect(sys.isUnlocked('floor_10')).toBe(true);
  });

  it('recordScore unlocks score accomplishments', () => {
    sys.recordScore(999);
    expect(sys.isUnlocked('score_1000')).toBe(false);

    sys.recordScore(1000);
    expect(sys.isUnlocked('score_1000')).toBe(true);
    expect(sys.isUnlocked('score_5000')).toBe(false);

    sys.recordScore(5000);
    expect(sys.isUnlocked('score_5000')).toBe(true);
  });

  it('recordLevel unlocks level accomplishments', () => {
    sys.recordLevel(4);
    expect(sys.isUnlocked('level_5')).toBe(false);

    sys.recordLevel(5);
    expect(sys.isUnlocked('level_5')).toBe(true);
    expect(sys.isUnlocked('level_10')).toBe(false);

    sys.recordLevel(10);
    expect(sys.isUnlocked('level_10')).toBe(true);
  });

  it('recordBossKill unlocks boss_slayer', () => {
    sys.recordBossKill();
    expect(sys.isUnlocked('boss_slayer')).toBe(true);
  });

  it('recordOverkill unlocks killing_blow', () => {
    sys.recordOverkill();
    expect(sys.isUnlocked('killing_blow')).toBe(true);
  });
});
