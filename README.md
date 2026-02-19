# CopilotFantasy

A browser-based 2D Japanese RPG (JRPG) built with **Phaser 3**, **TypeScript**, and **Vite**.

---

## What is CopilotFantasy?

CopilotFantasy is a classic turn-based RPG playable entirely in the browser. You control a party of
three adventurers (Aria the Warrior, Kael the Mage, and Lyra the Healer) as they explore tile-based
maps, encounter enemies, and engage in Charge Time Battle (CTB) combat — the same turn system found
in Final Fantasy X.

Key features:

- **CTB combat** — entities act based on their Agility stat; status effects like Haste and Slow
  directly modify the turn order.
- **Exploration** — tile-based overworld with NPC dialogue, trigger zones, random encounters, and
  map transitions.
- **Dialogue system** — branching conversation trees with player choices.

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| [Phaser 3](https://phaser.io/) | 2D game engine |
| [TypeScript](https://www.typescriptlang.org/) | Type-safe development |
| [Vite](https://vitejs.dev/) | Dev server & bundler |
| [Vitest](https://vitest.dev/) | Unit testing |

---

## Quick Start

```bash
npm install
npm run dev       # Start development server at http://localhost:5173
npm run build     # Production build
npm test          # Run unit tests
```

## Controls

### Exploration
| Key | Action |
|-----|--------|
| Arrow Keys | Move |
| Space | Interact with NPCs |

### Combat
| Key | Action |
|-----|--------|
| Up/Down | Navigate action menu |
| Enter | Confirm action |

---

## Architecture

```
src/
├── core/
│   ├── engine/     Game bootstrap
│   ├── events/     EventBus (singleton pub/sub)
│   └── state/      GameState (singleton, persists party/inventory)
├── data/           JSON data (characters, enemies, skills, items, status effects)
├── scenes/         Phaser scenes (Boot → MainMenu → Exploration ↔ Combat)
├── systems/
│   ├── combat/     CTB engine, status effects, combat logic
│   ├── dialogue/   Branching dialogue trees
│   └── exploration/ Map management, player movement
├── tests/          Vitest unit tests
└── ui/             HUD components for each scene
```

## Party

| Character | Class | Role |
|-----------|-------|------|
| Aria | Warrior | High HP/STR, tanking |
| Kael | Mage | High MAG, elemental spells |
| Lyra | Healer | Support, healing, status removal |
A 2D Web based AI built and driven CTB RPG.
