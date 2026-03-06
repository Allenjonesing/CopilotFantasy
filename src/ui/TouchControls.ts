import Phaser from 'phaser';

/** Virtual D-pad and OK button for touch / mouse input during exploration. */
export class TouchControls {
  private scene: Phaser.Scene;
  private gameObjects: Phaser.GameObjects.GameObject[] = [];

  /** Direction state — poll these like keyboard cursor keys. */
  readonly up = { isDown: false };
  readonly down = { isDown: false };
  readonly left = { isDown: false };
  readonly right = { isDown: false };

  // One-shot "just pressed" flags (cleared after being read).
  private _interactJustDown = false;
  private _navUpJustDown = false;
  private _navDownJustDown = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.build();
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  private createDirButton(
    x: number,
    y: number,
    label: string,
    state: { isDown: boolean },
    onJustDown?: () => void,
  ): void {
    const SIZE = 46;
    const bg = this.scene.add.rectangle(x, y, SIZE, SIZE, 0x334466, 0.65);
    bg.setStrokeStyle(2, 0x6688bb);
    bg.setDepth(60);
    bg.setInteractive();

    const txt = this.scene.add
      .text(x, y, label, { fontSize: '18px', color: '#aaccff', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setDepth(61);

    bg.on('pointerdown', () => {
      state.isDown = true;
      onJustDown?.();
    });
    bg.on('pointerup', () => {
      state.isDown = false;
    });
    bg.on('pointerout', () => {
      state.isDown = false;
    });

    this.gameObjects.push(bg, txt);
  }

  private build(): void {
    const CX = 75; // D-pad centre X
    const CY = 522; // D-pad centre Y
    const GAP = 50; // distance between button centres

    this.createDirButton(CX, CY - GAP, '▲', this.up, () => {
      this._navUpJustDown = true;
    });
    this.createDirButton(CX, CY + GAP, '▼', this.down, () => {
      this._navDownJustDown = true;
    });
    this.createDirButton(CX - GAP, CY, '◀', this.left);
    this.createDirButton(CX + GAP, CY, '▶', this.right);

    // Centre pip (visual only)
    const pip = this.scene.add.rectangle(CX, CY, 16, 16, 0x223355, 0.4).setDepth(60);
    this.gameObjects.push(pip);

    // OK / Interact button (bottom-right)
    const OKX = 722;
    const OKY = 522;
    const okBg = this.scene.add.rectangle(OKX, OKY, 54, 54, 0x224433, 0.75);
    okBg.setStrokeStyle(2, 0x44aa77);
    okBg.setDepth(60);
    okBg.setInteractive();

    const okTxt = this.scene.add
      .text(OKX, OKY, 'OK', { fontSize: '16px', color: '#88ffcc', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setDepth(61);

    okBg.on('pointerdown', () => {
      this._interactJustDown = true;
    });

    this.gameObjects.push(okBg, okTxt);
  }

  // ---------------------------------------------------------------------------
  // One-shot queries (consume the flag when read)
  // ---------------------------------------------------------------------------

  justDownInteract(): boolean {
    const v = this._interactJustDown;
    this._interactJustDown = false;
    return v;
  }

  justDownNavUp(): boolean {
    const v = this._navUpJustDown;
    this._navUpJustDown = false;
    return v;
  }

  justDownNavDown(): boolean {
    const v = this._navDownJustDown;
    this._navDownJustDown = false;
    return v;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.gameObjects.forEach((g) => g.destroy());
    this.gameObjects = [];
  }
}
