import { CombatSystem, CombatAction } from '../systems/combat/CombatSystem';
import { CombatEntity } from '../systems/combat/CombatEntity';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';

const W = 800;
const H = 600;
const TIMELINE_H = 36;
const TIMELINE_SLOT_W = 72;
const TIMELINE_NAME_LEN = 7;
const DAMAGE_FLASH_MS = 200;
const ENEMY_FLASH_MS = 80;
const ENEMY_FLASH_REPEAT = 2;

// Battlefield spans y = TIMELINE_H to BOTTOM_Y
const BATTLEFIELD_BOTTOM = 252;

// Compact 3-line log strip between battlefield and menu
const LOG_STRIP_Y = BATTLEFIELD_BOTTOM + 4;
const LOG_STRIP_H = 42;
const LOG_LINE_COUNT = 3;

// Bottom panel starts below the log strip
const BOTTOM_Y = LOG_STRIP_Y + LOG_STRIP_H + 4;

// Left status panel (player HP bars + combat nav buttons)
const LEFT_PANEL_W = 248;

// Action menu covers centre + right of the bottom panel
const MENU_X = LEFT_PANEL_W + 8;
const MENU_Y = BOTTOM_Y;
const MENU_W = W - MENU_X - 8; // ≈ 536 px

// Entity icon sizes
const ENEMY_W = 80;
const ENEMY_H = 80;
const PLAYER_ICON_W = 62;
const PLAYER_ICON_H = 62;

// Horizontal spread width for positioning multiple entities
const ENEMY_SPACING_WIDTH = 350;
const PLAYER_SPACING_WIDTH = 240;

// Attack movement animation
const ATTACK_MOVE_MAX_PX = 70;   // max pixels the attacker slides toward the target
const ATTACK_MOVE_RATIO = 0.45;  // fraction of the gap to cover (capped at max)
const ATTACK_MOVE_FORWARD_MS = 160; // duration of forward lunge (ms)
const ATTACK_MOVE_RETURN_MS = 200;  // duration of return slide (ms)

// Battlefield Y centre for icons
const ICON_Y = 175;

type MenuState = 'main' | 'skill' | 'item' | 'target';

export class CombatUI {
  private scene: Phaser.Scene;
  private system: CombatSystem;
  // Enemy sprites
  private enemyRects: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private enemyNameTexts: Phaser.GameObjects.Text[] = [];
  // Player icon sprites on the battlefield
  private playerIconRects: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private playerIconNames: Phaser.GameObjects.Text[] = [];
  // Player HP bars (left status panel)
  private playerBars: Map<string, { bg: Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = new Map();
  private playerNameTexts: Phaser.GameObjects.Text[] = [];
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
  private targetCursor!: Phaser.GameObjects.Rectangle;
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
  // State
  private currentActor: CombatEntity | null = null;
  private bus: EventBus;
  // Stored listener references for cleanup
  private onCombatLog!: (msg: unknown) => void;
  private onCombatDamage!: (entity: unknown, dmg: unknown) => void;
  private onCombatHeal!: (entity: unknown) => void;
  private onCombatTurnStart!: (actor: unknown) => void;
  private onCombatAttackStart!: (actor: unknown, target: unknown) => void;

  /** Called by CombatScene when a menu item is tapped — triggers confirmAction(). */
  onMenuTap?: () => void;

  constructor(scene: Phaser.Scene, system: CombatSystem) {
    this.scene = scene;
    this.system = system;
    this.bus = EventBus.getInstance();
    this.buildUI();
    this.registerEvents();
  }

  private buildUI(): void {
    // ── Timeline bar ──────────────────────────────────────────────────────────
    this.scene.add.rectangle(W / 2, TIMELINE_H / 2, W, TIMELINE_H, 0x111133);
    this.timelineContainer = this.scene.add.container(0, 0);
    this.timelineContainer.setDepth(20);

    // ── Battlefield background ────────────────────────────────────────────────
    this.scene.add.rectangle(W / 2, (TIMELINE_H + BATTLEFIELD_BOTTOM) / 2, W, BATTLEFIELD_BOTTOM - TIMELINE_H, 0x1a1a2e);

    // ── Enemy icons (right side of battlefield) ───────────────────────────────
    const eCount = this.system.enemies.length;
    this.system.enemies.forEach((e, idx) => {
      const x = 395 + idx * Math.floor(ENEMY_SPACING_WIDTH / Math.max(eCount, 1));
      const y = ICON_Y;
      const rect = this.scene.add.rectangle(x, y, ENEMY_W, ENEMY_H, 0xcc4444);
      rect.setDepth(5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.onEntityTap(e));
      const nameText = this.scene.add
        .text(x, y + ENEMY_H / 2 + 8, e.name, { fontSize: '12px', color: '#ffffff', fontFamily: 'monospace' })
        .setOrigin(0.5)
        .setDepth(6);
      this.enemyRects.set(e.id, rect);
      this.enemyNameTexts.push(nameText);
    });

    // ── Player icons (left side of battlefield) ───────────────────────────────
    const pCount = this.system.players.length;
    this.system.players.forEach((p, idx) => {
      const x = 75 + idx * Math.floor(PLAYER_SPACING_WIDTH / Math.max(pCount, 1));
      const y = ICON_Y;
      const rect = this.scene.add.rectangle(x, y, PLAYER_ICON_W, PLAYER_ICON_H, 0x4466cc);
      rect.setDepth(5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.onEntityTap(p));
      const nameText = this.scene.add
        .text(x, y + PLAYER_ICON_H / 2 + 8, p.name, { fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace' })
        .setOrigin(0.5)
        .setDepth(6);
      this.playerIconRects.set(p.id, rect);
      this.playerIconNames.push(nameText);
    });

    // ── Target cursor (hidden initially) ─────────────────────────────────────
    this.targetCursor = this.scene.add.rectangle(0, 0, 92, 92, 0x000000, 0);
    this.targetCursor.setStrokeStyle(3, 0xffff00);
    this.targetCursor.setDepth(15);
    this.targetCursor.setVisible(false);

    // ── Compact log strip ─────────────────────────────────────────────────────
    this.logStripBg = this.scene.add.rectangle(W / 2, LOG_STRIP_Y + LOG_STRIP_H / 2, W - 10, LOG_STRIP_H, 0x0a0a1a, 0.80);
    this.logStripBg.setStrokeStyle(1, 0x333355);
    this.logStripBg.setDepth(20);
    for (let i = 0; i < LOG_LINE_COUNT; i++) {
      const t = this.scene.add.text(8, LOG_STRIP_Y + 3 + i * 13, '', {
        fontSize: '11px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
        wordWrap: { width: W - 16 },
      });
      t.setDepth(21);
      this.logTexts.push(t);
    }

    // ── Bottom panel background ───────────────────────────────────────────────
    this.scene.add.rectangle(W / 2, (BOTTOM_Y + H - 22) / 2, W, H - 22 - BOTTOM_Y, 0x0d0d1f, 0.95).setDepth(18);

    // ── Left panel: player HP bars ────────────────────────────────────────────
    this.system.players.forEach((p, idx) => {
      const x = 8;
      const y = BOTTOM_Y + 10 + idx * 38;
      const nameText = this.scene.add
        .text(x, y, p.name, { fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace' })
        .setDepth(21);
      this.playerNameTexts.push(nameText);
      const bg = this.scene.add.rectangle(x + 80, y + 6, 120, 11, 0x333333).setDepth(21);
      const bar = this.scene.add.rectangle(x + 80, y + 6, 120, 11, 0x44aa44).setDepth(22);
      const text = this.scene.add
        .text(x + 145, y, `${p.stats.hp}/${p.stats.maxHp}`, {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: 'monospace',
        })
        .setDepth(22);
      this.playerBars.set(p.id, { bg, bar, text });
    });

    // ── Combat nav buttons (left panel, touch-friendly) ───────────────────────
    this.buildNavButtons();

    // ── Action menu container ─────────────────────────────────────────────────
    this.menuContainer = this.scene.add.container(MENU_X, MENU_Y);
    this.menuContainer.setDepth(30);
    this.menuBg = this.scene.add.rectangle(MENU_W / 2, 60, MENU_W, 160, 0x111133, 0.94);
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
      .text(W / 2, H - 4, '▲▼ Navigate   OK/Enter Confirm   X/BACK Cancel   Tap enemy or ally to target', {
        fontSize: '10px',
        color: '#666688',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(25);
  }

  /** Build the four compact combat navigation buttons in the left panel. */
  private buildNavButtons(): void {
    const BW = 68; // button width
    const BH = 36; // button height
    const COL1 = 40;
    const COL2 = 120;
    const ROW1 = BOTTOM_Y + this.system.players.length * 38 + 22;
    const ROW2 = ROW1 + BH + 8;

    const makeBtn = (
      label: string,
      x: number,
      y: number,
      color: number,
      stroke: number,
      onTap: () => void,
    ): void => {
      const bg = this.scene.add.rectangle(x, y, BW, BH, color, 0.82);
      bg.setStrokeStyle(2, stroke);
      bg.setDepth(32);
      bg.setInteractive({ useHandCursor: true });
      const txt = this.scene.add
        .text(x, y, label, { fontSize: '15px', color: '#ffffff', fontFamily: 'monospace' })
        .setOrigin(0.5)
        .setDepth(33);
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
  private buildMenuItems(items: string[], disabled: boolean[] = []): void {
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
      this.menuBg.setSize(MENU_W, h);
      this.menuBg.setPosition(MENU_W / 2, h / 2);
    }
  }

  private buildMainMenu(): void {
    this.menuTitle.setText('ACTION');
    const actor = this.currentActor;
    const specialSkills = actor ? actor.skills.filter((s) => s !== 'attack') : [];
    const hasSkills = specialSkills.length > 0;
    const hasItems = GameState.getInstance().data.inventory.length > 0;
    this.buildMenuItems(
      ['Attack', 'Skill', 'Item', 'Defend', 'Flee'],
      [false, !hasSkills, !hasItems, false, false],
    );
  }

  private buildSkillMenu(): void {
    this.menuTitle.setText('SKILL  [BACK: cancel]');
    const actor = this.currentActor;
    const skillIds = actor ? actor.skills.filter((s) => s !== 'attack') : [];
    const items = skillIds.map((id) => {
      const def = skillsData.skills.find((s) => s.id === id);
      return def ? `${def.name} MP:${def.mpCost}` : id;
    });
    this.buildMenuItems(items);
  }

  private buildItemMenu(): void {
    this.menuTitle.setText('ITEM   [BACK: cancel]');
    const inv = GameState.getInstance().data.inventory;
    const items = inv.map((i) => {
      const def = itemsData.items.find((it) => it.id === i.id);
      return def ? `${def.name} x${i.quantity}` : `${i.id} x${i.quantity}`;
    });
    this.buildMenuItems(items);
  }

  private enterTargetMode(actionType: 'attack' | 'skill' | 'item'): void {
    this.menuStateBeforeTarget = this.menuState;
    this.menuState = 'target';
    this.pendingActionType = actionType;
    this.targetList = [
      ...this.system.enemies.filter((e) => !e.isDefeated),
      ...this.system.players.filter((p) => !p.isDefeated),
    ];
    this.menuTitle.setText('TARGET [BACK: cancel]');
    const labels = this.targetList.map((t) => {
      const isEnemy = !this.system.players.some((p) => p === t);
      return `${t.name} ${isEnemy ? '(foe)' : '(ally)'}`;
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
      return;
    }
    const pos = this.entityCenter(target);
    this.targetCursor.setPosition(pos.x, pos.y);
    this.targetCursor.setVisible(true);
  }

  private hideTargetCursor(): void {
    this.targetCursor.setVisible(false);
  }

  private registerEvents(): void {
    this.onCombatLog = (msg) => this.appendLog(msg as string);
    this.onCombatDamage = (entity, dmg) => {
      this.refreshEntityDisplay(entity as CombatEntity);
      this.playDamageAnimation(entity as CombatEntity, dmg as number);
    };
    this.onCombatHeal = (entity) => this.refreshEntityDisplay(entity as CombatEntity);
    this.onCombatTurnStart = (actor) => {
      if (!this.menuContainer.active) return;
      this.currentActor = actor as CombatEntity;
      this.refreshTimeline();
      const isPlayer = actor instanceof PlayerCombatant;
      if (isPlayer) this.resetToMain();
      this.menuContainer.setVisible(isPlayer);
    };
    this.onCombatAttackStart = (actor, target) => {
      this.playAttackMoveAnimation(actor as CombatEntity, target as CombatEntity);
    };
    this.bus.on('combat:log', this.onCombatLog);
    this.bus.on('combat:damage', this.onCombatDamage);
    this.bus.on('combat:heal', this.onCombatHeal);
    this.bus.on('combat:turnStart', this.onCombatTurnStart);
    this.bus.on('combat:attackStart', this.onCombatAttackStart);
  }

  private refreshEntityDisplay(entity: CombatEntity): void {
    if (entity instanceof PlayerCombatant) {
      const bars = this.playerBars.get(entity.id);
      if (bars) {
        const ratio = entity.stats.hp / entity.stats.maxHp;
        bars.bar.setScale(ratio, 1);
        bars.bar.setPosition(bars.bg.x - 60 * (1 - ratio), bars.bg.y);
        if (bars.text.active) {
          bars.text.setText(`${entity.stats.hp}/${entity.stats.maxHp}`);
        }
      }
      // Dim the player icon if defeated
      const icon = this.playerIconRects.get(entity.id);
      if (icon && icon.active) {
        icon.setFillStyle(entity.isDefeated ? 0x222244 : 0x4466cc);
      }
    } else {
      const rect = this.enemyRects.get(entity.id);
      if (rect) {
        rect.setFillStyle(entity.isDefeated ? 0x333333 : 0xcc4444);
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
      const bars = this.playerBars.get(entity.id);
      if (!bars || !bars.bar.active) return;
      bars.bar.setFillStyle(0xff4444);
      this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
        if (bars.bar.active) bars.bar.setFillStyle(0x44aa44);
      });
    } else {
      const rect = this.enemyRects.get(entity.id);
      if (!rect || !rect.active || entity.isDefeated) return;
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

  /** Return the approximate screen position for an entity (used for floating damage numbers). */
  private entityScreenPos(entity: CombatEntity): { x: number; y: number } {
    if (entity instanceof PlayerCombatant) {
      const icon = this.playerIconRects.get(entity.id);
      return icon ? { x: icon.x, y: icon.y - 40 } : { x: 100, y: 150 };
    }
    const rect = this.enemyRects.get(entity.id);
    return rect ? { x: rect.x, y: rect.y - 50 } : { x: 450, y: 130 };
  }

  /** Return the screen center of an entity (used to place the target cursor). */
  private entityCenter(entity: CombatEntity): { x: number; y: number } {
    if (entity instanceof PlayerCombatant) {
      const icon = this.playerIconRects.get(entity.id);
      return icon ? { x: icon.x, y: icon.y } : { x: 100, y: 175 };
    }
    const rect = this.enemyRects.get(entity.id);
    return rect ? { x: rect.x, y: rect.y } : { x: 450, y: 175 };
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

  get isMenuVisible(): boolean {
    return this.menuContainer.visible;
  }

  destroy(): void {
    this.bus.off('combat:log', this.onCombatLog);
    this.bus.off('combat:damage', this.onCombatDamage);
    this.bus.off('combat:heal', this.onCombatHeal);
    this.bus.off('combat:turnStart', this.onCombatTurnStart);
    this.bus.off('combat:attackStart', this.onCombatAttackStart);
    this.menuContainer.destroy();
    this.timelineContainer.destroy();
    this.logStripBg.destroy();
    this.logTexts.forEach((t) => t.destroy());
    this.targetCursor.destroy();
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
  }
}

