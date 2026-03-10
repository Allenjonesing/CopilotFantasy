import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';
import itemsData from '../data/items.json';

interface ShopData {
  inventory: string[];
}

type ShopMode = 'browse' | 'confirm';

export class ShopScene extends Phaser.Scene {
  private shopData!: ShopData;
  private selectedIndex = 0;
  private items: Array<{ id: string; name: string; buyPrice: number; description: string }> = [];
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;
  private backKey!: Phaser.Input.Keyboard.Key;
  private itemTexts: Phaser.GameObjects.Text[] = [];
  private goldText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private statusTimer = 0;
  private canInput = true;

  // Confirm dialog state
  private mode: ShopMode = 'browse';
  private confirmQty = 1;
  private confirmPanel!: Phaser.GameObjects.Container;
  private confirmQtyText!: Phaser.GameObjects.Text;
  private confirmTotalText!: Phaser.GameObjects.Text;
  private confirmGoldText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ShopScene' });
  }

  init(data: ShopData): void {
    this.shopData = data;
    this.selectedIndex = 0;
    this.statusTimer = 0;
    this.canInput = true;
    this.mode = 'browse';
    this.confirmQty = 1;
  }

  create(): void {
    const { width: W, height: H } = this.scale;

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0a1a);

    // Build item list from shop inventory
    this.items = (this.shopData?.inventory ?? [])
      .flatMap((id) => {
        const def = itemsData.items.find((it) => it.id === id);
        if (!def || !def.buyPrice) return [];
        return [{ id: def.id, name: def.name, buyPrice: def.buyPrice, description: def.description }];
      });

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
        this.openConfirmDialog();
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
    this.add.text(W / 2, footerY + 4, 'SELECT: ▲▼/Enter   LEAVE: X', {
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
    this.leftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    this.backKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);

    // Build confirm dialog (hidden by default)
    this.buildConfirmDialog();
  }

  private buildConfirmDialog(): void {
    const { width: W, height: H } = this.scale;
    const PW = Math.min(W * 0.82, 380);
    const PH = 230;
    const PX = W / 2;
    const PY = H / 2;

    const container = this.add.container(PX, PY);

    // Dark backdrop
    const bg = this.add.rectangle(0, 0, PW, PH, 0x05051a, 0.97)
      .setStrokeStyle(2, 0x44aaff, 0.9);
    container.add(bg);

    // Title
    const titleTxt = this.add.text(0, -PH / 2 + 18, 'Confirm Purchase', {
      fontSize: '18px',
      color: '#44aaff',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5);
    container.add(titleTxt);

    const divider = this.add.rectangle(0, -PH / 2 + 34, PW * 0.85, 1, 0x44aaff, 0.4);
    container.add(divider);

    // Item name placeholder
    const itemNameTxt = this.add.text(0, -PH / 2 + 52, '', {
      fontSize: '17px',
      color: '#ffffff',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5).setName('itemName');
    container.add(itemNameTxt);

    // Quantity row: [◀] [qty] [▶]
    const GAP = PW * 0.22;
    const QY = -PH / 2 + 92;
    const qtyLabel = this.add.text(-GAP - 14, QY, 'Qty:', {
      fontSize: '16px',
      color: '#aaaaaa',
      fontFamily: 'monospace',
    }).setOrigin(1, 0.5);
    container.add(qtyLabel);

    const qtyDecBtn = this.add.text(-GAP + 10, QY, '◀', {
      fontSize: '20px',
      color: '#ffcc44',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    qtyDecBtn.on('pointerdown', () => this.changeQty(-1));
    container.add(qtyDecBtn);

    this.confirmQtyText = this.add.text(0, QY, '1', {
      fontSize: '22px',
      color: '#ffff00',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5);
    container.add(this.confirmQtyText);

    const qtyIncBtn = this.add.text(GAP - 10, QY, '▶', {
      fontSize: '20px',
      color: '#ffcc44',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    qtyIncBtn.on('pointerdown', () => this.changeQty(1));
    container.add(qtyIncBtn);

    // Total price
    this.confirmTotalText = this.add.text(0, -PH / 2 + 128, 'Total: 0 G', {
      fontSize: '17px',
      color: '#ffcc44',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5);
    container.add(this.confirmTotalText);

    // Your Gold
    this.confirmGoldText = this.add.text(0, -PH / 2 + 154, 'Your Gold: 0 G', {
      fontSize: '14px',
      color: '#ffe066',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5);
    container.add(this.confirmGoldText);

    // Buttons
    const BTN_Y = PH / 2 - 28;
    const confirmBtn = this.add.text(-PW * 0.22, BTN_Y, '[ CONFIRM ]', {
      fontSize: '17px',
      color: '#44ff88',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    confirmBtn.on('pointerdown', () => this.confirmBuy());
    confirmBtn.on('pointerover', () => confirmBtn.setColor('#88ffaa'));
    confirmBtn.on('pointerout', () => confirmBtn.setColor('#44ff88'));
    container.add(confirmBtn);

    const cancelBtn = this.add.text(PW * 0.22, BTN_Y, '[ CANCEL ]', {
      fontSize: '17px',
      color: '#ff6644',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    cancelBtn.on('pointerdown', () => this.closeConfirmDialog());
    cancelBtn.on('pointerover', () => cancelBtn.setColor('#ff9977'));
    cancelBtn.on('pointerout', () => cancelBtn.setColor('#ff6644'));
    container.add(cancelBtn);

    container.setDepth(50).setVisible(false);
    this.confirmPanel = container;
  }

  private openConfirmDialog(): void {
    if (this.items.length === 0) return;
    const item = this.items[this.selectedIndex];
    if (!item) return;

    this.mode = 'confirm';
    this.confirmQty = 1;

    // Update the item name text inside the container
    const nameText = this.confirmPanel.getByName('itemName') as Phaser.GameObjects.Text;
    if (nameText) nameText.setText(item.name);

    this.refreshConfirmDialog();
    this.confirmPanel.setVisible(true);
  }

  private closeConfirmDialog(): void {
    this.mode = 'browse';
    this.confirmPanel.setVisible(false);
  }

  private changeQty(delta: number): void {
    if (this.mode !== 'confirm') return;
    const item = this.items[this.selectedIndex];
    if (!item) return;
    const state = GameState.getInstance();
    const maxAffordable = Math.max(1, Math.floor(state.data.gold / item.buyPrice));
    this.confirmQty = Math.max(1, Math.min(99, Math.min(maxAffordable, this.confirmQty + delta)));
    this.refreshConfirmDialog();
  }

  private refreshConfirmDialog(): void {
    const item = this.items[this.selectedIndex];
    if (!item) return;
    const state = GameState.getInstance();
    const total = item.buyPrice * this.confirmQty;
    const canAfford = state.data.gold >= total;

    this.confirmQtyText.setText(String(this.confirmQty));
    this.confirmTotalText
      .setText(`Total: ${total} G`)
      .setColor(canAfford ? '#ffcc44' : '#ff4444');
    this.confirmGoldText.setText(`Your Gold: ${state.data.gold} G`);
  }

  private confirmBuy(): void {
    if (this.mode !== 'confirm') return;
    const item = this.items[this.selectedIndex];
    if (!item) return;
    const state = GameState.getInstance();
    const total = item.buyPrice * this.confirmQty;
    if (state.data.gold < total) {
      this.setStatus(`Not enough Gold! (Need ${total} G)`, '#ff6666');
      this.refreshConfirmDialog();
      return;
    }
    state.removeGold(total);
    state.addItem(item.id, this.confirmQty);
    const qtyStr = this.confirmQty > 1 ? ` x${this.confirmQty}` : '';
    this.setStatus(`Bought ${item.name}${qtyStr}!`, '#88ff88');
    this.closeConfirmDialog();
    this.refreshGold();
  }

  update(_time: number, delta: number): void {
    if (!this.canInput) return;

    if (this.mode === 'confirm') {
      if (Phaser.Input.Keyboard.JustDown(this.leftKey) || Phaser.Input.Keyboard.JustDown(this.downKey)) {
        this.changeQty(-1);
      } else if (Phaser.Input.Keyboard.JustDown(this.rightKey) || Phaser.Input.Keyboard.JustDown(this.upKey)) {
        this.changeQty(1);
      } else if (Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.confirmBuy();
      } else if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
        this.closeConfirmDialog();
      }
    } else {
      if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
        this.selectedIndex = Math.max(0, this.selectedIndex - 1);
        this.refreshList();
      } else if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
        this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
        this.refreshList();
      } else if (Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
        this.openConfirmDialog();
      } else if (Phaser.Input.Keyboard.JustDown(this.backKey)) {
        this.leave();
      }
    }

    if (this.statusTimer > 0) {
      this.statusTimer -= delta;
      if (this.statusTimer <= 0 && this.statusText?.active) {
        this.statusText.setText('');
      }
    }
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
