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
    const SIZE = 64;
    const bg = this.scene.add.rectangle(x, y, SIZE, SIZE, 0x334466, 0.72);
    bg.setStrokeStyle(2, 0x6688cc);
    bg.setDepth(60);
    bg.setInteractive();

    const txt = this.scene.add
      .text(x, y, label, { fontSize: '26px', color: '#aaccff', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setDepth(61);

    bg.on('pointerdown', (_pointer: unknown, _lx: unknown, _ly: unknown, event: { stopPropagation: () => void }) => {
      state.isDown = true;
      onJustDown?.();
      event.stopPropagation();
    });
    bg.on('pointerup', () => { state.isDown = false; });
    bg.on('pointerout', () => { state.isDown = false; });

    this.gameObjects.push(bg, txt);
  }

  private build(): void {
    const { width: W, height: H } = this.scene.scale;

    // ── D-pad (bottom-left) ─────────────────────────────────────────────────
    // Gap between centres = 70 px so a 64-px button + 6-px gutter
    const CX = W * 0.12;   // D-pad centre X  (≈ 96 px for 800-wide canvas)
    const CY = H - 78;     // D-pad centre Y  (≈ 522 px for 600-tall canvas)
    const GAP = 70;

    this.createDirButton(CX, CY - GAP, '▲', this.up, () => { this._navUpJustDown = true; });
    this.createDirButton(CX, CY + GAP, '▼', this.down, () => { this._navDownJustDown = true; });
    this.createDirButton(CX - GAP, CY, '◀', this.left);
    this.createDirButton(CX + GAP, CY, '▶', this.right);

    // Centre pip (visual only)
    const pip = this.scene.add.rectangle(CX, CY, 20, 20, 0x223355, 0.4).setDepth(60);
    this.gameObjects.push(pip);

    // ── OK / Interact button (bottom-right) ─────────────────────────────────
    const OKX = W - W * 0.10;   // ≈ 720 for 800-wide
    const OKY = H - 78;
    const okBg = this.scene.add.rectangle(OKX, OKY, 72, 72, 0x224433, 0.78);
    okBg.setStrokeStyle(2, 0x44aa77);
    okBg.setDepth(60);
    okBg.setInteractive();

    const okTxt = this.scene.add
      .text(OKX, OKY, 'OK', { fontSize: '22px', color: '#88ffcc', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setDepth(61);

    okBg.on('pointerdown', (_pointer: unknown, _lx: unknown, _ly: unknown, event: { stopPropagation: () => void }) => {
      this._interactJustDown = true;
      event.stopPropagation();
    });

    this.gameObjects.push(okBg, okTxt);

    // ── Controls legend (above D-pad, readable on mobile) ───────────────────
    const legend = this.scene.add
      .text(W / 2, H - 8, '↑↓←→ Move   Touch/Tap Enemy to fight   Yellow = Next Floor', {
        fontSize: '11px',
        color: '#667799',
        fontFamily: 'monospace',
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(62);
    this.gameObjects.push(legend);
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
