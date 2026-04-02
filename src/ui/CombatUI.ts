import { CombatSystem, CombatAction } from '../systems/combat/CombatSystem';
import { CombatEntity } from '../systems/combat/CombatEntity';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EnemyCombatant } from '../systems/combat/EnemyCombatant';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';
import { AccomplishmentSystem } from '../core/state/AccomplishmentSystem';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';
import charactersData from '../data/characters.json';

// Fixed/animation constants that don't depend on screen size
const TIMELINE_H = 36;
const TIMELINE_SLOT_W = 72;
const TIMELINE_NAME_LEN = 7;
const DAMAGE_FLASH_MS = 350;
const ENEMY_FLASH_MS = 150;
const ENEMY_FLASH_REPEAT = 3;
const LOG_STRIP_H = 42;
const LOG_LINE_COUNT = 3;
/** Height of the touch-nav bar pinned to the bottom of the combat screen (3 rows × 40 px). */
const NAV_BTN_H = 120;
/** Height of the menu title row in pixels. */
const MENU_TITLE_H = 34;
/** Height of each menu item row in pixels. */
const MENU_ITEM_H = 26;
/** Speed modifier for the Defend action — mirrors CombatSystem.DEFEND_SPEED_MODIFIER. */
const DEFEND_SPEED_MODIFIER = 0.5;

const HELP_TEXT_DEFAULT = '▲▼◄► Navigate   OK Confirm   BACK Cancel   Tap to target';
const HELP_TEXT_SKILL    = '▲▼◄► Navigate   OK Confirm   BACK Cancel   Hover skill for details';
const HELP_TEXT_ITEM     = '▲▼◄► Navigate   OK Confirm   BACK Cancel   Hover item for details';

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
  poison: 0x44cc44,
  haste: 0xffdd44,
  slow: 0x8844cc,
  reraise: 0xaaaaff,
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
const ATTACK_MOVE_FORWARD_MS = 240;
const ATTACK_MOVE_RETURN_MS = 300;
// Spell sparkle burst
const SPARKLE_MIN_DIST = 36;
const SPARKLE_DIST_VARIANCE = 28;

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
  // Status effect labels shown under player sprites and next to enemy names
  private playerStatusTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private enemyStatusTexts: Map<string, Phaser.GameObjects.Text> = new Map();
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
  /** Tooltips for each menu item in the current menu — used to update help text on navigation. */
  private menuTooltips: string[] = [];
  // Scrolling menu support
  private fullMenuItems: string[] = [];
  private menuScrollOffset = 0;
  private menuMaxVisible = 6;
  /** Base text of the menu title without scroll indicators. */
  private menuTitleBase = '';
  // Menu state machine
  private menuState: MenuState = 'main';
  private menuStateBeforeTarget: MenuState = 'main';
  private pendingActionType: 'attack' | 'skill' | 'item' | null = null;
  private pendingSkillId: string | null = null;
  private pendingItemId: string | null = null;
  /** Remembered main-menu cursor index per character — restored on each character's turn. */
  private lastMainMenuIndex: Map<string, number> = new Map();
  /** Remembered skill sub-menu cursor index per character — restored when skill menu opens. */
  private lastSkillMenuIndex: Map<string, number> = new Map();
  /** Remembered item sub-menu cursor index — restored when item menu opens. */
  private lastItemMenuIndex = 0;
  // Target selection
  private targetList: CombatEntity[] = [];
  private targetIsPositive = false;
  /** True when the pending action targets all enemies or all allies (no per-entity selection). */
  private pendingTargetsAll = false;
  private targetCursor!: Phaser.GameObjects.Rectangle;
  /** Semi-transparent highlight drawn over the targeted player's status row. */
  private targetPanelHighlight!: Phaser.GameObjects.Rectangle;
  // Timeline display
  private timelineContainer!: Phaser.GameObjects.Container;
  /** Fixed per-slot icon pairs for the timeline bar. Index = slot position. */
  private timelineSlotIcons: Array<[Phaser.GameObjects.Rectangle, Phaser.GameObjects.Text]> = [];
  /** Running tween that pulses the active slot in the timeline bar. */
  private timelinePulseTween: Phaser.Tweens.Tween | null = null;
  /** Running tween that pulses the active-turn indicator ring around the current actor. */
  private activeTurnTween: Phaser.Tweens.Tween | null = null;
  // Compact log strip
  private logStripBg!: Phaser.GameObjects.Rectangle;
  private logTexts: Phaser.GameObjects.Text[] = [];
  // Help text
  private helpText!: Phaser.GameObjects.Text;
  // Combat nav buttons (touch-friendly)
  private navObjects: Phaser.GameObjects.GameObject[] = [];
  // Spell animation handler reference (for cleanup)
  private onCombatSpellStart!: (actor: unknown, target: unknown, element: unknown, name: unknown) => void;
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
  private onStatusApplied!: (entity: unknown, effectId: unknown) => void;
  private onStatusRemoved!: (entity: unknown, effectId: unknown) => void;
  private onStatusDot!: (entity: unknown, effectId: unknown, dmg: unknown) => void;
  private onCombatTimelineShift!: (actor: unknown, beforeOrder: unknown, afterOrder: unknown, speedModifier: unknown) => void;

  /** Called by CombatScene when a menu item is tapped — triggers confirmAction(). */
  onMenuTap?: () => void;

  /** Deferred damage-display timings (ms) keyed by entity id.
   *  When a single-target spell projectile is in flight to a target, the damage
   *  animation is delayed by the projectile travel time so the floating number
   *  appears at visual impact rather than at cast time.
   *  AoE spells pass `null` as the animation target, so no entry is recorded and
   *  each target's damage number appears immediately (no misleading grouping). */
  private pendingDamageDelay: Map<string, number> = new Map();

  constructor(scene: Phaser.Scene, system: CombatSystem, battleType: import('../systems/combat/CombatSystem').BattleType = 'normal', isBossBattle = false) {
    this.scene = scene;
    this.system = system;
    this.isBossBattle = isBossBattle;
    this.bus = EventBus.getInstance();

    // Compute all layout constants from the actual screen dimensions so the
    // combat UI fills the available space on any screen (including portrait).
    this.W = scene.scale.width;
    this.H = scene.scale.height;
    // Use 48% of height for the battlefield so there is enough room for HP/MP bars
    // rendered directly under each player sprite.
    this.BATTLEFIELD_BOTTOM = Math.round(this.H * 0.48);
    this.LOG_STRIP_Y = this.BATTLEFIELD_BOTTOM + 4;
    this.BOTTOM_Y = this.LOG_STRIP_Y + LOG_STRIP_H + 4;
    // Menu spans the full width below the log strip.
    this.MENU_X = 8;
    this.MENU_W = this.W - 16;

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

    // HP/MP bars live directly under each player sprite icon, so the bar width
    // matches the player icon width.
    this.BAR_HALF_W = Math.round(PLAYER_ICON_W / 2);

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
      // Show element icon next to enemy name; clamp x so text stays within screen bounds
      const elemIcon = e.element ? (ELEMENT_ICONS[e.element] ?? '') : '';
      const rawEnemyName = `${e.name}${elemIcon ? ' ' + elemIcon : ''}`;
      // Clamp the text center-x so the text box (up to 90px wide) never clips the screen edge
      const nameTextX = Math.max(46, Math.min(this.W - 46, x));
      const nameText = this.scene.add
        .text(nameTextX, y + ENEMY_H / 2 + 8, rawEnemyName, {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: 'monospace',
          wordWrap: { width: 90 },
        })
        .setOrigin(0.5)
        .setDepth(6);
      this.enemyRects.set(e.id, icon);
      this.enemyNameTexts.push(nameText);
      // Status effect label below enemy name
      const enemyStatusText = this.scene.add
        .text(x, y + ENEMY_H / 2 + 21, '', {
          fontSize: '9px',
          color: '#ffdd88',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5)
        .setDepth(6);
      this.enemyStatusTexts.set(e.id, enemyStatusText);
    });

    // ── Player icons (lower portion of battlefield, full-width spread) ───────
    const pCount = this.system.players.length;
    this.system.players.forEach((p, idx) => {
      const x = this.PLAYER_BASE_X + idx * Math.floor(this.PLAYER_SPREAD / Math.max(pCount, 1));
      const y = this.playerRowY;
      let icon: EntityIcon;
      if (this.scene.textures.exists('player')) {
        // Use character-specific texture if available (player_kael, player_lyra), else 'player'
        const charTex = this.scene.textures.exists(`player_${p.id}`) ? `player_${p.id}` : 'player';
        icon = this.scene.add
          .image(x, y, charTex)
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

      // ── HP and MP bars directly under the player sprite ──────────────────
      const hpBarY = y + PLAYER_ICON_H / 2 + 20;
      const mpBarY = hpBarY + 9;
      const barW = PLAYER_ICON_W;
      const hpBg  = this.scene.add.rectangle(x, hpBarY, barW, 6, 0x333333).setDepth(6);
      const hpBar = this.scene.add.rectangle(x, hpBarY, barW, 6, 0x44aa44).setDepth(7);
      const hpText = this.scene.add
        .text(x + barW / 2 + 3, hpBarY - 2, `${p.stats.hp}/${p.stats.maxHp}`, {
          fontSize: '8px', color: '#ccffcc', fontFamily: 'monospace',
        })
        .setOrigin(0, 0.5)
        .setDepth(7);
      this.playerBars.set(p.id, { bg: hpBg, bar: hpBar, text: hpText });

      const mpBg  = this.scene.add.rectangle(x, mpBarY, barW, 5, 0x222244).setDepth(6);
      const mpBar = this.scene.add.rectangle(x, mpBarY, barW, 5, 0x4466cc).setDepth(7);
      const mpText = this.scene.add
        .text(x + barW / 2 + 3, mpBarY - 2, `${p.stats.mp}/${p.stats.maxMp}`, {
          fontSize: '8px', color: '#aaaaff', fontFamily: 'monospace',
        })
        .setOrigin(0, 0.5)
        .setDepth(7);
      this.playerMpBars.set(p.id, { bg: mpBg, bar: mpBar, text: mpText });

      // Status effect label below the MP bar
      const statusTextY = mpBarY + 10;
      const statusText = this.scene.add
        .text(x, statusTextY, '', {
          fontSize: '9px',
          color: '#ffdd88',
          fontFamily: 'monospace',
        })
        .setOrigin(0.5, 0)
        .setDepth(7);
      this.playerStatusTexts.set(p.id, statusText);
    });

    // ── Target cursor (hidden initially) ─────────────────────────────────────
    this.targetCursor = this.scene.add.rectangle(0, 0, 92, 92, 0x000000, 0);
    this.targetCursor.setStrokeStyle(3, 0xffff00);
    this.targetCursor.setDepth(15);
    this.targetCursor.setVisible(false);

    // ── Target panel highlight (hidden initially) ─────────────────────────────
    // Positioned at the active target's sprite HP/MP bar area in the battlefield.
    this.targetPanelHighlight = this.scene.add.rectangle(0, 0, PLAYER_ICON_W + 8, 22, 0x44ff88, 0);
    this.targetPanelHighlight.setStrokeStyle(2, 0x44ff88);
    this.targetPanelHighlight.setDepth(9);
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

    // ── Bottom panel background (menu area, above the nav button strip) ──────
    const menuAreaH = this.H - NAV_BTN_H - this.BOTTOM_Y;
    this.scene.add.rectangle(
      this.W / 2, this.BOTTOM_Y + menuAreaH / 2, this.W, menuAreaH, 0x0d0d1f, 0.95,
    ).setDepth(18);

    // Initialise bar scales to match the actual current HP/MP values so the bars
    // are correct from the very first frame (not just after the first damage/heal event).
    this.system.players.forEach((p) => this.refreshEntityDisplay(p));
    // Initialise enemy display state — critical for resumed battles where some
    // enemies may already be dead (hp=0) and must appear dimmed from the start.
    this.system.enemies.forEach((e) => this.refreshEntityDisplay(e));

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

    // ── Help text — just above the nav button strip at the bottom ────────────
    // Must be initialized BEFORE buildMainMenu() is called, because that method
    // accesses this.helpText immediately.
    this.helpText = this.scene.add
      .text(this.W / 2, this.H - NAV_BTN_H - 4, HELP_TEXT_DEFAULT, {
        fontSize: '14px',
        color: '#ffe066',
        fontFamily: 'monospace',
        wordWrap: { width: this.W - 16 },
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(25);

    this.buildMainMenu();
  }

  /** Build the combat navigation buttons pinned to the very bottom of the screen.
   *  Layout: two equal columns, each consuming the full NAV_BTN_H height.
   *
   *  LEFT COLUMN — directional D-pad (3 rows of NAV_BTN_H/3 each):
   *    Row 1: ▲  (full left-half width)
   *    Row 2: ◄  |  ►  (split into two quarter-width buttons)
   *    Row 3: ▼  (full left-half width)
   *
   *  RIGHT COLUMN — action buttons (2 rows of NAV_BTN_H/2 each):
   *    Row 1: OK
   *    Row 2: BACK
   */
  private buildNavButtons(): void {
    const HALF_W    = Math.floor(this.W / 2);
    const QUARTER_W = Math.floor(this.W / 4);
    const ROW_H     = Math.floor(NAV_BTN_H / 3); // ~40 px each row (left d-pad)
    const R_ROW_H   = Math.floor(NAV_BTN_H / 2); // 60 px each row (right actions)
    const NAV_TOP   = this.H - NAV_BTN_H;        // absolute Y of the top of the nav bar

    // Dark background strip for the whole nav bar (hidden until player turn).
    const navBg = this.scene.add.rectangle(this.W / 2, NAV_TOP + NAV_BTN_H / 2, this.W, NAV_BTN_H, 0x0a0a1a, 0.95);
    navBg.setStrokeStyle(1, 0x333355);
    navBg.setDepth(31);
    navBg.setVisible(false);
    this.navObjects.push(navBg);

    /**
     * Create a single nav button.
     * @param label   Display label
     * @param cx      Horizontal centre of the button
     * @param cy      Vertical centre of the button
     * @param bw      Button width
     * @param bh      Button height
     * @param color   Background fill colour
     * @param stroke  Border colour
     * @param onTap   Callback when pressed
     */
    const makeBtn = (
      label: string,
      cx: number,
      cy: number,
      bw: number,
      bh: number,
      color: number,
      stroke: number,
      onTap: () => void,
    ): void => {
      const bg = this.scene.add.rectangle(cx, cy, bw - 4, bh - 4, color, 0.90);
      bg.setStrokeStyle(2, stroke);
      bg.setDepth(32);
      bg.setVisible(false);
      bg.setInteractive({ useHandCursor: true });
      const txt = this.scene.add
        .text(cx, cy, label, { fontSize: '22px', color: '#ffffff', fontFamily: 'monospace' })
        .setOrigin(0.5)
        .setDepth(33)
        .setVisible(false);
      bg.on('pointerdown', (_pointer: unknown, _lx: unknown, _ly: unknown, event: { stopPropagation: () => void }) => {
        event.stopPropagation();
        onTap();
      });
      this.navObjects.push(bg, txt);
    };

    // ── Left column — D-pad ──────────────────────────────────────────────────
    // Row 1: ▲  (full left-half width)
    makeBtn('▲',
      HALF_W / 2, NAV_TOP + ROW_H / 2,
      HALF_W, ROW_H,
      0x223355, 0x5577bb,
      () => this.navigateMenu('up'),
    );
    // Row 2: ◄  (left quarter width)
    makeBtn('◄',
      QUARTER_W / 2, NAV_TOP + ROW_H + ROW_H / 2,
      QUARTER_W, ROW_H,
      0x223355, 0x5577bb,
      () => this.navigateMenu('left'),
    );
    // Row 2: ►  (second quarter width)
    makeBtn('►',
      QUARTER_W + QUARTER_W / 2, NAV_TOP + ROW_H + ROW_H / 2,
      QUARTER_W, ROW_H,
      0x223355, 0x5577bb,
      () => this.navigateMenu('right'),
    );
    // Row 3: ▼  (full left-half width)
    makeBtn('▼',
      HALF_W / 2, NAV_TOP + ROW_H * 2 + ROW_H / 2,
      HALF_W, ROW_H,
      0x223355, 0x5577bb,
      () => this.navigateMenu('down'),
    );

    // ── Right column — action buttons ────────────────────────────────────────
    // Top half: OK
    makeBtn('OK',
      HALF_W + HALF_W / 2, NAV_TOP + R_ROW_H / 2,
      HALF_W, R_ROW_H,
      0x1a3322, 0x44aa66,
      () => this.onMenuTap?.(),
    );
    // Bottom half: BACK
    makeBtn('BACK',
      HALF_W + HALF_W / 2, NAV_TOP + R_ROW_H + R_ROW_H / 2,
      HALF_W, R_ROW_H,
      0x331a1a, 0xaa4444,
      () => this.backMenu(),
    );
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

  /** Rebuild the visible menu items inside the container. Supports scrolling for long lists. */
  private buildMenuItems(items: string[], disabled: boolean[] = [], tooltips: string[] = []): void {
    this.menuItems.forEach((t) => t.destroy());
    this.menuItems = [];
    // Store full lists for scroll window rendering
    this.fullMenuItems = [...items];
    this.menuDisabled = disabled.length === items.length ? [...disabled] : items.map(() => false);
    this.menuTooltips = tooltips.length === items.length ? [...tooltips] : items.map(() => '');
    this.selectedMenuIndex = 0;
    this.menuScrollOffset = 0;
    // Compute max visible items from the available menu area height (minus title row)
    const menuAreaH = this.H - NAV_BTN_H - this.BOTTOM_Y;
    this.menuMaxVisible = Math.max(3, Math.floor((menuAreaH - MENU_TITLE_H) / MENU_ITEM_H));
    // Show the tooltip for the first (auto-selected) item immediately.
    if (this.menuTooltips[0] && this.helpText?.active) {
      this.helpText.setText(this.menuTooltips[0]);
    }
    this.renderMenuWindow();
  }

  /** Render only the currently visible window of menu items. */
  private renderMenuWindow(): void {
    this.menuItems.forEach((t) => t.destroy());
    this.menuItems = [];
    const start = this.menuScrollOffset;
    const end = Math.min(start + this.menuMaxVisible, this.fullMenuItems.length);
    for (let vi = 0; vi < end - start; vi++) {
      const gi = start + vi; // global index into fullMenuItems
      const label = this.fullMenuItems[gi];
      const isDisabled = this.menuDisabled[gi];
      const isSelected = gi === this.selectedMenuIndex;
      const color = isDisabled ? '#555555' : isSelected ? '#ffff00' : '#ffffff';
      const t = this.scene.add.text(12, MENU_ITEM_H * (vi + 1), label, {
        fontSize: '16px',
        color,
        fontFamily: 'monospace',
      });
      if (!isDisabled) {
        const capturedGi = gi;
        t.setInteractive({ useHandCursor: true });
        t.on('pointerover', () => {
          if (!this.menuDisabled[capturedGi] && this.menuContainer.visible) {
            this.selectedMenuIndex = capturedGi;
            this.updateMenuHighlight();
            if (this.menuState === 'target') this.updateTargetCursor();
            const tip = this.menuTooltips[capturedGi];
            if (tip && this.helpText.active) this.helpText.setText(tip);
            // Update timeline preview based on the hovered option.
            this.onMenuSelectionChanged();
          }
        });
        t.on('pointerdown', () => {
          if (!this.menuDisabled[capturedGi] && this.menuContainer.visible) {
            this.selectedMenuIndex = capturedGi;
            this.updateMenuHighlight();
            if (this.menuState === 'target') this.updateTargetCursor();
            this.onMenuTap?.();
          }
        });
      }
      this.menuContainer.add(t);
      this.menuItems.push(t);
    }
    // Update the title with scroll indicators (▲/▼) when the list is longer than the visible window
    const canScrollUp = this.menuScrollOffset > 0;
    const canScrollDown = this.menuScrollOffset + this.menuMaxVisible < this.fullMenuItems.length;
    const scrollHint = canScrollUp && canScrollDown ? ' ▲▼' : canScrollUp ? ' ▲' : canScrollDown ? ' ▼' : '';
    if (this.menuTitle.active) this.menuTitle.setText(this.menuTitleBase + scrollHint);
    // Resize background to fit visible items (capped to menu area)
    const visibleCount = end - start;
    const h = Math.max(70, MENU_ITEM_H + visibleCount * MENU_ITEM_H + 14);
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
    this.menuTitleBase = 'ACTION';
    this.menuTitle.setText(this.menuTitleBase);
    const actor = this.currentActor;
    const specialSkills = actor ? actor.skills.filter((s) => s !== 'attack') : [];
    const hasSkills = specialSkills.length > 0;
    const hasItems = GameState.getInstance().data.inventory.length > 0;
    const skillLabel = this.skillMenuLabel();
    const tooltips = [
      'Attack the enemy with a physical strike.',
      `Use ${actor?.name ?? 'the character'}'s ${skillLabel.toLowerCase()} abilities.`,
      'Use an item from your inventory (potions, etc.).',
      'Take a defensive stance to reduce incoming damage. Advances your next turn [VF].',
      'Attempt to flee from the battle. Cannot flee from bosses.',
    ];
    if (this.helpText.active) this.helpText.setText(HELP_TEXT_DEFAULT);
    this.buildMenuItems(
      ['Attack', skillLabel, 'Item', 'Defend [VF]', 'Flee'],
      [false, !hasSkills, !hasItems, false, this.isBossBattle],
      tooltips,
    );
    // Restore this character's remembered cursor position (if the saved option is
    // still enabled — e.g. Skills may have become unavailable since last turn).
    if (actor) {
      const savedIdx = this.lastMainMenuIndex.get(actor.id);
      if (savedIdx !== undefined && savedIdx < this.fullMenuItems.length && !this.menuDisabled[savedIdx]) {
        this.selectedMenuIndex = savedIdx;
        this.updateMenuHighlight();
        const tip = this.menuTooltips[savedIdx];
        if (tip && this.helpText.active) this.helpText.setText(tip);
      }
    }
    // Show timeline preview for the initially selected option.
    this.onMenuSelectionChanged();
  }

  private buildSkillMenu(): void {
    this.menuTitleBase = `${this.skillMenuLabel()}  [BACK: cancel]`;
    this.menuTitle.setText(this.menuTitleBase);
    const actor = this.currentActor;
    const skillIds = actor ? actor.skills.filter((s) => s !== 'attack') : [];
    const items = skillIds.map((id) => {
      const def = skillsData.skills.find((s) => s.id === id);
      if (!def) return id;
      const speedMod = (def as { speedModifier?: number }).speedModifier ?? 1.0;
      let speedTag = '';
      if (speedMod <= 0.7) speedTag = ' [VF]';
      else if (speedMod <= 0.9) speedTag = ' [F]';
      else if (speedMod >= 1.4) speedTag = ' [VS]';
      else if (speedMod >= 1.2) speedTag = ' [S]';
      return `${def.name} MP:${def.mpCost}${speedTag}`;
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
    // Restore this character's remembered skill cursor (if valid and not disabled).
    if (actor) {
      const savedIdx = this.lastSkillMenuIndex.get(actor.id);
      if (savedIdx !== undefined && savedIdx < this.fullMenuItems.length && !this.menuDisabled[savedIdx]) {
        this.selectedMenuIndex = savedIdx;
        this.updateMenuHighlight();
        const tip = this.menuTooltips[savedIdx];
        if (tip && this.helpText.active) this.helpText.setText(tip);
      }
    }
    // Show timeline preview for the initially selected skill.
    this.onMenuSelectionChanged();
  }

  private buildItemMenu(): void {
    this.menuTitleBase = 'ITEM   [BACK: cancel]';
    this.menuTitle.setText(this.menuTitleBase);
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
    // Restore the remembered item cursor (clamped to current inventory size).
    const clampedIdx = Math.min(this.lastItemMenuIndex, Math.max(0, this.fullMenuItems.length - 1));
    if (clampedIdx < this.fullMenuItems.length) {
      this.selectedMenuIndex = clampedIdx;
      this.updateMenuHighlight();
      const tip = this.menuTooltips[clampedIdx];
      if (tip && this.helpText.active) this.helpText.setText(tip);
    }
  }

  private enterTargetMode(actionType: 'attack' | 'skill' | 'item'): void {
    this.menuStateBeforeTarget = this.menuState;
    this.menuState = 'target';
    this.pendingActionType = actionType;
    this.pendingTargetsAll = false;

    // Determine the effective targeting type for this action
    let effectiveTarget = 'single_enemy';
    let preferAlly = false;
    let revivalItem = false;
    let revivalSkill = false;
    if (actionType === 'item' && this.pendingItemId) {
      const itemDef = itemsData.items.find((it) => it.id === this.pendingItemId);
      effectiveTarget = itemDef?.target ?? 'single_ally';
      const effect = itemDef?.effect as Record<string, unknown> | undefined;
      if (effect?.['revive']) {
        revivalItem = true;
        preferAlly = true; // green cursor for positive action
      } else {
        preferAlly = effectiveTarget === 'single_ally' || effectiveTarget === 'all_allies';
      }
    } else if (actionType === 'skill' && this.pendingSkillId) {
      const skillDef = skillsData.skills.find((s) => s.id === this.pendingSkillId);
      effectiveTarget = skillDef?.target ?? 'single_enemy';
      preferAlly = effectiveTarget === 'single_ally' || effectiveTarget === 'all_allies'
        || effectiveTarget === 'single_dead_ally';
      revivalSkill = effectiveTarget === 'single_dead_ally';
    }

    // Positive actions (heals, buffs, items on allies) use a green cursor;
    // hostile actions (attacks, offensive skills) use a red cursor.
    this.targetIsPositive = preferAlly;

    // All-enemies: show a single "All Enemies" confirmation option
    if (effectiveTarget === 'all_enemies') {
      this.pendingTargetsAll = true;
      this.targetList = this.system.enemies.filter((e) => !e.isDefeated);
      this.menuTitleBase = 'TARGET [BACK: cancel]';
      this.menuTitle.setText(this.menuTitleBase);
      this.buildMenuItems(['⚔ All Enemies (everyone)']);
      this.hideTargetCursor();
      return;
    }

    // All-allies: show a single "All Allies" confirmation option
    if (effectiveTarget === 'all_allies') {
      this.pendingTargetsAll = true;
      this.targetList = this.system.players.filter((p) => !p.isDefeated);
      this.menuTitleBase = 'TARGET [BACK: cancel]';
      this.menuTitle.setText(this.menuTitleBase);
      this.buildMenuItems(['✨ All Allies (everyone)']);
      this.hideTargetCursor();
      return;
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

    this.menuTitleBase = 'TARGET [BACK: cancel]';
    this.menuTitle.setText(this.menuTitleBase);
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
    this.pendingTargetsAll = false;
    this.hideTargetCursor();
    this.buildMainMenu();
  }

  private updateMenuHighlight(): void {
    this.menuItems.forEach((t, vi) => {
      const gi = this.menuScrollOffset + vi;
      const disabled = this.menuDisabled[gi];
      t.setColor(disabled ? '#555555' : gi === this.selectedMenuIndex ? '#ffff00' : '#ffffff');
    });
  }

  private updateTargetCursor(): void {
    // All-targets actions don't have a per-entity cursor — keep it hidden.
    if (this.pendingTargetsAll) {
      this.targetCursor.setVisible(false);
      this.targetPanelHighlight.setVisible(false);
      return;
    }
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

    // Also highlight the HP/MP bar area under the player sprite in the battlefield.
    if (target instanceof PlayerCombatant) {
      const pIdx = this.system.players.indexOf(target);
      if (pIdx !== -1) {
        const pCount = this.system.players.length;
        const iconX = this.PLAYER_BASE_X + pIdx * Math.floor(this.PLAYER_SPREAD / Math.max(pCount, 1));
        // Centre of the HP+MP bar band (20 px below sprite bottom edge)
        const barCenterY = this.playerRowY + PLAYER_ICON_H / 2 + 24;
        this.targetPanelHighlight.setPosition(iconX, barCenterY);
        this.targetPanelHighlight.setSize(PLAYER_ICON_W + 8, 22);
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
      const delay = this.pendingDamageDelay.get((entity as CombatEntity).id) ?? 0;
      this.pendingDamageDelay.delete((entity as CombatEntity).id);
      if (delay > 0) {
        // Defer the floating damage number so it appears when the spell projectile arrives.
        this.scene.time.delayedCall(delay, () => {
          this.playDamageAnimation(entity as CombatEntity, dmg as number);
        });
      } else {
        this.playDamageAnimation(entity as CombatEntity, dmg as number);
      }
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
          y: pos.y - 65,
          alpha: 0,
          duration: 1300,
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
      // Restart the pulsing animation on the active-turn indicator so it keeps
      // animating after every turn transition (stopping the previous tween resets
      // scale to 1 to avoid drift).
      if (this.activeTurnTween) {
        this.activeTurnTween.stop();
        this.activeTurnTween = null;
        this.activeTurnIndicator.setScale(1, 1);
      }
      this.activeTurnTween = this.scene.tweens.add({
        targets: this.activeTurnIndicator,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Highlight the active player's name in the status panel
      this.highlightActiveTurn(actor as CombatEntity);
    };
    this.onCombatAttackStart = (actor, target) => {
      this.playAttackMoveAnimation(actor as CombatEntity, target as CombatEntity);
    };
    this.onCombatSpellStart = (actor, target, element, name) => {
      this.playSpellAnimation(
        actor as CombatEntity,
        target as CombatEntity | null,
        element as string,
        name as string,
      );
    };
    this.bus.on('combat:log', this.onCombatLog);
    this.bus.on('combat:damage', this.onCombatDamage);
    this.bus.on('combat:heal', this.onCombatHeal);
    this.bus.on('combat:mpChange', this.onCombatMpChange);
    this.bus.on('combat:turnStart', this.onCombatTurnStart);
    this.bus.on('combat:attackStart', this.onCombatAttackStart);
    this.bus.on('combat:spellStart', this.onCombatSpellStart);

    this.onStatusApplied = (entity) => this.refreshStatusDisplay(entity as CombatEntity);
    this.onStatusRemoved = (entity) => this.refreshStatusDisplay(entity as CombatEntity);
    this.onStatusDot = (entity, _effectId, dmg) => {
      this.playPoisonDotAnimation(entity as CombatEntity, dmg as number);
    };
    this.bus.on('status:applied', this.onStatusApplied);
    this.bus.on('status:removed', this.onStatusRemoved);
    this.bus.on('status:dot', this.onStatusDot);

    this.onCombatTimelineShift = (actor, beforeOrder, afterOrder, speedModifier) => {
      this.animateTimelineShift(
        actor as CombatEntity,
        beforeOrder as CombatEntity[],
        afterOrder as CombatEntity[],
        speedModifier as number,
      );
    };
    this.bus.on('combat:timelineShift', this.onCombatTimelineShift);
  }

  /** Highlight the name of the currently acting player under their battlefield sprite. */
  private highlightActiveTurn(actor: CombatEntity): void {
    this.playerIconNames.forEach((t, i) => {
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

  /**
   * Hide the action menu and nav controls immediately after the player confirms
   * an action.  Prevents stale interaction with menu buttons while combat
   * animations are playing.  The menu will reappear on the next player turn via
   * the normal combat:turnStart flow.
   */
  hideMenuForAction(): void {
    if (this.menuContainer.active) this.menuContainer.setVisible(false);
    this.setNavVisible(false);
    this.hideTargetCursor();
  }

  private refreshEntityDisplay(entity: CombatEntity): void {
    if (entity instanceof PlayerCombatant) {
      const bars = this.playerBars.get(entity.id);
      if (bars) {
        const ratio = entity.stats.hp / entity.stats.maxHp;
        bars.bar.setScale(ratio, 1);
        bars.bar.setPosition(bars.bg.x - this.BAR_HALF_W * (1 - ratio), bars.bg.y);
        // Always sync bar color with alive state so a revived character's bar
        // immediately turns green instead of remaining the defeated dark color.
        if (bars.bar.active) {
          bars.bar.setFillStyle(entity.isDefeated ? 0x222222 : 0x44aa44);
        }
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
          (rect as Phaser.GameObjects.Rectangle).setAlpha(entity.isDefeated ? 0.4 : 1.0);
        }
      }
      // Dim the enemy name text when defeated so state visually matches the sprite.
      const enemyIdx = this.system.enemies.indexOf(entity as EnemyCombatant);
      const nameText = enemyIdx >= 0 ? this.enemyNameTexts[enemyIdx] : null;
      if (nameText && nameText.active) {
        nameText.setAlpha(entity.isDefeated ? 0.35 : 1.0);
        nameText.setColor(entity.isDefeated ? '#888888' : '#ffffff');
      }
    }
    // Always sync the status label when entity display is refreshed.
    this.refreshStatusDisplay(entity);
  }

  /** Short icons shown for each status effect in the battlefield. */
  private static readonly STATUS_ICONS: Record<string, string> = {
    haste: '⚡H',
    slow: '🐢S',
    reraise: '✨AL',
    poison: '☠P',
    powerDown: '↓STR',
    provoked: '😡PRV',
  };

  /** Refresh the status effect label for a player or enemy entity. */
  private refreshStatusDisplay(entity: CombatEntity): void {
    const effects = Array.from(entity.statusEffects);
    const label = effects
      .map((id) => CombatUI.STATUS_ICONS[id] ?? id.toUpperCase())
      .join(' ');

    if (entity instanceof PlayerCombatant) {
      const t = this.playerStatusTexts.get(entity.id);
      if (t && t.active) t.setText(label);
    } else {
      const t = this.enemyStatusTexts.get(entity.id);
      if (t && t.active) t.setText(label);
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
    const isKillingBlow = entity.isDefeated;

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
      // Enemy damage flash — always runs even on a killing blow so the player
      // can see the hit before the sprite fades to a defeated state.
      const icon = this.enemyRects.get(entity.id);
      if (icon && icon.active) {
        if (icon instanceof Phaser.GameObjects.Image) {
          icon.setTint(isKillingBlow ? 0xff2222 : 0xffffff);
          this.scene.tweens.add({
            targets: icon,
            alpha: { from: 1, to: 0.25 },
            duration: ENEMY_FLASH_MS,
            yoyo: !isKillingBlow,
            repeat: isKillingBlow ? 0 : ENEMY_FLASH_REPEAT,
            onComplete: () => {
              if (icon.active) {
                icon.setAlpha(isKillingBlow ? 0.4 : 1);
                icon.setTint(isKillingBlow ? 0x333333 : 0xffffff);
              }
            },
          });
        } else {
          const rect = icon as Phaser.GameObjects.Rectangle;
          rect.setFillStyle(isKillingBlow ? 0xff2222 : 0xffffff);
          this.scene.tweens.add({
            targets: rect,
            alpha: { from: 1, to: 0.25 },
            duration: ENEMY_FLASH_MS,
            yoyo: !isKillingBlow,
            repeat: isKillingBlow ? 0 : ENEMY_FLASH_REPEAT,
            onComplete: () => {
              if (rect.active) {
                rect.setAlpha(isKillingBlow ? 0.4 : 1);
                rect.setFillStyle(isKillingBlow ? 0x333333 : 0xcc4444);
              }
            },
          });
        }
      }
    }

    // ── Floating damage number ─────────────────────────────────────────────
    const pos = this.entityScreenPos(entity);
    // Killing blows get a larger, brighter colour to make them stand out.
    const fontSize  = isKillingBlow && !isPlayer ? '26px' : '18px';
    const textColor = isPlayer ? '#ff8888'
                    : isKillingBlow ? '#ff4400'
                    : '#ffff44';

    const dmgText = this.scene.add.text(pos.x, pos.y, `-${dmg}`, {
      fontSize,
      color: textColor,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: isKillingBlow && !isPlayer ? 4 : 3,
    }).setOrigin(0.5).setDepth(50);

    this.scene.tweens.add({
      targets: dmgText,
      y: pos.y - 75,
      alpha: 0,
      duration: 1400,
      ease: 'Power1',
      onComplete: () => dmgText.destroy(),
    });

    // Killing-blow banner: show "FATAL!" above the damage number.
    if (isKillingBlow && !isPlayer) {
      const fatalText = this.scene.add.text(pos.x, pos.y - 30, '✦ FATAL ✦', {
        fontSize: '20px',
        color: '#ff6600',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5).setDepth(51);

      this.scene.tweens.add({
        targets: fatalText,
        y: pos.y - 80,
        alpha: 0,
        duration: 1600,
        ease: 'Power2',
        onComplete: () => fatalText.destroy(),
      });

      // Check for overkill accomplishment (damage exceeded 150% of the enemy's max HP).
      if (dmg > entity.stats.maxHp * 1.5) {
        AccomplishmentSystem.getInstance().recordOverkill();
      }
    }
  }


  /** Play a visual spell effect: a cast ring at the caster, then a projectile
   *  that travels to the target with an element-specific shape and colour, and
   *  an impact burst when it arrives.  When no specific target is supplied the
   *  old expanding-ring / sparkle effect is used (covers AoE fallback). */
  private playSpellAnimation(
    actor: CombatEntity,
    target: CombatEntity | null,
    element: string,
    name: string,
  ): void {
    const actorPos = this.entityScreenPos(actor);
    const color = ELEMENT_COLORS[element] ?? 0xaaaaff;
    const hexColor = `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;

    // ── Spell name banner (floats up from caster) ──────────────────────────
    const spellLabel = this.scene.add.text(actorPos.x, actorPos.y - 20, name, {
      fontSize: '18px',
      color: hexColor,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(55).setAlpha(0);

    this.scene.tweens.add({
      targets: spellLabel,
      alpha: { from: 0, to: 1 },
      y: actorPos.y - 50,
      duration: 280,
      ease: 'Back.Out',
      onComplete: () => {
        this.scene.time.delayedCall(500, () => {
          this.scene.tweens.add({
            targets: spellLabel,
            alpha: 0,
            y: actorPos.y - 75,
            duration: 480,
            onComplete: () => spellLabel.destroy(),
          });
        });
      },
    });


    const targetPos = target ? this.entityScreenPos(target) : null;

    if (!targetPos) {
      // ── AoE fallback: original expanding rings + sparkle burst at caster ──
      this.scene.time.delayedCall(120, () => {
        const ring2 = this.scene.add.rectangle(actorPos.x, actorPos.y, 8, 8, color, 0.35);
        ring2.setDepth(53);
        this.scene.tweens.add({
          targets: ring2,
          scaleX: 7,
          scaleY: 7,
          alpha: 0,
          duration: 560,
          ease: 'Power2.easeOut',
          onComplete: () => ring2.destroy(),
        });
      });
      const SPARKS = 8;
      for (let k = 0; k < SPARKS; k++) {
        const angle = (k / SPARKS) * Math.PI * 2;
        const dist  = SPARKLE_MIN_DIST + Math.random() * SPARKLE_DIST_VARIANCE;
        const spark = this.scene.add.rectangle(actorPos.x, actorPos.y, 6, 6, color, 0.9);
        spark.setDepth(56);
        this.scene.tweens.add({
          targets: spark,
          x: actorPos.x + Math.cos(angle) * dist,
          y: actorPos.y + Math.sin(angle) * dist,
          scaleX: 0.1,
          scaleY: 0.1,
          alpha: 0,
          duration: 560 + Math.random() * 200,
          ease: 'Power1.easeOut',
          delay: 40 + k * 20,
          onComplete: () => spark.destroy(),
        });
      }
      return;
    }

    // ── Projectile: element-specific shape flies from caster to target ─────
    // Lightning is very fast; all others travel at a steady pace.
    const travelMs = element === 'lightning' ? 200 : 400;

    // Store the travel time so the combat:damage handler can defer the floating
    // damage number until the projectile visually arrives.  For AoE spells
    // target is null (handled above), so no entry is recorded and each target's
    // damage number appears immediately.
    if (target) {
      this.pendingDamageDelay.set(target.id, travelMs);
    }

    let proj: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle;
    if (element === 'ice') {
      // Diamond shard: rotated square
      proj = this.scene.add.rectangle(actorPos.x, actorPos.y, 14, 14, color, 1);
      proj.setAngle(45);
    } else if (element === 'lightning') {
      // Narrow bolt oriented toward the target
      const angleDeg =
        Math.atan2(targetPos.y - actorPos.y, targetPos.x - actorPos.x) * (180 / Math.PI);
      proj = this.scene.add.rectangle(actorPos.x, actorPos.y, 28, 5, color, 1);
      proj.setAngle(angleDeg);
    } else {
      // Fireball / water drop / poison bubble / heal orb — all circular
      const radius = element === 'fire' ? 11 : 9;
      proj = this.scene.add.circle(actorPos.x, actorPos.y, radius, color, 1);
    }
    proj.setDepth(58);

    this.scene.tweens.add({
      targets: proj,
      x: targetPos.x,
      y: targetPos.y,
      duration: travelMs,
      ease: element === 'lightning' ? 'Power3' : 'Power2',
      onComplete: () => {
        proj.destroy();
        this.playSpellImpact(element, color, targetPos);
      },
    });

    // Ice shard spins while travelling
    if (element === 'ice') {
      this.scene.tweens.add({
        targets: proj,
        angle: proj.angle + 360,
        duration: travelMs,
        ease: 'Linear',
      });
    }

    // Lightning leaves a brief afterimage flash along the path
    if (element === 'lightning') {
      for (let k = 1; k <= 3; k++) {
        const t = k / 4;
        const fx = actorPos.x + (targetPos.x - actorPos.x) * t;
        const fy = actorPos.y + (targetPos.y - actorPos.y) * t;
        const flash = this.scene.add.rectangle(fx, fy, 18, 4, color, 0.6);
        flash.setDepth(57);
        this.scene.tweens.add({
          targets: flash,
          alpha: 0,
          duration: 180,
          delay: (travelMs / 4) * k,
          onComplete: () => flash.destroy(),
        });
      }
    }
  }

  /** Burst of sparkles and an expanding ring at the spell's impact point. */
  private playSpellImpact(_element: string, color: number, pos: { x: number; y: number }): void {
    const impactRing = this.scene.add.rectangle(pos.x, pos.y, 10, 10, color, 0.7);
    impactRing.setDepth(54);
    this.scene.tweens.add({
      targets: impactRing,
      scaleX: 9,
      scaleY: 9,
      alpha: 0,
      duration: 500,
      ease: 'Power2.easeOut',
      onComplete: () => impactRing.destroy(),
    });

    const SPARKS = 8;
    for (let k = 0; k < SPARKS; k++) {
      const angle = (k / SPARKS) * Math.PI * 2;
      const dist  = SPARKLE_MIN_DIST + Math.random() * SPARKLE_DIST_VARIANCE;
      const spark = this.scene.add.rectangle(pos.x, pos.y, 6, 6, color, 0.9);
      spark.setDepth(56);
      this.scene.tweens.add({
        targets: spark,
        x: pos.x + Math.cos(angle) * dist,
        y: pos.y + Math.sin(angle) * dist,
        scaleX: 0.1,
        scaleY: 0.1,
        alpha: 0,
        duration: 450 + Math.random() * 150,
        ease: 'Power1.easeOut',
        delay: k * 15,
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** Floating poison damage number + green bubbles rising from the afflicted entity. */
  private playPoisonDotAnimation(entity: CombatEntity, dmg: number): void {
    this.refreshEntityDisplay(entity);
    const pos = this.entityScreenPos(entity);

    // Damage number in toxic green
    const dotText = this.scene.add.text(pos.x + 10, pos.y - 10, `-${dmg}☠`, {
      fontSize: '15px',
      color: '#88ff44',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);

    this.scene.tweens.add({
      targets: dotText,
      y: pos.y - 65,
      alpha: 0,
      duration: 1200,
      ease: 'Power1',
      onComplete: () => dotText.destroy(),
    });

    // Rising poison bubbles
    const BUBBLES = 4;
    for (let k = 0; k < BUBBLES; k++) {
      this.scene.time.delayedCall(k * 90, () => {
        const bx = pos.x + (Math.random() - 0.5) * 30;
        const by = pos.y + (Math.random() - 0.5) * 20;
        const bubble = this.scene.add.circle(bx, by, 4, 0x44cc44, 0.8);
        bubble.setDepth(52);
        this.scene.tweens.add({
          targets: bubble,
          y: by - 22 - Math.random() * 14,
          alpha: 0,
          duration: 520 + Math.random() * 200,
          ease: 'Power1',
          onComplete: () => bubble.destroy(),
        });
      });
    }
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

  /** Return the speed modifier for the currently highlighted menu option.
   *  Used to drive the live CTB-timeline preview while scrolling the menu. */
  private getHoveredSpeedModifier(): number {
    const idx = this.selectedMenuIndex;
    if (this.menuState === 'main') {
      // Main menu options in order: Attack, Skill/Magic/White Magic, Item, Defend, Flee
      const mainOptions = ['attack', 'skill', 'item', 'defend', 'flee'] as const;
      const choice = mainOptions[idx];
      if (choice === 'defend') return DEFEND_SPEED_MODIFIER;
      return 1.0;
    }
    if (this.menuState === 'skill' && this.currentActor) {
      const skillIds = this.currentActor.skills.filter((s) => s !== 'attack');
      const skillId = skillIds[idx];
      if (skillId) {
        const def = skillsData.skills.find((s) => s.id === skillId);
        return (def as { speedModifier?: number } | undefined)?.speedModifier ?? 1.0;
      }
    }
    return 1.0;
  }

  /** Called whenever the highlighted menu item changes to refresh the timeline preview. */
  private onMenuSelectionChanged(): void {
    if (!this.currentActor || this.menuState === 'target') return;
    this.refreshTimeline(this.getHoveredSpeedModifier());
  }

  /** Rebuild the CTB turn-order bar from the timeline preview.
   *  Each fixed slot displays the entity that will act at that position.
   *  Slots are created once and reused — their colour and label update in place
   *  so every position in the 10-turn preview is always visible.
   *  Pass `previewSpeedMod` to simulate the actor using an action with that speed
   *  modifier — this shows a "what-if" ordering without mutating any CTB values. */
  private refreshTimeline(previewSpeedMod?: number): void {
    if (this.timelinePulseTween) {
      this.timelinePulseTween.stop();
      this.timelinePulseTween = null;
    }
    // Reset all slot scales to 1 to prevent drift when the pulse tween was stopped mid-animation.
    this.timelineSlotIcons.forEach(([icon]) => icon.setScale(1, 1));

    const isPreview = previewSpeedMod !== undefined && this.currentActor !== null;
    const order = isPreview
      ? this.system.getTimelinePreviewWithModifier(this.currentActor!, previewSpeedMod!, 10)
      : this.system.getTimelinePreview(10);
    const cy = TIMELINE_H / 2;

    // Create any missing slot icons (first call creates all 10; subsequent calls
    // are no-ops because the slots are reused).
    for (let idx = this.timelineSlotIcons.length; idx < order.length; idx++) {
      const x = 6 + idx * TIMELINE_SLOT_W + TIMELINE_SLOT_W / 2;
      const icon = this.scene.add.rectangle(x, cy, TIMELINE_SLOT_W - 4, TIMELINE_H - 6, 0x4466ff);
      const label = this.scene.add.text(x, cy, '', {
        fontSize: '9px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.timelineContainer.add([icon, label]);
      this.timelineSlotIcons.push([icon, label]);
    }

    // Update each slot in-place to reflect the current (or preview) order.
    order.forEach((entity, idx) => {
      const isPlayer = this.system.players.includes(entity as PlayerCombatant);
      // Preview mode: tint player slots gold to distinguish from the actual timeline.
      let color: number;
      let strokeColor: number;
      if (isPreview) {
        color = isPlayer ? 0x224477 : 0x662233;
        strokeColor = isPlayer ? 0x6699cc : 0xff6688;
      } else {
        color = isPlayer ? 0x4466ff : 0xcc4444;
        strokeColor = isPlayer ? 0x88aaff : 0xff8888;
      }
      const [icon, label] = this.timelineSlotIcons[idx];
      icon.setFillStyle(color);
      icon.setStrokeStyle(1, strokeColor);
      icon.setVisible(true);
      label.setText(entity.name.substring(0, TIMELINE_NAME_LEN));
      label.setVisible(true);
    });

    // Hide any extra slots beyond the current order length.
    for (let idx = order.length; idx < this.timelineSlotIcons.length; idx++) {
      const [icon, label] = this.timelineSlotIcons[idx];
      icon.setVisible(false);
      label.setVisible(false);
    }

    // Pulse the first slot (next actor).
    if (this.timelineSlotIcons.length > 0) {
      const [firstIcon] = this.timelineSlotIcons[0];
      this.timelinePulseTween = this.scene.tweens.add({
        targets: firstIcon,
        scaleX: 1.10,
        scaleY: 1.10,
        duration: 550,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** Refresh the timeline after a speed-modifying action and show a brief
   *  speed indicator above the acting entity. */
  private animateTimelineShift(
    actor: CombatEntity,
    _beforeOrder: CombatEntity[],
    _afterOrder: CombatEntity[],
    speedModifier: number,
  ): void {
    if (!this.timelineContainer.active) return;

    this.refreshTimeline();

    // Show a brief speed indicator above the actor.
    const delta = speedModifier - 1.0;
    if (Math.abs(delta) >= 0.05) {
      const isFast = delta < 0;
      let indicatorText: string;
      let indicatorColor: string;
      if (isFast) {
        indicatorText = '[FAST] next turn sooner!';
        indicatorColor = '#ffff44';
      } else if (delta >= 0.4) {
        indicatorText = '[SLOW] next turn much later!';
        indicatorColor = '#aaaaff';
      } else {
        indicatorText = '[SLOW] next turn later';
        indicatorColor = '#aaaaff';
      }
      const actorPos = this.entityScreenPos(actor);
      const indicator = this.scene.add.text(actorPos.x, actorPos.y - 20, indicatorText, {
        fontSize: '12px',
        color: indicatorColor,
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(60);
      this.scene.tweens.add({
        targets: indicator,
        y: actorPos.y - 55,
        alpha: 0,
        duration: 1000,
        ease: 'Power1',
        onComplete: () => indicator.destroy(),
      });
    }
  }

  private appendLog(_msg: string): void {
    const lines = [...this.system.log.slice(-LOG_LINE_COUNT)];
    lines.forEach((l, i) => this.logTexts[i]?.setText(l));
    for (let i = lines.length; i < this.logTexts.length; i++) {
      this.logTexts[i]?.setText('');
    }
  }

  navigateMenu(direction: 'up' | 'down' | 'left' | 'right'): void {
    const count = this.fullMenuItems.length;
    if (count === 0) return;
    // left/right map to previous/next item respectively (same as up/down) so the
    // full D-pad works with the linear vertical menu list.
    const goForward = direction === 'down' || direction === 'right';
    let newIdx = this.selectedMenuIndex;
    let iterations = 0;
    do {
      newIdx = goForward ? (newIdx + 1) % count : (newIdx - 1 + count) % count;
      iterations++;
    } while (this.menuDisabled[newIdx] && iterations < count);

    if (!this.menuDisabled[newIdx]) {
      this.selectedMenuIndex = newIdx;
      // Scroll the visible window to keep the selected item in view
      if (newIdx < this.menuScrollOffset) {
        this.menuScrollOffset = newIdx;
        this.renderMenuWindow();
      } else if (newIdx >= this.menuScrollOffset + this.menuMaxVisible) {
        this.menuScrollOffset = newIdx - this.menuMaxVisible + 1;
        this.renderMenuWindow();
      } else {
        this.updateMenuHighlight();
      }
      if (this.menuState === 'target') this.updateTargetCursor();
      // Update the help text to describe the currently highlighted option.
      const tip = this.menuTooltips[newIdx];
      if (tip && this.helpText.active) this.helpText.setText(tip);
      // Live-preview: update the turn-order timeline based on the hovered action.
      this.onMenuSelectionChanged();
    }
  }

  confirmAction(): CombatAction | null {
    if (!this.currentActor) return null;
    const idx = this.selectedMenuIndex;

    if (this.menuState === 'main') {
      if (this.menuDisabled[idx]) return null;
      const mainOptions = ['attack', 'skill', 'item', 'defend', 'flee'] as const;
      const choice = mainOptions[idx];
      // Persist this choice so the cursor returns here on the character's next turn.
      this.lastMainMenuIndex.set(this.currentActor.id, idx);
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
      // Remember the cursor position in the skill sub-menu for this character.
      this.lastSkillMenuIndex.set(this.currentActor.id, idx);
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
      // Remember the cursor position in the item sub-menu globally.
      this.lastItemMenuIndex = idx;
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
    // Stop all active tweens (damage numbers, spell rings, attack animations, etc.)
    // before destroying their target objects to prevent stale callbacks and free memory.
    this.scene.tweens.killAll();
    this.timelinePulseTween = null;
    this.activeTurnTween = null;
    this.pendingDamageDelay.clear();
    this.bus.off('combat:log', this.onCombatLog);
    this.bus.off('combat:damage', this.onCombatDamage);
    this.bus.off('combat:heal', this.onCombatHeal);
    this.bus.off('combat:mpChange', this.onCombatMpChange);
    this.bus.off('combat:turnStart', this.onCombatTurnStart);
    this.bus.off('combat:attackStart', this.onCombatAttackStart);
    this.bus.off('combat:spellStart', this.onCombatSpellStart);
    this.bus.off('status:applied', this.onStatusApplied);
    this.bus.off('status:removed', this.onStatusRemoved);
    this.bus.off('status:dot', this.onStatusDot);
    this.bus.off('combat:timelineShift', this.onCombatTimelineShift);
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
    this.playerStatusTexts.forEach((t) => t.destroy());
    this.enemyStatusTexts.forEach((t) => t.destroy());
  }
}

