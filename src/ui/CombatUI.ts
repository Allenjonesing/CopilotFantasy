import { CombatSystem, CombatAction } from '../systems/combat/CombatSystem';
import { CombatEntity } from '../systems/combat/CombatEntity';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EventBus } from '../core/events/EventBus';
import { GameState } from '../core/state/GameState';
import skillsData from '../data/skills.json';
import itemsData from '../data/items.json';

const W = 800;
const H = 600;
const LOG_X = W - 290;
const LOG_Y = H - 170;
const LOG_W = 280;
const LOG_H = 160;
const TIMELINE_W = W;
const TIMELINE_H = 36;
const TIMELINE_SLOT_W = 72;
const DAMAGE_FLASH_MS = 200;
const ENEMY_FLASH_MS = 80;
const ENEMY_FLASH_REPEAT = 2;
const TIMELINE_NAME_LEN = 7;
// Menu placed at screen centre, away from health bars (bottom-left)
const MENU_X = W / 2 - 100;
const MENU_Y = H / 2 - 90;
const MENU_W = 200;

type MenuState = 'main' | 'skill' | 'item' | 'target';

export class CombatUI {
  private scene: Phaser.Scene;
  private system: CombatSystem;
  // Enemy sprites
  private enemyRects: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private enemyNameTexts: Phaser.GameObjects.Text[] = [];
  // Player HP bars
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
  // Log
  private logBg!: Phaser.GameObjects.Rectangle;
  private logTexts: Phaser.GameObjects.Text[] = [];
  // Help text
  private helpText!: Phaser.GameObjects.Text;
  // State
  private currentActor: CombatEntity | null = null;
  private bus: EventBus;
  // Stored listener references for cleanup
  private onCombatLog!: (msg: unknown) => void;
  private onCombatDamage!: (entity: unknown, dmg: unknown) => void;
  private onCombatHeal!: (entity: unknown) => void;
  private onCombatTurnStart!: (actor: unknown) => void;

  constructor(scene: Phaser.Scene, system: CombatSystem) {
    this.scene = scene;
    this.system = system;
    this.bus = EventBus.getInstance();
    this.buildUI();
    this.registerEvents();
  }

  private buildUI(): void {
    // Timeline bar background
    this.scene.add.rectangle(TIMELINE_W / 2, TIMELINE_H / 2, TIMELINE_W, TIMELINE_H, 0x111133);
    this.timelineContainer = this.scene.add.container(0, 0);
    this.timelineContainer.setDepth(20);

    // Log background
    this.logBg = this.scene.add.rectangle(LOG_X + LOG_W / 2, LOG_Y + LOG_H / 2, LOG_W, LOG_H, 0x0a0a1a, 0.85);
    this.logBg.setStrokeStyle(1, 0x444466);
    this.logBg.setDepth(20);
    for (let i = 0; i < 8; i++) {
      const t = this.scene.add.text(LOG_X + 5, LOG_Y + 5 + i * 18, '', {
        fontSize: '11px',
        color: '#cccccc',
        fontFamily: 'monospace',
        wordWrap: { width: LOG_W - 10 },
      });
      t.setDepth(21);
      this.logTexts.push(t);
    }

    // Enemy visuals
    this.system.enemies.forEach((e, idx) => {
      const x = 150 + idx * 180;
      const y = 200;
      const rect = this.scene.add.rectangle(x, y, 80, 80, 0xcc4444);
      rect.setDepth(5);
      const nameText = this.scene.add
        .text(x, y + 50, e.name, { fontSize: '12px', color: '#ffffff', fontFamily: 'monospace' })
        .setOrigin(0.5)
        .setDepth(6);
      this.enemyRects.set(e.id, rect);
      this.enemyNameTexts.push(nameText);
    });

    // Player HP bars
    this.system.players.forEach((p, idx) => {
      const x = 20;
      const y = H - 180 + idx * 45;
      const nameText = this.scene.add
        .text(x, y, p.name, { fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace' })
        .setDepth(21);
      this.playerNameTexts.push(nameText);
      const bg = this.scene.add.rectangle(x + 80, y + 6, 120, 12, 0x333333).setDepth(21);
      const bar = this.scene.add.rectangle(x + 80, y + 6, 120, 12, 0x44aa44).setDepth(22);
      const text = this.scene.add
        .text(x + 145, y, `${p.stats.hp}/${p.stats.maxHp}`, {
          fontSize: '10px',
          color: '#ffffff',
          fontFamily: 'monospace',
        })
        .setDepth(22);
      this.playerBars.set(p.id, { bg, bar, text });
    });

    // Target cursor (hidden initially)
    this.targetCursor = this.scene.add.rectangle(0, 0, 92, 92, 0x000000, 0);
    this.targetCursor.setStrokeStyle(3, 0xffff00);
    this.targetCursor.setDepth(15);
    this.targetCursor.setVisible(false);

    // Action menu container — centred on screen, away from health bars
    this.menuContainer = this.scene.add.container(MENU_X, MENU_Y);
    this.menuContainer.setDepth(30);
    this.menuBg = this.scene.add.rectangle(MENU_W / 2, 60, MENU_W, 120, 0x111133, 0.9);
    this.menuBg.setStrokeStyle(1, 0x6666aa);
    this.menuContainer.add(this.menuBg);
    this.menuTitle = this.scene.add.text(10, 8, 'ACTION', {
      fontSize: '11px',
      color: '#aaaaff',
      fontFamily: 'monospace',
    });
    this.menuContainer.add(this.menuTitle);
    this.buildMainMenu();

    // Help text
    this.helpText = this.scene.add
      .text(W / 2, H - 6, '↑↓ Navigate   Enter Confirm   X Cancel', {
        fontSize: '10px',
        color: '#888888',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(25);
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
      const t = this.scene.add.text(12, 26 + i * 22, label, {
        fontSize: '13px',
        color,
        fontFamily: 'monospace',
      });
      this.menuContainer.add(t);
      this.menuItems.push(t);
    });
    // Resize background to fit items
    const h = Math.max(60, 26 + items.length * 22 + 14);
    this.menuBg.setSize(MENU_W, h);
    this.menuBg.setPosition(MENU_W / 2, h / 2);
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
    this.menuTitle.setText('SKILL  [X:back]');
    const actor = this.currentActor;
    const skillIds = actor ? actor.skills.filter((s) => s !== 'attack') : [];
    const items = skillIds.map((id) => {
      const def = skillsData.skills.find((s) => s.id === id);
      return def ? `${def.name} MP:${def.mpCost}` : id;
    });
    this.buildMenuItems(items);
  }

  private buildItemMenu(): void {
    this.menuTitle.setText('ITEM   [X:back]');
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
    this.menuTitle.setText('TARGET [X:back]');
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
      this.currentActor = actor as CombatEntity;
      this.refreshTimeline();
      const isPlayer = actor instanceof PlayerCombatant;
      if (isPlayer) this.resetToMain();
      this.menuContainer.setVisible(isPlayer);
    };
    this.bus.on('combat:log', this.onCombatLog);
    this.bus.on('combat:damage', this.onCombatDamage);
    this.bus.on('combat:heal', this.onCombatHeal);
    this.bus.on('combat:turnStart', this.onCombatTurnStart);
  }

  private refreshEntityDisplay(entity: CombatEntity): void {
    if (entity instanceof PlayerCombatant) {
      const bars = this.playerBars.get(entity.id);
      if (bars) {
        const ratio = entity.stats.hp / entity.stats.maxHp;
        bars.bar.setScale(ratio, 1);
        bars.bar.setPosition(bars.bg.x - 60 * (1 - ratio), bars.bg.y);
        // Guard against the text object being destroyed or not yet fully initialised
        if (bars.text.active) {
          bars.text.setText(`${entity.stats.hp}/${entity.stats.maxHp}`);
        }
      }
    } else {
      const rect = this.enemyRects.get(entity.id);
      if (rect) {
        rect.setFillStyle(entity.isDefeated ? 0x333333 : 0xcc4444);
      }
    }
  }

  /** Flash the damaged game object and show a floating damage number. */
  private playDamageAnimation(entity: CombatEntity, dmg: number): void {
    const isPlayer = entity instanceof PlayerCombatant;
    if (isPlayer) {
      const bars = this.playerBars.get(entity.id);
      if (!bars || !bars.bar.active) return;
      // Flash the HP bar red
      bars.bar.setFillStyle(0xff4444);
      this.scene.time.delayedCall(DAMAGE_FLASH_MS, () => {
        if (bars.bar.active) bars.bar.setFillStyle(0x44aa44);
      });
    } else {
      const rect = this.enemyRects.get(entity.id);
      if (!rect || !rect.active || entity.isDefeated) return;
      // Flash enemy white then back
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
      fontSize: '16px',
      color: isPlayer ? '#ff8888' : '#ffff44',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);
    this.scene.tweens.add({
      targets: dmgText,
      y: pos.y - 50,
      alpha: 0,
      duration: 900,
      ease: 'Power1',
      onComplete: () => dmgText.destroy(),
    });
  }

  /** Return the approximate screen position for an entity (used for floating damage numbers). */
  private entityScreenPos(entity: CombatEntity): { x: number; y: number } {
    if (entity instanceof PlayerCombatant) {
      const bars = this.playerBars.get(entity.id);
      return bars ? { x: bars.bg.x, y: bars.bg.y - 20 } : { x: 100, y: 400 };
    }
    const rect = this.enemyRects.get(entity.id);
    return rect ? { x: rect.x, y: rect.y - 50 } : { x: 200, y: 150 };
  }

  /** Return the screen center of an entity (used to place the target cursor). */
  private entityCenter(entity: CombatEntity): { x: number; y: number } {
    if (entity instanceof PlayerCombatant) {
      const bars = this.playerBars.get(entity.id);
      return bars ? { x: bars.bg.x, y: bars.bg.y } : { x: 100, y: 420 };
    }
    const rect = this.enemyRects.get(entity.id);
    return rect ? { x: rect.x, y: rect.y } : { x: 200, y: 200 };
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
    const lines = [...this.system.log.slice(-8)];
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
    this.menuContainer.destroy();
    this.timelineContainer.destroy();
    this.logBg.destroy();
    this.logTexts.forEach((t) => t.destroy());
    this.targetCursor.destroy();
    this.helpText.destroy();
    // Explicitly destroy all tracked game objects to prevent accumulation
    this.enemyNameTexts.forEach((t) => t.destroy());
    this.playerNameTexts.forEach((t) => t.destroy());
    this.enemyRects.forEach((r) => r.destroy());
    this.playerBars.forEach(({ bg, bar, text }) => {
      bg.destroy();
      bar.destroy();
      text.destroy();
    });
  }
}
