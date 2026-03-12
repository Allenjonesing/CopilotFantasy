import charactersData from '../../data/characters.json';
import itemsData from '../../data/items.json';

export interface CharacterStats {
  hp: number;
  mp: number;
  maxHp: number;
  maxMp: number;
  strength: number;
  magic: number;
  defense: number;
  magicDefense: number;
  agility: number;
  luck: number;
}

export interface CharacterState {
  id: string;
  name: string;
  stats: CharacterStats;
  skills: string[];
  statusEffects: string[];
  alive: boolean;
}

export interface InventoryItem {
  id: string;
  quantity: number;
}

export interface GameStateData {
  party: CharacterState[];
  inventory: InventoryItem[];
  gold: number;
  score: number;
  highScore: number;
  difficultyLevel: number;
  level: number;
  exp: number;
  expToNext: number;
  currentMap: string;
  playerX: number;
  playerY: number;
  flags: Record<string, boolean>;
  /** Stable RNG seed for the current floor's map layout. */
  mapSeed: number;
  /** Player tile position saved just before entering combat (null = new floor). */
  preCombatX: number | null;
  preCombatY: number | null;
  /** Enemies still alive on the current floor; null means "generate fresh". */
  pendingMapEnemies: PersistentMapEnemy[] | null;
  /** Pickups still uncollected on the current floor; null means "generate fresh". */
  pendingPickups: PersistentPickup[] | null;
  /**
   * Shopkeeper state on the current floor.
   * null        = not yet determined (fresh floor).
   * false       = rolled and no shopkeeper this floor.
   * {x,y,inventory} = shopkeeper at this tile with a fixed predetermined inventory.
   */
  pendingShopkeeper: { x: number; y: number; inventory: string[] } | false | null;
}

export interface SkillGain {
  charName: string;
  skillId: string;
}

export interface LevelUpResult {
  leveledUp: boolean;
  newLevel: number;
  skillsGained: SkillGain[];
}

export interface PersistentMapEnemy {
  id: string;
  typeId: string;
  displayName: string;
  variantScale: number;
  x: number;
  y: number;
  /** True for the floor boss that guards the exit. */
  isGuard?: boolean;
  homeX?: number;
  homeY?: number;
}

export interface PersistentPickup {
  id: string;
  kind: 'coin' | 'chest';
  gold: number;
  itemId?: string;
  x: number;
  y: number;
}

export class GameState {
  private static instance: GameState;
  private state!: GameStateData;

  private constructor() {
    this.init();
  }

  static getInstance(): GameState {
    if (!GameState.instance) GameState.instance = new GameState();
    return GameState.instance;
  }

  private init(): void {
    const party: CharacterState[] = charactersData.characters.map((c) => ({
      id: c.id,
      name: c.name,
      stats: {
        hp: c.baseStats.hp,
        mp: c.baseStats.mp,
        maxHp: c.baseStats.hp,
        maxMp: c.baseStats.mp,
        strength: c.baseStats.strength,
        magic: c.baseStats.magic,
        defense: c.baseStats.defense,
        magicDefense: c.baseStats.magicDefense,
        agility: c.baseStats.agility,
        luck: c.baseStats.luck,
      },
      skills: [...c.skills],
      statusEffects: [],
      alive: true,
    }));

    const highScore = this.loadHighScore();

    this.state = {
      party,
      inventory: [{ id: 'potion', quantity: 2 }],
      gold: 0,
      score: 0,
      highScore,
      difficultyLevel: 1,
      level: 1,
      exp: 0,
      expToNext: 50,
      currentMap: 'overworld',
      playerX: 2,
      playerY: 2,
      flags: {},
      mapSeed: Date.now(),
      preCombatX: null,
      preCombatY: null,
      pendingMapEnemies: null,
      pendingPickups: null,
      pendingShopkeeper: null,
    };
  }

  get data(): GameStateData {
    return this.state;
  }

  getCharacter(id: string): CharacterState | undefined {
    return this.state.party.find((c) => c.id === id);
  }

  setFlag(key: string, value: boolean): void {
    this.state.flags[key] = value;
  }

  getFlag(key: string): boolean {
    return this.state.flags[key] ?? false;
  }

  addItem(id: string, qty = 1): void {
    const existing = this.state.inventory.find((i) => i.id === id);
    if (existing) {
      existing.quantity += qty;
    } else {
      const def = itemsData.items.find((it) => it.id === id);
      if (def) this.state.inventory.push({ id, quantity: qty });
    }
  }

  removeItem(id: string, qty = 1): boolean {
    const existing = this.state.inventory.find((i) => i.id === id);
    if (!existing || existing.quantity < qty) return false;
    existing.quantity -= qty;
    if (existing.quantity === 0) {
      this.state.inventory = this.state.inventory.filter((i) => i.id !== id);
    }
    return true;
  }

  addGold(amount: number): void {
    this.state.gold += amount;
  }

  removeGold(amount: number): boolean {
    if (this.state.gold < amount) return false;
    this.state.gold -= amount;
    return true;
  }

  addScore(points: number): void {
    this.state.score += points;
    if (this.state.score > this.state.highScore) {
      this.state.highScore = this.state.score;
      this.saveHighScore();
    }
  }

  increaseDifficulty(): void {
    this.state.difficultyLevel++;
    // New floor → generate a fresh map seed and clear per-floor state.
    this.state.mapSeed = Date.now() ^ (this.state.difficultyLevel * 0x9e3779b9);
    this.state.pendingMapEnemies = null;
    this.state.pendingPickups = null;
    this.state.pendingShopkeeper = null;
    this.state.preCombatX = null;
    this.state.preCombatY = null;
  }

  /** Scale factor applied to enemy stats based on current difficulty. */
  getEnemyScale(): number {
    return 1 + (this.state.difficultyLevel - 1) * 0.18;
  }

  gainExp(amount: number): LevelUpResult {
    this.state.exp += amount;
    if (this.state.exp >= this.state.expToNext) {
      this.state.exp -= this.state.expToNext;
      this.state.level++;
      this.state.expToNext = Math.floor(this.state.expToNext * 1.6 + 20);
      const skillsGained = this.applyLevelUp();
      return { leveledUp: true, newLevel: this.state.level, skillsGained };
    }
    return { leveledUp: false, newLevel: this.state.level, skillsGained: [] };
  }

  private applyLevelUp(): SkillGain[] {
    const level = this.state.level;
    const skillsGained: SkillGain[] = [];
    this.state.party.forEach((p) => {
      const charDef = charactersData.characters.find((c) => c.id === p.id);
      if (!charDef) return;

      const gains = charDef.levelUpStats as Record<string, number>;
      p.stats.maxHp += gains['hp'] ?? 0;
      p.stats.maxMp += gains['mp'] ?? 0;
      p.stats.strength += gains['strength'] ?? 0;
      p.stats.magic += gains['magic'] ?? 0;
      p.stats.defense += gains['defense'] ?? 0;
      p.stats.magicDefense += gains['magicDefense'] ?? 0;
      p.stats.agility += gains['agility'] ?? 0;
      p.stats.luck += gains['luck'] ?? 0;
      // Restore some HP/MP on level-up
      p.stats.hp = Math.min(p.stats.hp + (gains['hp'] ?? 0), p.stats.maxHp);
      p.stats.mp = Math.min(p.stats.mp + (gains['mp'] ?? 0), p.stats.maxMp);

      const levelSkills = charDef.levelSkills as Record<string, string>;
      const newSkill = levelSkills[String(level)];
      if (newSkill && !p.skills.includes(newSkill)) {
        p.skills.push(newSkill);
        skillsGained.push({ charName: p.name, skillId: newSkill });
      }
    });
    return skillsGained;
  }

  private saveHighScore(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('cf_highscore', String(this.state.highScore));
      }
    } catch (e) {
      console.warn('CopilotFantasy: could not save high score', e);
    }
  }

  private loadHighScore(): number {
    try {
      if (typeof localStorage !== 'undefined') {
        return parseInt(localStorage.getItem('cf_highscore') ?? '0', 10) || 0;
      }
    } catch (e) {
      console.warn('CopilotFantasy: could not load high score', e);
    }
    return 0;
  }

  reset(): void {
    this.init();
  }
}
