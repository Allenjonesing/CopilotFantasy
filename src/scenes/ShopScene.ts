import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';
import itemsData from '../data/items.json';

interface ShopData {
  inventory: string[];
}

export class ShopScene extends Phaser.Scene {
  private shopData!: ShopData;
  private selectedIndex = 0;
  private items: Array<{ id: string; name: string; buyPrice: number; description: string }> = [];
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private backKey!: Phaser.Input.Keyboard.Key;
  private itemTexts: Phaser.GameObjects.Text[] = [];
  private goldText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private statusTimer = 0;
  private canInput = true;

  constructor() {
    super({ key: 'ShopScene' });
  }

  init(data: ShopData): void {
    this.shopData = data;
    this.selectedIndex = 0;
    this.statusTimer = 0;
    this.canInput = true;
  }

  create(): void {
    const { width: W, height: H } = this.scale;

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a1a);

    // Build item list from shop inventory
    this.items = (this.shopData?.inventory ?? [])
      .map((id) => {
        const def = itemsData.items.find((it) => it.id === id);
        if (!def) return null;
        return { id: def.id, name: def.name, buyPrice: def.buyPrice, description: def.description };
      })
      .filter(Boolean) as Array<{ id: string; name: string; buyPrice: number; description: string }>;

    // Title
    this.add.text(W / 2, 24, '🛒  TRAVELING SHOP', {
      fontSize: '26px',
      color: '#44aaff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0);

    // Divider
    this.add.rectangle(W / 2, 56, W * 0.85, 2, 0x44aaff, 0.5);

    // Shopkeeper greeting
    this.add.text(W / 2, 68, '"Welcome! Browse my wares, traveler."', {
      fontSize: '14px',
      color: '#aaddff',
      fontFamily: 'monospace',
      fontStyle: 'italic',
    }).setOrigin(0.5, 0);

    // Column headers
    this.add.text(16, 100, 'Item', { fontSize: '13px', color: '#888888', fontFamily: 'monospace' });
    this.add.text(W - 120, 100, 'Price', { fontSize: '13px', color: '#888888', fontFamily: 'monospace' });

    this.add.rectangle(W / 2, 112, W * 0.9, 1, 0x333366, 0.7);

    // Item rows
    const ROW_H = 34;
    const LIST_Y = 120;
    this.itemTexts = [];
    this.items.forEach((item, i) => {
      const y = LIST_Y + i * ROW_H;
      const color = i === this.selectedIndex ? '#ffff00' : '#ffffff';
      const label = `${i === this.selectedIndex ? '▶ ' : '  '}${item.name}`;
      const t = this.add.text(20, y, label, {
        fontSize: '18px',
        color,
        fontFamily: 'monospace',
      }).setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => {
        this.selectedIndex = i;
        this.refreshList();
        this.buy();
      });
      t.on('pointerover', () => {
        this.selectedIndex = i;
        this.refreshList();
      });

      this.add.text(W - 116, y, `${item.buyPrice} G`, {
        fontSize: '18px',
        color: '#ffcc44',
        fontFamily: 'monospace',
      });

      this.add.text(20, y + 17, `  ${item.description}`, {
        fontSize: '11px',
        color: '#888888',
        fontFamily: 'monospace',
      });

      this.itemTexts.push(t);
    });

    if (this.items.length === 0) {
      this.add.text(W / 2, LIST_Y + 20, '(No items in stock)', {
        fontSize: '16px',
        color: '#666666',
        fontFamily: 'monospace',
      }).setOrigin(0.5, 0);
    }

    // Gold display
    const goldY = LIST_Y + this.items.length * ROW_H + 18;
    this.add.rectangle(W / 2, goldY - 4, W * 0.9, 1, 0x333366, 0.7);
    this.goldText = this.add.text(W / 2, goldY + 4, '', {
      fontSize: '18px',
      color: '#ffe066',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.refreshGold();

    // Status / feedback text
    this.statusText = this.add.text(W / 2, goldY + 36, '', {
      fontSize: '16px',
      color: '#88ff88',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    // Footer buttons
    const footerY = H - 52;
    this.add.rectangle(W / 2, footerY - 6, W * 0.9, 1, 0x333366, 0.5);
    this.add.text(W / 2, footerY + 4, 'BUY: OK/Enter   LEAVE: X/Tap here', {
      fontSize: '13px',
      color: '#666688',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0);

    // Leave button
    const leaveBtn = this.add.text(W / 2, H - 18, '[ Leave Shop ]', {
      fontSize: '16px',
      color: '#aa4444',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 1).setInteractive({ useHandCursor: true });
    leaveBtn.on('pointerdown', () => this.leave());
    leaveBtn.on('pointerover', () => leaveBtn.setColor('#ff6666'));
    leaveBtn.on('pointerout', () => leaveBtn.setColor('#aa4444'));

    // Keyboard
    this.upKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.backKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
  }

  update(_time: number, delta: number): void {
    if (!this.canInput) return;

    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.refreshList();
    } else if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
      this.refreshList();
    } else if (Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
      this.buy();
    } else if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
      this.leave();
    }

    if (this.statusTimer > 0) {
      this.statusTimer -= delta;
      if (this.statusTimer <= 0 && this.statusText?.active) {
        this.statusText.setText('');
      }
    }
  }

  private buy(): void {
    if (this.items.length === 0) return;
    const item = this.items[this.selectedIndex];
    if (!item) return;
    const state = GameState.getInstance();
    if (state.data.gold < item.buyPrice) {
      this.setStatus(`Not enough Gold! (Need ${item.buyPrice} G)`, '#ff6666');
      return;
    }
    state.removeGold(item.buyPrice);
    state.addItem(item.id);
    this.setStatus(`Bought ${item.name}!`, '#88ff88');
    this.refreshGold();
  }

  private refreshList(): void {
    this.itemTexts.forEach((t, i) => {
      const isSelected = i === this.selectedIndex;
      t.setColor(isSelected ? '#ffff00' : '#ffffff');
      const label = `${isSelected ? '▶ ' : '  '}${this.items[i].name}`;
      t.setText(label);
    });
  }

  private refreshGold(): void {
    const state = GameState.getInstance();
    this.goldText?.setText(`Your Gold: ${state.data.gold} G`);
  }

  private setStatus(msg: string, color: string): void {
    if (this.statusText?.active) {
      this.statusText.setText(msg).setColor(color);
    }
    this.statusTimer = 2000;
  }

  private leave(): void {
    this.canInput = false;
    this.scene.start('ExplorationScene');
  }
}
