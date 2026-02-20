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
  gil: number;
  currentMap: string;
  playerX: number;
  playerY: number;
  flags: Record<string, boolean>;
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
      skills: c.skills,
      statusEffects: [],
      alive: true,
    }));

    const inventory: InventoryItem[] = [];
    charactersData.characters.forEach((c) => {
      c.startingItems.forEach((itemId) => {
        const existing = inventory.find((i) => i.id === itemId);
        if (existing) {
          existing.quantity++;
        } else {
          const itemDef = itemsData.items.find((it) => it.id === itemId);
          if (itemDef) inventory.push({ id: itemId, quantity: 1 });
        }
      });
    });

    this.state = {
      party,
      inventory,
      gil: 150,
      currentMap: 'town',
      playerX: 5,
      playerY: 5,
      flags: {},
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
      this.state.inventory.push({ id, quantity: qty });
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

  reset(): void {
    this.init();
  }
}
