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

  private build(): void {
    const { width: W, height: H } = this.scene.scale;

    // ── D-pad (bottom-left) ─────────────────────────────────────────────────
    // A single square zone divided into 4 triangular sectors by an X (diagonal lines).
    // The entire square is used — tapping near a corner of any sector still fires the
    // corresponding cardinal direction, so there is no "dead zone" in the middle.
    const DPAD_SIZE = 180;        // total square side length
    const CX = Math.max(DPAD_SIZE / 2 + 8, Math.round(W * 0.16));
    const CY = H - DPAD_SIZE / 2 - 20;

    /** Minimum pixel distance from D-pad center before a direction registers (prevents accidental centre-taps). */
    const DEAD_CENTER_THRESHOLD = 8;

    // Hit zones: each sector is a full-size rect that overlays the square; we
    // use pointer events on the shared canvas via a single Graphics object that
    // draws the visual, plus one interactive Rectangle per sector (transparent).
    const HALF = DPAD_SIZE / 2;

    // Draw the D-pad background + X divider via Graphics
    const gfx = this.scene.add.graphics();
    gfx.setDepth(60);
    gfx.setScrollFactor(0);
    // Background square
    gfx.fillStyle(0x223355, 0.70);
    gfx.fillRect(CX - HALF, CY - HALF, DPAD_SIZE, DPAD_SIZE);
    // Outer border
    gfx.lineStyle(2, 0x6688cc, 0.85);
    gfx.strokeRect(CX - HALF, CY - HALF, DPAD_SIZE, DPAD_SIZE);
    // X divider lines
    gfx.lineStyle(1, 0x6688cc, 0.40);
    gfx.beginPath();
    gfx.moveTo(CX - HALF, CY - HALF);
    gfx.lineTo(CX + HALF, CY + HALF);
    gfx.moveTo(CX + HALF, CY - HALF);
    gfx.lineTo(CX - HALF, CY + HALF);
    gfx.strokePath();
    // Arrow labels at the centre of each sector
    const labelOffset = HALF * 0.52;
    const labelStyle = { fontSize: '28px', color: '#aaccff', fontFamily: 'monospace' };
    [
      { label: '▲', lx: CX,             ly: CY - labelOffset },
      { label: '▼', lx: CX,             ly: CY + labelOffset },
      { label: '◀', lx: CX - labelOffset, ly: CY },
      { label: '▶', lx: CX + labelOffset, ly: CY },
    ].forEach(({ label, lx, ly }) => {
      this.scene.add
        .text(lx, ly, label, labelStyle)
        .setOrigin(0.5)
        .setDepth(62)
        .setScrollFactor(0);
    });
    this.gameObjects.push(gfx);

    // Sector hit regions: full DPAD_SIZE square, but we use pointer coordinates
    // inside the pointerdown handler to determine which sector was hit.
    const hitZone = this.scene.add.rectangle(CX, CY, DPAD_SIZE, DPAD_SIZE, 0x000000, 0);
    hitZone.setDepth(63);
    hitZone.setScrollFactor(0);
    hitZone.setInteractive();

    // Determine direction from pointer position relative to the D-pad centre
    const getSector = (px: number, py: number): { isDown: boolean } | null => {
      const dx = px - CX;
      const dy = py - CY;
      if (Math.abs(dx) < DEAD_CENTER_THRESHOLD && Math.abs(dy) < DEAD_CENTER_THRESHOLD) return null; // tiny dead centre
      if (Math.abs(dy) > Math.abs(dx)) {
        return dy < 0 ? this.up : this.down;
      }
      return dx < 0 ? this.left : this.right;
    };

    const allDirs = [this.up, this.down, this.left, this.right];
    const clearAll = () => allDirs.forEach((d) => { d.isDown = false; });

    hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: { stopPropagation(): void }) => {
      clearAll();
      const sector = getSector(pointer.x, pointer.y);
      if (sector) sector.isDown = true;
      // navUp / navDown just-down
      if (sector === this.up) this._navUpJustDown = true;
      if (sector === this.down) this._navDownJustDown = true;
      event.stopPropagation();
    });
    hitZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      clearAll();
      const sector = getSector(pointer.x, pointer.y);
      if (sector) sector.isDown = true;
    });
    hitZone.on('pointerup', clearAll);
    hitZone.on('pointerout', clearAll);

    this.gameObjects.push(hitZone);

    // ── OK / Interact button (bottom-right) ─────────────────────────────────
    const OKX = W - Math.max(60, Math.round(W * 0.10));
    const OKY = CY;
    const okBg = this.scene.add.rectangle(OKX, OKY, 88, 88, 0x224433, 0.78);
    okBg.setStrokeStyle(2, 0x44aa77);
    okBg.setDepth(60);
    okBg.setScrollFactor(0);
    okBg.setInteractive();

    const okTxt = this.scene.add
      .text(OKX, OKY, 'OK', { fontSize: '26px', color: '#88ffcc', fontFamily: 'monospace' })
      .setOrigin(0.5)
      .setDepth(61)
      .setScrollFactor(0);

    okBg.on('pointerdown', (_pointer: unknown, _lx: unknown, _ly: unknown, event: { stopPropagation: () => void }) => {
      this._interactJustDown = true;
      event.stopPropagation();
    });

    this.gameObjects.push(okBg, okTxt);

    // ── Controls legend (above D-pad, readable on mobile) ───────────────────
    const legend = this.scene.add
      .text(W / 2, H - 8, 'Tap D-pad to move   Tap enemies/chests to interact   Yellow = Next Floor', {
        fontSize: '11px',
        color: '#667799',
        fontFamily: 'monospace',
        align: 'center',
      })
      .setOrigin(0.5, 1)
      .setDepth(62)
      .setScrollFactor(0);
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
