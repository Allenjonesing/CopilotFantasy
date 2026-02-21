import { CombatSystem, CombatAction, ActionType } from '../systems/combat/CombatSystem';
import { CombatEntity } from '../systems/combat/CombatEntity';
import { PlayerCombatant } from '../systems/combat/PlayerCombatant';
import { EventBus } from '../core/events/EventBus';

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

export class CombatUI {
  private scene: Phaser.Scene;
  private system: CombatSystem;
  // Enemy sprites
  private enemyRects: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  // Player HP bars
  private playerBars: Map<string, { bg: Phaser.GameObjects.Rectangle; bar: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }> = new Map();
  // Action menu
  private menuContainer!: Phaser.GameObjects.Container;
  private menuItems: Phaser.GameObjects.Text[] = [];
  private selectedMenuIndex = 0;
  // Timeline display
  private timelineContainer!: Phaser.GameObjects.Container;
  private timelineIcons: Phaser.GameObjects.GameObject[] = [];
  // Log
  private logBg!: Phaser.GameObjects.Rectangle;
  private logTexts: Phaser.GameObjects.Text[] = [];
  // State
  private currentActor: CombatEntity | null = null;
  private selectedEnemy = 0;
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
      this.scene.add.text(x, y + 50, e.name, { fontSize: '12px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(6);
      this.enemyRects.set(e.id, rect);
    });

    // Player HP bars
    this.system.players.forEach((p, idx) => {
      const x = 20;
      const y = H - 180 + idx * 45;
      this.scene.add.text(x, y, p.name, { fontSize: '12px', color: '#aaaaff', fontFamily: 'monospace' }).setDepth(21);
      const bg = this.scene.add.rectangle(x + 80, y + 6, 120, 12, 0x333333).setDepth(21);
      const bar = this.scene.add.rectangle(x + 80, y + 6, 120, 12, 0x44aa44).setDepth(22);
      const text = this.scene.add.text(x + 145, y, `${p.stats.hp}/${p.stats.maxHp}`, { fontSize: '10px', color: '#ffffff', fontFamily: 'monospace' }).setDepth(22);
      this.playerBars.set(p.id, { bg, bar, text });
    });

    // Action menu — background rect is added to the container so it moves/hides with it
    this.menuContainer = this.scene.add.container(20, H - 160);
    this.menuContainer.setDepth(30);
    const menuBg = this.scene.add.rectangle(100, 60, 180, 120, 0x111133, 0.9).setStrokeStyle(1, 0x6666aa);
    this.menuContainer.add(menuBg);
    this.buildMenu(['Attack', 'Skill', 'Item', 'Defend', 'Flee']);
  }

  private buildMenu(items: string[]): void {
    this.menuItems.forEach((t) => t.destroy());
    this.menuItems = [];
    items.forEach((label, i) => {
      const t = this.scene.add.text(20, 20 + i * 20, label, {
        fontSize: '13px',
        color: i === this.selectedMenuIndex ? '#ffff00' : '#ffffff',
        fontFamily: 'monospace',
      });
      this.menuContainer.add(t);
      this.menuItems.push(t);
    });
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
      this.menuContainer.setVisible(actor instanceof PlayerCombatant);
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

  /** Return the approximate screen position for an entity. */
  private entityScreenPos(entity: CombatEntity): { x: number; y: number } {
    if (entity instanceof PlayerCombatant) {
      const bars = this.playerBars.get(entity.id);
      return bars ? { x: bars.bg.x, y: bars.bg.y - 20 } : { x: 100, y: 400 };
    }
    const rect = this.enemyRects.get(entity.id);
    return rect ? { x: rect.x, y: rect.y - 50 } : { x: 200, y: 150 };
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
    this.selectedMenuIndex = (this.selectedMenuIndex + (direction === 'down' ? 1 : -1) + count) % count;
    this.menuItems.forEach((t, i) => t.setColor(i === this.selectedMenuIndex ? '#ffff00' : '#ffffff'));
  }

  confirmAction(): CombatAction | null {
    if (!this.currentActor) return null;
    const menuLabels: ActionType[] = ['attack', 'skill', 'item', 'defend', 'flee'];
    const actionType = menuLabels[this.selectedMenuIndex];
    const enemies = this.system.enemies.filter((e) => !e.isDefeated);
    const target = enemies[this.selectedEnemy] ?? null;
    return { type: actionType, target: target ?? undefined };
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
  }
}
