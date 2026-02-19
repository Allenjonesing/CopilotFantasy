export interface Stats {
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  strength: number;
  magic: number;
  defense: number;
  magicDefense: number;
  agility: number;
  luck: number;
}

export abstract class CombatEntity {
  readonly id: string;
  readonly name: string;
  stats: Stats;
  ctbValue: number;
  statusEffects: Set<string> = new Set();
  skills: string[] = [];

  constructor(id: string, name: string, stats: Stats) {
    this.id = id;
    this.name = name;
    this.stats = { ...stats };
    this.ctbValue = 0;
  }

  get isDefeated(): boolean {
    return this.stats.hp <= 0;
  }

  applyDamage(amount: number): void {
    this.stats.hp = Math.max(0, this.stats.hp - amount);
  }

  restoreHp(amount: number): void {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  consumeMp(amount: number): boolean {
    if (this.stats.mp < amount) return false;
    this.stats.mp -= amount;
    return true;
  }

  addStatus(effect: string): void {
    this.statusEffects.add(effect);
  }

  removeStatus(effect: string): void {
    this.statusEffects.delete(effect);
  }

  hasStatus(effect: string): boolean {
    return this.statusEffects.has(effect);
  }

  effectiveAgility(): number {
    let mod = 1.0;
    if (this.hasStatus('haste')) mod *= 2.0;
    if (this.hasStatus('slow')) mod *= 0.5;
    return Math.max(1, Math.floor(this.stats.agility * mod));
  }
}
