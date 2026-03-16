/** Defines a single accomplishment that can be unlocked. */
export interface Accomplishment {
  id: string;
  name: string;
  description: string;
}

/** All possible accomplishments in the game. */
export const ALL_ACCOMPLISHMENTS: Accomplishment[] = [
  { id: 'first_blood',   name: 'First Blood',    description: 'Win your first battle.' },
  { id: 'boss_slayer',   name: 'Boss Slayer',     description: 'Defeat a floor boss.' },
  { id: 'floor_3',       name: 'Explorer',        description: 'Reach floor 3.' },
  { id: 'floor_5',       name: 'Deep Delver',     description: 'Reach floor 5.' },
  { id: 'floor_10',      name: 'Dungeon Master',  description: 'Reach floor 10.' },
  { id: 'kills_10',      name: 'Slayer',          description: 'Defeat 10 enemies.' },
  { id: 'kills_50',      name: 'Decimator',       description: 'Defeat 50 enemies.' },
  { id: 'kills_100',     name: 'Exterminator',    description: 'Defeat 100 enemies.' },
  { id: 'score_1000',    name: 'Rising Star',     description: 'Reach a score of 1 000.' },
  { id: 'score_5000',    name: 'Legend',          description: 'Reach a score of 5 000.' },
  { id: 'score_10000',   name: 'Mythic',          description: 'Reach a score of 10 000.' },
  { id: 'level_5',       name: 'Veteran',         description: 'Reach party level 5.' },
  { id: 'level_10',      name: 'Champion',        description: 'Reach party level 10.' },
  { id: 'killing_blow',  name: 'Overkill',        description: 'Land a killing blow that takes an enemy far into the negative.' },
  { id: 'battles_10',    name: 'Battle-Hardened', description: 'Complete 10 battles.' },
];

const STORAGE_KEY = 'cf_accomplishments';
const KILLS_KEY   = 'cf_total_kills';
const BATTLES_KEY = 'cf_total_battles';

export class AccomplishmentSystem {
  private static instance: AccomplishmentSystem;
  private unlocked: Set<string>;

  private constructor() {
    this.unlocked = this.load();
  }

  static getInstance(): AccomplishmentSystem {
    if (!AccomplishmentSystem.instance) {
      AccomplishmentSystem.instance = new AccomplishmentSystem();
    }
    return AccomplishmentSystem.instance;
  }

  /** Return all currently-unlocked accomplishments in unlock order. */
  getUnlocked(): Accomplishment[] {
    return ALL_ACCOMPLISHMENTS.filter((a) => this.unlocked.has(a.id));
  }

  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }

  /**
   * Unlock an accomplishment by id.
   * Returns true if it was newly unlocked, false if already unlocked.
   */
  unlock(id: string): boolean {
    if (this.unlocked.has(id)) return false;
    this.unlocked.add(id);
    this.save();
    return true;
  }

  // ── Convenience counters stored in localStorage ───────────────────────────

  /** Increment the total enemy-kill counter and unlock kill-count accomplishments. */
  recordKill(): void {
    const kills = this.getCounter(KILLS_KEY) + 1;
    this.setCounter(KILLS_KEY, kills);
    if (kills >= 10)  this.unlock('kills_10');
    if (kills >= 50)  this.unlock('kills_50');
    if (kills >= 100) this.unlock('kills_100');
  }

  /** Increment the total battle counter and unlock battle-count accomplishments. */
  recordBattleWin(): void {
    const battles = this.getCounter(BATTLES_KEY) + 1;
    this.setCounter(BATTLES_KEY, battles);
    if (battles === 1) this.unlock('first_blood');
    if (battles >= 10) this.unlock('battles_10');
  }

  /** Call when the player reaches a new floor number. */
  recordFloor(floor: number): void {
    if (floor >= 3)  this.unlock('floor_3');
    if (floor >= 5)  this.unlock('floor_5');
    if (floor >= 10) this.unlock('floor_10');
  }

  /** Call when the party score changes. */
  recordScore(score: number): void {
    if (score >= 1000)  this.unlock('score_1000');
    if (score >= 5000)  this.unlock('score_5000');
    if (score >= 10000) this.unlock('score_10000');
  }

  /** Call when the party levels up. */
  recordLevel(level: number): void {
    if (level >= 5)  this.unlock('level_5');
    if (level >= 10) this.unlock('level_10');
  }

  /** Call when a boss is defeated. */
  recordBossKill(): void {
    this.unlock('boss_slayer');
  }

  /**
   * Call when a killing blow deals enough damage to put the enemy's HP far into
   * the negative (overkill ≥ enemy max HP × 0.5).
   */
  recordOverkill(): void {
    this.unlock('killing_blow');
  }

  getTotalKills(): number {
    return this.getCounter(KILLS_KEY);
  }

  getTotalBattles(): number {
    return this.getCounter(BATTLES_KEY);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private load(): Set<string> {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const ids = JSON.parse(raw) as string[];
          return new Set(ids);
        }
      }
    } catch {
      // ignore – start fresh
    }
    return new Set();
  }

  private save(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.unlocked]));
      }
    } catch {
      // ignore
    }
  }

  private getCounter(key: string): number {
    try {
      if (typeof localStorage !== 'undefined') {
        return parseInt(localStorage.getItem(key) ?? '0', 10) || 0;
      }
    } catch {
      // ignore
    }
    return 0;
  }

  private setCounter(key: string, value: number): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, String(value));
      }
    } catch {
      // ignore
    }
  }
}
