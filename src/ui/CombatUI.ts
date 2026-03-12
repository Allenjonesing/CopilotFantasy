import { CombatSystem, CombatAction } from '../systems/combat/CombatSystem';
import { CombatEntity } from '../systems/combat/CombatEntity';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EnemyCombatant } from '../systems/combat/EnemyCombatant';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';
import charactersData from '../data/characters.json';

// Fixed/animation constants that don't depend on screen size
const TIMELINE_H = 36;
const TIMELINE_SLOT_W = 72;
const TIMELINE_NAME_LEN = 7;
const DAMAGE_FLASH_MS = 200;
const ENEMY_FLASH_MS = 80;
const ENEMY_FLASH_REPEAT = 2;
const LOG_STRIP_H = 42;
const LOG_LINE_COUNT = 3;
/** Height of each player row in the left status panel (name + HP + MP bars). */
const PER_PLAYER_PANEL_H = 50;

const HELP_TEXT_DEFAULT = '▲▼ Navigate   OK/Enter Confirm   X/BACK Cancel   Tap enemy or ally to target';
const HELP_TEXT_SKILL    = '▲▼ Navigate   OK/Enter Confirm   X/BACK Cancel   Hover skill to see description';
const HELP_TEXT_ITEM     = '▲▼ Navigate   OK/Enter Confirm   X/BACK Cancel   Hover item to see description';

/** Element emoji indicators shown next to enemy names. */
const ELEMENT_ICONS: Record<string, string> = {
  fire: '🔥',
  ice: '❄',
  lightning: '⚡',
  water: '💧',
};

/** Element spell colour for animations. */
const ELEMENT_COLORS: Record<string, number> = {
  fire: 0xff6600,
  ice: 0x88ddff,
  lightning: 0xffff00,
  water: 0x4488ff,
  heal: 0x44ff88,
  revive: 0xffffff,
};

// Entity icon sizes (fixed pixel sizes)
const ENEMY_W = 80;
const ENEMY_H = 80;
const PLAYER_ICON_W = 62;
const PLAYER_ICON_H = 62;
const TURN_INDICATOR_PAD = 12; // px added around entity icon for the active-turn highlight ring

// Attack movement animation
const ATTACK_MOVE_MAX_PX = 70;
const ATTACK_MOVE_RATIO = 0.45;
const ATTACK_MOVE_FORWARD_MS = 160;
const ATTACK_MOVE_RETURN_MS = 200;

type MenuState = 'main' | 'skill' | 'item' | 'target';

/** Union type for entity icons that may be image sprites or rectangle fallbacks. */
type EntityIcon = Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

export class CombatUI {
  private scene: Phaser.Scene;
  private system: CombatSystem;
  /** True when fighting the floor boss — Flee is disabled during boss battles. */
  private readonly isBossBattle: boolean;

  // Layout constants computed from screen dimensions
  private readonly W: number;
  private readonly H: number;
  private readonly BATTLEFIELD_BOTTOM: number;
  private readonly LOG_STRIP_Y: number;
  private readonly BOTTOM_Y: number;
  private readonly LEFT_PANEL_W: number;
  private readonly MENU_X: number;
  private readonly MENU_W: number;
  private readonly ICON_Y: number;
  private readonly ENEMY_BASE_X: number;
  private readonly PLAYER_BASE_X: number;
  private readonly ENEMY_SPREAD: number;
  private readonly PLAYER_SPREAD: number;
  private readonly BAR_HALF_W: number; // half of HP bar width (for refresh animation)
  /** Vertical Y position of the enemy row in the battlefield (top section). */
  private readonly enemyRowY: number;
  /** Vertical Y position of the player row in the battlefield (bottom section). */
  private readonly playerRowY: number;
  // Enemy sprites
  private enemyRects: Map<string, EntityIcon> = new Map();
  private enemyNameTexts: Phaser.GameObjects.Text[] = [];
  // Player icon sprites on the battlefield
  private playerIconRects: Map<string, EntityIcon> = new Map();
  private playerIconNames: Phaser.GameObjects.Text[] = [];
  // Player HP bars (left status panel)
  private playerBars: Map<string, { bg: Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = new Map();
  // Player MP bars (left status panel)
  private playerMpBars: Map<string, { bg: Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = new Map();
  private playerNameTexts: Phaser.GameObjects.Text[] = [];
  // Active turn indicator (battlefield highlight)
  private activeTurnIndicator!: Phaser.GameObjects.Rectangle;
  // Action menu
  private menuContainer!: Phaser.GameObjects.Container;
  private menuBg!: Phaser.GameObjects.Rectangle;
  private menuTitle!: Phaser.GameObjects.Text;
  private menuItems: Phaser.GameObjects.Text[] = [];
  private menuDisabled: boolean[] = [];
  private selectedMenuIndex = 0;
  // Menu state machine
  private menuState: MenuState = 'main';
  private menuStateBeforeTarget: MenuState = 'main';
  private pendingActionType: 'attack' | 'skill' | 'item' | null = null;
  private pendingSkillId: string | null = null;
  private pendingItemId: string | null = null;
  // Target selection
  private targetList: CombatEntity[] = [];
  private targetIsPositive = false;
  private targetCursor!: Phaser.GameObjects.Rectangle;
  /** Semi-transparent highlight drawn over the targeted player's status row. */
  private targetPanelHighlight!: Phaser.GameObjects.Rectangle;
  // Timeline display
  private timelineContainer!: Phaser.GameObjects.Container;
  private timelineIcons: Phaser.GameObjects.GameObject[] = [];
  // Compact log strip
  private logStripBg!: Phaser.GameObjects.Rectangle;
  private logTexts: Phaser.GameObjects.Text[] = [];
  // Help text
  private helpText!: Phaser.GameObjects.Text;
  // Combat nav buttons (touch-friendly)
  private navObjects: Phaser.GameObjects.GameObject[] = [];
  // Spell animation handler reference (for cleanup)
  private onCombatSpellStart!: (actor: unknown, element: unknown, name: unknown) => void;
  // State
  private currentActor: CombatEntity | null = null;
  private bus: EventBus;
  // Stored listener references for cleanup
  private onCombatLog!: (msg: unknown) => void;
  private onCombatDamage!: (entity: unknown, dmg: unknown) => void;
  private onCombatHeal!: (entity: unknown, amount: unknown) => void;
  private onCombatTurnStart!: (actor: unknown) => void;
  private onCombatAttackStart!: (actor: unknown, target: unknown) => void;
  private onCombatMpChange!: (entity: unknown) => void;

  /** Called by CombatScene when a menu item is tapped — triggers confirmAction(). */
  onMenuTap?: () => void;

  constructor(scene: Phaser.Scene, system: CombatSystem, battleType: import('../systems/combat/CombatSystem').BattleType = 'normal', isBossBattle = false) {
    this.scene = scene;
    this.system = system;
    this.isBossBattle = isBossBattle;
    this.bus = EventBus.getInstance();

    // Compute all layout constants from the actual screen dimensions so the
    // combat UI fills the available space on any screen (including portrait).
    this.W = scene.scale.width;
    this.H = scene.scale.height;
    this.BATTLEFIELD_BOTTOM = Math.round(this.H * 0.44);
    this.LOG_STRIP_Y = this.BATTLEFIELD_BOTTOM + 4;
    this.BOTTOM_Y = this.LOG_STRIP_Y + LOG_STRIP_H + 4;
    this.LEFT_PANEL_W = Math.round(this.W * 0.31);
    this.MENU_X = this.LEFT_PANEL_W + 8;
    this.MENU_W = this.W - this.MENU_X - 8;

    // Vertical stacking: enemies occupy top portion of battlefield, players the bottom.
    const battlefieldH = this.BATTLEFIELD_BOTTOM - TIMELINE_H;
    this.enemyRowY = TIMELINE_H + Math.round(battlefieldH * 0.32);
    this.playerRowY = TIMELINE_H + Math.round(battlefieldH * 0.72);
    this.ICON_Y = this.playerRowY; // used for active-turn indicator fallback

    const pCount = system.players.length;
    const eCount = system.enemies.length;

    // Players spread across 10%–90% of screen width in the lower battlefield row.
    const playerAreaW = Math.round(this.W * 0.80);
    this.PLAYER_SPREAD = Math.max(playerAreaW, (PLAYER_ICON_W + 14) * Math.max(pCount, 1));
    this.PLAYER_BASE_X = Math.round(this.W * 0.10);

    // Enemies spread across 10%–90% of screen width in the upper battlefield row.
    const enemyAreaW = Math.round(this.W * 0.80);
    this.ENEMY_SPREAD = Math.max(enemyAreaW, (ENEMY_W + 14) * Math.max(eCount, 1));
    this.ENEMY_BASE_X = Math.round(this.W * 0.10);

    const barW = Math.max(58, Math.round(this.LEFT_PANEL_W * 0.48));
    this.BAR_HALF_W = Math.round(barW / 2);

    this.buildUI();
    this.registerEvents();

    // Show battle-start announcement if preemptive or ambush.
    if (battleType === 'preemptive') {
      this.showBattleAnnouncement('⚡ PREEMPTIVE STRIKE!', '#ffff00');
    } else if (battleType === 'ambush') {
      this.showBattleAnnouncement('💀 AMBUSH!', '#ff4444');
    }
  }

  private buildUI(): void {
    // ── Timeline bar ──────────────────────────────────────────────────────────
    this.scene.add.rectangle(this.W / 2, TIMELINE_H / 2, this.W, TIMELINE_H, 0x111133);
    this.timelineContainer = this.scene.add.container(0, 0);
    this.timelineContainer.setDepth(20);

    // ── Battlefield background ────────────────────────────────────────────────
    this.scene.add.rectangle(this.W / 2, (TIMELINE_H + this.BATTLEFIELD_BOTTOM) / 2, this.W, this.BATTLEFIELD_BOTTOM - TIMELINE_H, 0x1a1a2e);

    // ── Enemy icons (top portion of battlefield, full-width spread) ──────────
    const eCount = this.system.enemies.length;
    this.system.enemies.forEach((e, idx) => {
      const x = this.ENEMY_BASE_X + idx * Math.floor(this.ENEMY_SPREAD / Math.max(eCount, 1));
      const y = this.enemyRowY;
      const enemyCombatant = e as EnemyCombatant;
      const textureKey = `enemy_${enemyCombatant.enemyId}`;
      let icon: EntityIcon;
      if (this.scene.textures.exists(textureKey)) {
        icon = this.scene.add
          .image(x, y, textureKey)
          .setDisplaySize(ENEMY_W, ENEMY_H)
          .setDepth(5);
      } else {
        icon = this.scene.add.rectangle(x, y, ENEMY_W, ENEMY_H, 0xcc4444).setDepth(5);
      }
      icon.setInteractive({ useHandCursor: true });
      icon.on('pointerdown', () => this.onEntityTap(e));
      // Show element icon next to enemy name
      const elemIcon = e.element ? (ELEMENT_ICONS[e.element] ?? '') : '';
      const nameText = this.scene.add
        .text(x, y + ENEMY_H / 2 + 8, `${e.name}${elemIcon ? ' ' + elemIcon : ''}`, {
          fontSize: '12px',
          color: '#ffffff',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5)
        .setDepth(6);
      this.enemyRects.set(e.id, icon);
      this.enemyNameTexts.push(nameText);
    });

    // ── Player icons (lower portion of battlefield, full-width spread) ───────
    const pCount = this.system.players.length;
    this.system.players.forEach((p, idx) => {
      const x = this.PLAYER_BASE_X + idx * Math.floor(this.PLAYER_SPREAD / Math.max(pCount, 1));
      const y = this.playerRowY;
      let icon: EntityIcon;
      if (this.scene.textures.exists('player')) {
        icon = this.scene.add
          .image(x, y, 'player')
          .setDisplaySize(PLAYER_ICON_W, PLAYER_ICON_H)
          .setDepth(5);
      } else {
        icon = this.scene.add.rectangle(x, y, PLAYER_ICON_W, PLAYER_ICON_H, 0x4466cc).setDepth(5);
      }
      icon.setInteractive({ useHandCursor: true });
      icon.on('pointerdown', () => this.onEntityTap(p));
      const nameText = this.scene.add
        .text(x, y + PLAYER_ICON_H / 2 + 8, p.name, { fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace' })
        .setOrigin(0.5)
        .setDepth(6);
      this.playerIconRects.set(p.id, icon);
      this.playerIconNames.push(nameText);
    });

    // ── Target cursor (hidden initially) ─────────────────────────────────────
    this.targetCursor = this.scene.add.rectangle(0, 0, 92, 92, 0x000000, 0);
    this.targetCursor.setStrokeStyle(3, 0xffff00);
    this.targetCursor.setDepth(15);
    this.targetCursor.setVisible(false);

    // ── Target panel highlight (hidden initially) ─────────────────────────────
    this.targetPanelHighlight = this.scene.add.rectangle(
      this.LEFT_PANEL_W / 2, 0, this.LEFT_PANEL_W, PER_PLAYER_PANEL_H - 2, 0x44ff88, 0,
    );
    this.targetPanelHighlight.setStrokeStyle(2, 0x44ff88);
    this.targetPanelHighlight.setDepth(20);
    this.targetPanelHighlight.setVisible(false);

    // ── Compact log strip ─────────────────────────────────────────────────────
    this.logStripBg = this.scene.add.rectangle(this.W / 2, this.LOG_STRIP_Y + LOG_STRIP_H / 2, this.W - 10, LOG_STRIP_H, 0x0a0a1a, 0.80);
    this.logStripBg.setStrokeStyle(1, 0x333355);
    this.logStripBg.setDepth(20);
    for (let i = 0; i < LOG_LINE_COUNT; i++) {
      const t = this.scene.add.text(8, this.LOG_STRIP_Y + 3 + i * 13, '', {
        fontSize: '11px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
        wordWrap: { width: this.W - 16 },
      });
      t.setDepth(21);
      this.logTexts.push(t);
    }

    // ── Bottom panel background ───────────────────────────────────────────────
    this.scene.add.rectangle(this.W / 2, (this.BOTTOM_Y + this.H - 22) / 2, this.W, this.H - 22 - this.BOTTOM_Y, 0x0d0d1f, 0.95).setDepth(18);

    // ── Left panel: player HP + MP bars ──────────────────────────────────────
    const barW = this.BAR_HALF_W * 2;
    const barTextX = Math.round(this.LEFT_PANEL_W * 0.58);
    this.system.players.forEach((p, idx) => {
      const x = 8;
      const y = this.BOTTOM_Y + 8 + idx * PER_PLAYER_PANEL_H;
      const nameText = this.scene.add
        .text(x, y, p.name, { fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace' })
        .setDepth(21);
      this.playerNameTexts.push(nameText);
      // HP bar
      const hpBg = this.scene.add.rectangle(x + this.BAR_HALF_W + Math.round(barW * 0.17), y + 14, barW, 10, 0x333333).setDepth(21);
      const hpBar = this.scene.add.rectangle(x + this.BAR_HALF_W + Math.round(barW * 0.17), y + 14, barW, 10, 0x44aa44).setDepth(22);
      const hpText = this.scene.add
        .text(x + barTextX, y + 8, `${p.stats.hp}/${p.stats.maxHp}`, {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: 'monospace',
        })
        .setDepth(22);
      this.playerBars.set(p.id, { bg: hpBg, bar: hpBar, text: hpText });
      // MP bar
      const mpBg = this.scene.add.rectangle(x + this.BAR_HALF_W + Math.round(barW * 0.17), y + 27, barW, 10, 0x222244).setDepth(21);
      const mpBar = this.scene.add.rectangle(x + this.BAR_HALF_W + Math.round(barW * 0.17), y + 27, barW, 10, 0x4466cc).setDepth(22);
      const mpText = this.scene.add
        .text(x + barTextX, y + 21, `${p.stats.mp}/${p.stats.maxMp}`, {
          fontSize: '10px',
          color: '#aaaaff',
          fontFamily: 'monospace',
        })
        .setDepth(22);
      this.playerMpBars.set(p.id, { bg: mpBg, bar: mpBar, text: mpText });
    });

    // Initialise bar scales to match the actual current HP/MP values so the bars
    // are correct from the very first frame (not just after the first damage/heal event).
    this.system.players.forEach((p) => this.refreshEntityDisplay(p));

    // ── Active turn indicator (battlefield highlight ring) ────────────────────
    this.activeTurnIndicator = this.scene.add.rectangle(0, 0, PLAYER_ICON_W + TURN_INDICATOR_PAD, PLAYER_ICON_H + TURN_INDICATOR_PAD, 0x000000, 0);
    this.activeTurnIndicator.setStrokeStyle(3, 0xffff00);
    this.activeTurnIndicator.setDepth(4);
    this.activeTurnIndicator.setVisible(false);

    // ── Combat nav buttons (left panel, touch-friendly) ───────────────────────
    this.buildNavButtons();

    // ── Action menu container ─────────────────────────────────────────────────
    this.menuContainer = this.scene.add.container(this.MENU_X, this.BOTTOM_Y);
    this.menuContainer.setDepth(30);
    this.menuBg = this.scene.add.rectangle(this.MENU_W / 2, 60, this.MENU_W, 160, 0x111133, 0.94);
    this.menuBg.setStrokeStyle(2, 0x5555bb);
    this.menuContainer.add(this.menuBg);
    this.menuTitle = this.scene.add.text(10, 6, 'ACTION', {
      fontSize: '13px',
      color: '#aaaaff',
      fontFamily: 'monospace',
    });
    this.menuContainer.add(this.menuTitle);
    this.buildMainMenu();

    // ── Help text — single line at very bottom ────────────────────────────────
    this.helpText = this.scene.add
      .text(this.W / 2, this.H - 4, HELP_TEXT_DEFAULT, {
        fontSize: '10px',
        color: '#666688',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(25);
  }

  /** Build the four combat navigation buttons in the left panel — large enough for touch. */
  private buildNavButtons(): void {
    // Make buttons large enough for comfortable touch on portrait phones.
    // Fill the remaining vertical space in the left panel below the HP/MP bars.
    const availableH = this.H - (this.BOTTOM_Y + this.system.players.length * PER_PLAYER_PANEL_H + 10);
    const BH = Math.max(54, Math.min(Math.floor(availableH / 2) - 6, 80));
    const BW = Math.max(64, Math.round(this.LEFT_PANEL_W * 0.46));
    const GUTTER = 6;
    const COL1 = Math.round(this.LEFT_PANEL_W * 0.26);
    const COL2 = Math.round(this.LEFT_PANEL_W * 0.74);
    const ROW1 = this.BOTTOM_Y + this.system.players.length * PER_PLAYER_PANEL_H + 14;
    const ROW2 = ROW1 + BH + GUTTER;

    const makeBtn = (
      label: string,
      x: number,
      y: number,
      color: number,
      stroke: number,
      onTap: () => void,
    ): void => {
      const bg = this.scene.add.rectangle(x, y, BW, BH, color, 0.90);
      bg.setStrokeStyle(3, stroke);
      bg.setDepth(32);
      bg.setVisible(false);
      bg.setInteractive({ useHandCursor: true });
      const txt = this.scene.add
        .text(x, y, label, { fontSize: '22px', color: '#ffffff', fontFamily: 'monospace' })
        .setOrigin(0.5)
        .setDepth(33)
        .setVisible(false);
      bg.on('pointerdown', (_pointer: unknown, _lx: unknown, _ly: unknown, event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onTap();
      });
      this.navObjects.push(bg, txt);
    };

    makeBtn('▲', COL1, ROW1, 0x223355, 0x5577bb, () => this.navigateMenu('up'));
    makeBtn('▼', COL1, ROW2, 0x223355, 0x5577bb, () => this.navigateMenu('down'));
    makeBtn('OK', COL2, ROW1, 0x1a3322, 0x44aa66, () => this.onMenuTap?.());
    makeBtn('BACK', COL2, ROW2, 0x331a1a, 0xaa4444, () => this.backMenu());
  }

  /** Handle a tap/click on an entity icon in the battlefield. */
  private onEntityTap(entity: CombatEntity): void {
    if (this.menuState !== 'target') return;
    const idx = this.targetList.indexOf(entity);
    if (idx === -1) return;
    this.selectedMenuIndex = idx;
    this.updateMenuHighlight();
    this.updateTargetCursor();
    this.onMenuTap?.();
  }

  /** Rebuild the visible menu items inside the container. */
  private buildMenuItems(items: string[], disabled: boolean[] = [], tooltips: string[] = []): void {
    this.menuItems.forEach((t) => t.destroy());
    this.menuItems = [];
    this.menuDisabled = disabled.length === items.length ? [...disabled] : items.map(() => false);
    this.selectedMenuIndex = 0;
    items.forEach((label, i) => {
      const isDisabled = this.menuDisabled[i];
      const color = isDisabled ? '#555555' : i === 0 ? '#ffff00' : '#ffffff';
      const t = this.scene.add.text(12, 26 + i * 26, label, {
        fontSize: '16px',
        color,
        fontFamily: 'monospace',
      });
      if (!isDisabled) {
        t.setInteractive({ useHandCursor: true });
        t.on('pointerover', () => {
          if (!this.menuDisabled[i] && this.menuContainer.visible) {
            this.selectedMenuIndex = i;
            this.updateMenuHighlight();
            if (this.menuState === 'target') this.updateTargetCursor();
            if (tooltips[i] && this.helpText.active) this.helpText.setText(tooltips[i]);
          }
        });
        t.on('pointerdown', () => {
          if (!this.menuDisabled[i] && this.menuContainer.visible) {
            this.selectedMenuIndex = i;
            this.updateMenuHighlight();
            if (this.menuState === 'target') this.updateTargetCursor();
            this.onMenuTap?.();
          }
        });
      }
      this.menuContainer.add(t);
      this.menuItems.push(t);
    });
    // Resize background to fit items
    const h = Math.max(70, 26 + items.length * 26 + 14);
    if (this.menuBg.active) {
      this.menuBg.setSize(this.MENU_W, h);
      this.menuBg.setPosition(this.MENU_W / 2, h / 2);
    }
  }

  /** Return the skill-menu label appropriate for the current actor's class. */
  private skillMenuLabel(): string {
    if (!this.currentActor) return 'Skill';
    const charDef = (charactersData.characters as Array<{ id: string; class: string }>)
      .find((c) => c.id === this.currentActor!.id);
    if (!charDef) return 'Skill';
    if (charDef.class === 'Mage') return 'Magic';
    if (charDef.class === 'Healer') return 'White Magic';
    return 'Skill';
  }

  private buildMainMenu(): void {
    this.menuTitle.setText('ACTION');
    const actor = this.currentActor;
    const specialSkills = actor ? actor.skills.filter((s) => s !== 'attack') : [];
    const hasSkills = specialSkills.length > 0;
    const hasItems = GameState.getInstance().data.inventory.length > 0;
    this.buildMenuItems(
      ['Attack', this.skillMenuLabel(), 'Item', 'Defend', 'Flee'],
      [false, !hasSkills, !hasItems, false, this.isBossBattle],
    );
  }

  private buildSkillMenu(): void {
    this.menuTitle.setText(`${this.skillMenuLabel()}  [BACK: cancel]`);
    const actor = this.currentActor;
    const skillIds = actor ? actor.skills.filter((s) => s !== 'attack') : [];
    const items = skillIds.map((id) => {
      const def = skillsData.skills.find((s) => s.id === id);
      return def ? `${def.name} MP:${def.mpCost}` : id;
    });
    const disabled = skillIds.map((id) => {
      const def = skillsData.skills.find((s) => s.id === id);
      if (!def || !actor) return false;
      return actor.stats.mp < def.mpCost;
    });
    const tooltips = skillIds.map((id) => {
      const def = skillsData.skills.find((s) => s.id === id);
      return def?.description ?? '';
    });
    if (this.helpText.active) {
      this.helpText.setText(HELP_TEXT_SKILL);
    }
    this.buildMenuItems(items, disabled, tooltips);
  }

  private buildItemMenu(): void {
    this.menuTitle.setText('ITEM   [BACK: cancel]');
    const inv = GameState.getInstance().data.inventory;
    const items = inv.map((i) => {
      const def = itemsData.items.find((it) => it.id === i.id);
      return def ? `${def.name} x${i.quantity}` : `${i.id} x${i.quantity}`;
    });
    const tooltips = inv.map((i) => {
      const def = itemsData.items.find((it) => it.id === i.id);
      return def?.description ?? '';
    });
    if (this.helpText.active) {
      this.helpText.setText(HELP_TEXT_ITEM);
    }
    this.buildMenuItems(items, [], tooltips);
  }

  private enterTargetMode(actionType: 'attack' | 'skill' | 'item'): void {
    this.menuStateBeforeTarget = this.menuState;
    this.menuState = 'target';
    this.pendingActionType = actionType;

    // Determine whether the action targets allies (healing item or ally-targeting skill).
    let preferAlly = false;
    let revivalItem = false;
    if (actionType === 'item' && this.pendingItemId) {
      const itemDef = itemsData.items.find((it) => it.id === this.pendingItemId);
      const effect = itemDef?.effect as Record<string, unknown> | undefined;
      if (effect?.['revive']) {
        revivalItem = true;
        preferAlly = true; // green cursor for positive action
      } else {
        preferAlly = itemDef?.target === 'single_ally';
      }
    } else if (actionType === 'skill' && this.pendingSkillId) {
      const skillDef = skillsData.skills.find((s) => s.id === this.pendingSkillId);
      preferAlly = skillDef?.target === 'single_ally' || skillDef?.target === 'all_allies'
        || skillDef?.target === 'single_dead_ally';
    }

    // Positive actions (heals, buffs, items on allies) use a green cursor;
    // hostile actions (attacks, offensive skills) use a red cursor.
    this.targetIsPositive = preferAlly;

    // Check if this is a revival skill (targets dead allies)
    let revivalSkill = false;
    if (actionType === 'skill' && this.pendingSkillId) {
      const skillDef = skillsData.skills.find((s) => s.id === this.pendingSkillId);
      revivalSkill = skillDef?.target === 'single_dead_ally';
    }

    if (revivalItem || revivalSkill) {
      // Revival actions only show KO'd allies as valid targets.
      this.targetList = this.system.players.filter((p) => p.isDefeated);
      if (this.targetList.length === 0) {
        // No one to revive — fall back to living allies to avoid empty menu.
        this.targetList = this.system.players.filter((p) => !p.isDefeated);
      }
    } else {
      const allies = this.system.players.filter((p) => !p.isDefeated);
      const foes = this.system.enemies.filter((e) => !e.isDefeated);
      this.targetList = preferAlly ? [...allies, ...foes] : [...foes, ...allies];
    }

    this.menuTitle.setText('TARGET [BACK: cancel]');
    const labels = this.targetList.map((t) => {
      const isEnemy = !this.system.players.some((p) => p === t);
      const deadMark = t.isDefeated ? ' ✝' : '';
      return `${t.name} ${isEnemy ? '(foe)' : '(ally)'}${deadMark}`;
    });
    this.buildMenuItems(labels);
    this.updateTargetCursor();
  }

  private resetToMain(): void {
    this.menuState = 'main';
    this.menuStateBeforeTarget = 'main';
    this.pendingActionType = null;
    this.pendingSkillId = null;
    this.pendingItemId = null;
    this.hideTargetCursor();
    this.buildMainMenu();
  }

  private updateMenuHighlight(): void {
    this.menuItems.forEach((t, i) => {
      const disabled = this.menuDisabled[i];
      t.setColor(disabled ? '#555555' : i === this.selectedMenuIndex ? '#ffff00' : '#ffffff');
    });
  }

  private updateTargetCursor(): void {
    const target = this.targetList[this.selectedMenuIndex];
    if (!target) {
      this.targetCursor.setVisible(false);
      this.targetPanelHighlight.setVisible(false);
      return;
    }
    const pos = this.entityCenter(target);
    this.targetCursor.setPosition(pos.x, pos.y);
    // Green cursor for positive/healing actions, red for hostile/damaging actions.
    const cursorColor = this.targetIsPositive ? 0x44ff88 : 0xff4444;
    this.targetCursor.setStrokeStyle(3, cursorColor);
    this.targetCursor.setVisible(true);

    // Also highlight the target's name+HP row in the left status panel if it is a player.
    if (target instanceof PlayerCombatant) {
      const pIdx = this.system.players.indexOf(target);
      if (pIdx !== -1) {
        const rowY = this.BOTTOM_Y + 8 + pIdx * PER_PLAYER_PANEL_H + PER_PLAYER_PANEL_H / 2 - 4;
        this.targetPanelHighlight.setPosition(this.LEFT_PANEL_W / 2, rowY);
        this.targetPanelHighlight.setSize(this.LEFT_PANEL_W - 4, PER_PLAYER_PANEL_H - 4);
        this.targetPanelHighlight.setStrokeStyle(2, cursorColor);
        this.targetPanelHighlight.setVisible(true);
      } else {
        this.targetPanelHighlight.setVisible(false);
      }
    } else {
      this.targetPanelHighlight.setVisible(false);
    }
  }

  private hideTargetCursor(): void {
    this.targetCursor.setVisible(false);
    this.targetPanelHighlight.setVisible(false);
  }

  private registerEvents(): void {
    this.onCombatLog = (msg) => this.appendLog(msg as string);
    this.onCombatDamage = (entity, dmg) => {
      this.refreshEntityDisplay(entity as CombatEntity);
      this.playDamageAnimation(entity as CombatEntity, dmg as number);
    };
    this.onCombatHeal = (entity, amount) => {
      this.refreshEntityDisplay(entity as CombatEntity);
      if (typeof amount === 'number' && amount > 0) {
        const pos = this.entityScreenPos(entity as CombatEntity);
        const healText = this.scene.add.text(pos.x, pos.y, `+${amount}`, {
          fontSize: '17px',
          color: '#88ff88',
          fontFamily: 'monospace',
          stroke: '#000000',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(50);
        this.scene.tweens.add({
          targets: healText,
          y: pos.y - 50,
          alpha: 0,
          duration: 900,
          ease: 'Power1',
          onComplete: () => healText.destroy(),
        });
      }
    };
    this.onCombatMpChange = (entity) => this.refreshEntityDisplay(entity as CombatEntity);
    this.onCombatTurnStart = (actor) => {
      if (!this.menuContainer.active) return;
      this.currentActor = actor as CombatEntity;
      this.refreshTimeline();
      const isPlayer = actor instanceof PlayerCombatant;
      if (isPlayer) this.resetToMain();
      this.menuContainer.setVisible(isPlayer);
      this.setNavVisible(isPlayer);
      // Update active turn indicator on the battlefield
      const entityPos = this.entityCenter(actor as CombatEntity);
      const size = isPlayer ? PLAYER_ICON_W + TURN_INDICATOR_PAD : ENEMY_W + TURN_INDICATOR_PAD;
      this.activeTurnIndicator.setSize(size, size);
      this.activeTurnIndicator.setPosition(entityPos.x, entityPos.y);
      this.activeTurnIndicator.setVisible(true);
      this.activeTurnIndicator.setStrokeStyle(3, isPlayer ? 0xffff00 : 0xff6666);
      // Highlight the active player's name in the status panel
      this.highlightActiveTurn(actor as CombatEntity);
    };
    this.onCombatAttackStart = (actor, target) => {
      this.playAttackMoveAnimation(actor as CombatEntity, target as CombatEntity);
    };
    this.onCombatSpellStart = (actor, element, name) => {
      this.playSpellAnimation(actor as CombatEntity, element as string, name as string);
    };
    this.bus.on('combat:log', this.onCombatLog);
    this.bus.on('combat:damage', this.onCombatDamage);
    this.bus.on('combat:heal', this.onCombatHeal);
    this.bus.on('combat:mpChange', this.onCombatMpChange);
    this.bus.on('combat:turnStart', this.onCombatTurnStart);
    this.bus.on('combat:attackStart', this.onCombatAttackStart);
    this.bus.on('combat:spellStart', this.onCombatSpellStart);
  }

  /** Highlight the name of the currently acting player in the status panel. */
  private highlightActiveTurn(actor: CombatEntity): void {
    this.playerNameTexts.forEach((t, i) => {
      const player = this.system.players[i];
      const isActive = player === actor;
      t.setColor(isActive ? '#ffff00' : '#aaaaff');
      t.setText(isActive ? `▶ ${player.name}` : player.name);
    });
  }

  /** Show or hide the nav buttons (▲▼OK BACK). */
  private setNavVisible(visible: boolean): void {
    this.navObjects.forEach((obj) => {
      if ((obj as Phaser.GameObjects.GameObject).active) {
        (obj as unknown as { setVisible: (v: boolean) => void }).setVisible(visible);
      }
    });
  }

  private refreshEntityDisplay(entity: CombatEntity): void {
    if (entity instanceof PlayerCombatant) {
      const bars = this.playerBars.get(entity.id);
      if (bars) {
        const ratio = entity.stats.hp / entity.stats.maxHp;
        bars.bar.setScale(ratio, 1);
        bars.bar.setPosition(bars.bg.x - this.BAR_HALF_W * (1 - ratio), bars.bg.y);
        if (bars.text.active) {
          bars.text.setText(`${entity.stats.hp}/${entity.stats.maxHp}`);
        }
      }
      // Update MP bar
      const mpBars = this.playerMpBars.get(entity.id);
      if (mpBars) {
        const mpRatio = entity.stats.maxMp > 0 ? entity.stats.mp / entity.stats.maxMp : 0;
        mpBars.bar.setScale(mpRatio, 1);
        mpBars.bar.setPosition(mpBars.bg.x - this.BAR_HALF_W * (1 - mpRatio), mpBars.bg.y);
        if (mpBars.text.active) {
          mpBars.text.setText(`${entity.stats.mp}/${entity.stats.maxMp}`);
        }
      }
      // Dim the player icon if defeated
      const icon = this.playerIconRects.get(entity.id);
      if (icon && icon.active) {
        if (icon instanceof Phaser.GameObjects.Image) {
          icon.setTint(entity.isDefeated ? 0x886688 : 0xffffff);
          icon.setAlpha(entity.isDefeated ? 0.55 : 1.0);
        } else {
          (icon as Phaser.GameObjects.Rectangle).setFillStyle(entity.isDefeated ? 0x553355 : 0x4466cc);
          (icon as Phaser.GameObjects.Rectangle).setAlpha(entity.isDefeated ? 0.55 : 1.0);
        }
      }
    } else {
      const rect = this.enemyRects.get(entity.id);
      if (rect) {
        if (rect instanceof Phaser.GameObjects.Image) {
          rect.setTint(entity.isDefeated ? 0x333333 : 0xffffff);
          rect.setAlpha(entity.isDefeated ? 0.4 : 1.0);
        } else {
          (rect as Phaser.GameObjects.Rectangle).setFillStyle(entity.isDefeated ? 0x333333 : 0xcc4444);
        }
      }
    }
  }

  /** Smooth move-toward-target animation for the attacking entity. */
  private playAttackMoveAnimation(actor: CombatEntity, target: CombatEntity): void {
    const isPlayer = actor instanceof PlayerCombatant;
    const rect = isPlayer
      ? this.playerIconRects.get(actor.id)
      : this.enemyRects.get(actor.id);
    if (!rect || !rect.active) return;

    const origX = rect.x;
    const origY = rect.y;
    // Move towards the opponent side
    const tPos = this.entityCenter(target);
    const dx = tPos.x - origX;
    const dy = tPos.y - origY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const moveAmount = Math.min(ATTACK_MOVE_MAX_PX, dist * ATTACK_MOVE_RATIO);
    const destX = origX + (dx / dist) * moveAmount;
    const destY = origY + (dy / dist) * moveAmount;

    this.scene.tweens.add({
      targets: rect,
      x: destX,
      y: destY,
      duration: ATTACK_MOVE_FORWARD_MS,
      ease: 'Power2.easeOut',
      onComplete: () => {
        if (!rect.active) return;
        this.scene.tweens.add({
          targets: rect,
          x: origX,
          y: origY,
          duration: ATTACK_MOVE_RETURN_MS,
          ease: 'Power2.easeIn',
        });
      },
    });
  }

  /** Flash the damaged game object and show a floating damage number. */
  private playDamageAnimation(entity: CombatEntity, dmg: number): void {
    const isPlayer = entity instanceof PlayerCombatant;
    if (isPlayer) {
      // Flash the HP bar red briefly.
      const bars = this.playerBars.get(entity.id);
      if (bars && bars.bar.active) {
        bars.bar.setFillStyle(0xff4444);
        this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
          if (bars.bar.active) bars.bar.setFillStyle(entity.isDefeated ? 0x222222 : 0x44aa44);
        });
      }
      // Flash the player icon on the battlefield (only when alive – defeated state is set by refreshEntityDisplay).
      const icon = this.playerIconRects.get(entity.id);
      if (icon && icon.active && !entity.isDefeated) {
        if (icon instanceof Phaser.GameObjects.Image) {
          icon.setTint(0xff8888);
          this.scene.tweens.add({
            targets: icon,
            alpha: { from: 1, to: 0.4 },
            duration: ENEMY_FLASH_MS,
            yoyo: true,
            repeat: ENEMY_FLASH_REPEAT,
            onComplete: () => {
              if (icon.active && !entity.isDefeated) {
                icon.setAlpha(1);
                icon.setTint(0xffffff);
              }
            },
          });
        } else {
          const rect = icon as Phaser.GameObjects.Rectangle;
          rect.setFillStyle(0xff6666);
          this.scene.tweens.add({
            targets: rect,
            alpha: { from: 1, to: 0.4 },
            duration: ENEMY_FLASH_MS,
            yoyo: true,
            repeat: ENEMY_FLASH_REPEAT,
            onComplete: () => {
              if (rect.active) {
                rect.setAlpha(entity.isDefeated ? 0.55 : 1);
                rect.setFillStyle(entity.isDefeated ? 0x553355 : 0x4466cc);
              }
            },
          });
        }
      }
    } else {
      const icon = this.enemyRects.get(entity.id);
      if (!icon || !icon.active || entity.isDefeated) return;
      if (icon instanceof Phaser.GameObjects.Image) {
        // Flash to white tint then restore
        icon.setTint(0xffffff);
        this.scene.tweens.add({
          targets: icon,
          alpha: { from: 1, to: 0.4 },
          duration: ENEMY_FLASH_MS,
          yoyo: true,
          repeat: ENEMY_FLASH_REPEAT,
          onComplete: () => {
            if (icon.active) {
              icon.setAlpha(1);
              icon.setTint(entity.isDefeated ? 0x333333 : 0xffffff);
            }
          },
        });
      } else {
        const rect = icon as Phaser.GameObjects.Rectangle;
        rect.setFillStyle(0xffffff);
        this.scene.tweens.add({
          targets: rect,
          alpha: { from: 1, to: 0.4 },
          duration: ENEMY_FLASH_MS,
          yoyo: true,
          repeat: ENEMY_FLASH_REPEAT,
          onComplete: () => {
            if (rect.active) {
              rect.setAlpha(1);
              rect.setFillStyle(entity.isDefeated ? 0x333333 : 0xcc4444);
            }
          },
        });
      }
    }

    // Floating damage number
    const pos = this.entityScreenPos(entity);
    const dmgText = this.scene.add.text(pos.x, pos.y, `-${dmg}`, {
      fontSize: '18px',
      color: isPlayer ? '#ff8888' : '#ffff44',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);
    this.scene.tweens.add({
      targets: dmgText,
      y: pos.y - 55,
      alpha: 0,
      duration: 900,
      ease: 'Power1',
      onComplete: () => dmgText.destroy(),
    });
  }

  /** Play a visual spell effect: expanding coloured ring that fades out. */
  private playSpellAnimation(actor: CombatEntity, element: string, name: string): void {
    const pos = this.entityScreenPos(actor);
    const color = ELEMENT_COLORS[element] ?? 0xaaaaff;

    // Spell name flash label
    const hexColor = `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
    const spellLabel = this.scene.add.text(pos.x, pos.y - 20, name, {
      fontSize: '16px',
      color: hexColor,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(55).setAlpha(0);

    this.scene.tweens.add({
      targets: spellLabel,
      alpha: { from: 0, to: 1 },
      y: pos.y - 45,
      duration: 250,
      yoyo: false,
      onComplete: () => {
        this.scene.time.delayedCall(300, () => {
          this.scene.tweens.add({
            targets: spellLabel,
            alpha: 0,
            duration: 350,
            onComplete: () => spellLabel.destroy(),
          });
        });
      },
    });

    // Expanding ring effect
    const ring = this.scene.add.rectangle(pos.x, pos.y, 10, 10, color, 0.5);
    ring.setDepth(54);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 9,
      scaleY: 9,
      alpha: 0,
      duration: 550,
      ease: 'Power2.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** Return the approximate screen position for an entity (used for floating damage numbers). */
  private entityScreenPos(entity: CombatEntity): { x: number; y: number } {
    if (entity instanceof PlayerCombatant) {
      const icon = this.playerIconRects.get(entity.id);
      return icon ? { x: icon.x, y: icon.y - 40 } : { x: Math.round(this.W * 0.125), y: Math.round(this.H * 0.25) };
    }
    const rect = this.enemyRects.get(entity.id);
    return rect ? { x: rect.x, y: rect.y - 50 } : { x: Math.round(this.W * 0.5625), y: Math.round(this.H * 0.217) };
  }

  /** Return the screen center of an entity (used to place the target cursor). */
  private entityCenter(entity: CombatEntity): { x: number; y: number } {
    if (entity instanceof PlayerCombatant) {
      const icon = this.playerIconRects.get(entity.id);
      return icon ? { x: icon.x, y: icon.y } : { x: Math.round(this.W * 0.125), y: this.ICON_Y };
    }
    const rect = this.enemyRects.get(entity.id);
    return rect ? { x: rect.x, y: rect.y } : { x: Math.round(this.W * 0.5625), y: this.ICON_Y };
  }

  /** Rebuild the CTB turn-order bar from the timeline preview. */
  private refreshTimeline(): void {
    this.timelineContainer.removeAll(true);
    this.timelineIcons = [];

    const order = this.system.getTimelinePreview(10);
    order.forEach((entity, idx) => {
      const isPlayer = this.system.players.includes(entity as PlayerCombatant);
      const color = isPlayer ? 0x4466ff : 0xcc4444;
      const cx = 6 + idx * TIMELINE_SLOT_W + TIMELINE_SLOT_W / 2;
      const cy = TIMELINE_H / 2;

      const icon = this.scene.add.rectangle(cx, cy, TIMELINE_SLOT_W - 4, TIMELINE_H - 6, color);
      icon.setStrokeStyle(1, isPlayer ? 0x88aaff : 0xff8888);
      const label = this.scene.add.text(cx, cy, entity.name.substring(0, TIMELINE_NAME_LEN), {
        fontSize: '9px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0.5);

      this.timelineContainer.add([icon, label]);
      this.timelineIcons.push(icon, label);
    });
  }

  private appendLog(_msg: string): void {
    const lines = [...this.system.log.slice(-LOG_LINE_COUNT)];
    lines.forEach((l, i) => this.logTexts[i]?.setText(l));
    for (let i = lines.length; i < this.logTexts.length; i++) {
      this.logTexts[i]?.setText('');
    }
  }

  navigateMenu(direction: 'up' | 'down'): void {
    const count = this.menuItems.length;
    if (count === 0) return;
    let newIdx = this.selectedMenuIndex;
    let iterations = 0;
    do {
      newIdx = direction === 'down' ? (newIdx + 1) % count : (newIdx - 1 + count) % count;
      iterations++;
    } while (this.menuDisabled[newIdx] && iterations < count);

    if (!this.menuDisabled[newIdx]) {
      this.selectedMenuIndex = newIdx;
      this.updateMenuHighlight();
      if (this.menuState === 'target') this.updateTargetCursor();
    }
  }

  confirmAction(): CombatAction | null {
    if (!this.currentActor) return null;
    const idx = this.selectedMenuIndex;

    if (this.menuState === 'main') {
      if (this.menuDisabled[idx]) return null;
      const mainOptions = ['attack', 'skill', 'item', 'defend', 'flee'] as const;
      const choice = mainOptions[idx];
      if (choice === 'attack') {
        this.enterTargetMode('attack');
        return null;
      } else if (choice === 'skill') {
        this.menuState = 'skill';
        this.buildSkillMenu();
        return null;
      } else if (choice === 'item') {
        this.menuState = 'item';
        this.buildItemMenu();
        return null;
      } else if (choice === 'defend') {
        return { type: 'defend' };
      } else if (choice === 'flee') {
        return { type: 'flee' };
      }
    }

    if (this.menuState === 'skill') {
      const skillIds = this.currentActor.skills.filter((s) => s !== 'attack');
      const skillId = skillIds[idx];
      if (!skillId) return null;
      const skillDef = skillsData.skills.find((s) => s.id === skillId);
      // Self-targeting skills execute immediately without target selection.
      if (skillDef?.target === 'self') {
        this.resetToMain();
        return { type: 'skill', skillId, target: this.currentActor };
      }
      this.pendingSkillId = skillId;
      this.enterTargetMode('skill');
      return null;
    }

    if (this.menuState === 'item') {
      const inv = GameState.getInstance().data.inventory;
      const item = inv[idx];
      if (!item) return null;
      this.pendingItemId = item.id;
      this.enterTargetMode('item');
      return null;
    }

    if (this.menuState === 'target') {
      const target = this.targetList[idx];
      if (!target) return null;
      const actionType = this.pendingActionType!;
      if (actionType === 'attack') {
        this.resetToMain();
        return { type: 'attack', target };
      } else if (actionType === 'skill') {
        const skillId = this.pendingSkillId!;
        this.resetToMain();
        return { type: 'skill', skillId, target };
      } else if (actionType === 'item') {
        const itemId = this.pendingItemId!;
        this.resetToMain();
        return { type: 'item', itemId, target };
      }
    }

    return null;
  }

  backMenu(): void {
    if (this.menuState === 'main') return;
    if (this.menuState === 'target') {
      this.hideTargetCursor();
      const prev = this.menuStateBeforeTarget;
      this.menuState = prev;
      if (prev === 'skill') {
        this.buildSkillMenu();
      } else if (prev === 'item') {
        this.buildItemMenu();
      } else {
        this.buildMainMenu();
      }
    } else {
      this.menuState = 'main';
      this.buildMainMenu();
    }
  }

  /** Show a brief full-screen announcement for preemptive/ambush battles. */
  private showBattleAnnouncement(text: string, color: string): void {
    const banner = this.scene.add.text(this.W / 2, this.H * 0.3, text, {
      fontSize: '36px',
      color,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 5,
    }).setOrigin(0.5).setDepth(100).setAlpha(0);

    this.scene.tweens.add({
      targets: banner,
      alpha: { from: 0, to: 1 },
      y: { from: this.H * 0.3, to: this.H * 0.25 },
      duration: 300,
      ease: 'Back.Out',
      yoyo: false,
      onComplete: () => {
        this.scene.time.delayedCall(900, () => {
          this.scene.tweens.add({
            targets: banner,
            alpha: 0,
            duration: 400,
            onComplete: () => banner.destroy(),
          });
        });
      },
    });
  }

  get isMenuVisible(): boolean {
    return this.menuContainer.visible;
  }

  destroy(): void {
    this.bus.off('combat:log', this.onCombatLog);
    this.bus.off('combat:damage', this.onCombatDamage);
    this.bus.off('combat:heal', this.onCombatHeal);
    this.bus.off('combat:mpChange', this.onCombatMpChange);
    this.bus.off('combat:turnStart', this.onCombatTurnStart);
    this.bus.off('combat:attackStart', this.onCombatAttackStart);
    this.bus.off('combat:spellStart', this.onCombatSpellStart);
    this.menuContainer.destroy();
    this.timelineContainer.destroy();
    this.logStripBg.destroy();
    this.logTexts.forEach((t) => t.destroy());
    this.targetCursor.destroy();
    this.targetPanelHighlight.destroy();
    this.activeTurnIndicator.destroy();
    this.helpText.destroy();
    this.navObjects.forEach((g) => g.destroy());
    // Explicitly destroy all tracked game objects
    this.enemyNameTexts.forEach((t) => t.destroy());
    this.playerNameTexts.forEach((t) => t.destroy());
    this.playerIconNames.forEach((t) => t.destroy());
    this.enemyRects.forEach((r) => r.destroy());
    this.playerIconRects.forEach((r) => r.destroy());
    this.playerBars.forEach(({ bg, bar, text }) => {
      bg.destroy();
      bar.destroy();
      text.destroy();
    });
    this.playerMpBars.forEach(({ bg, bar, text }) => {
      bg.destroy();
      bar.destroy();
      text.destroy();
    });
  }
}

