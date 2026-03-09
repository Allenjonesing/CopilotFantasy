import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // All art is procedurally generated — no external assets to load.
  }

  create(): void {
    generateTextures(this);
    this.scene.start('MainMenuScene');
  }
}

// ---------------------------------------------------------------------------
// Procedural texture generation
// Each helper draws onto a temporary Graphics object and bakes it into a
// named texture that the rest of the game can reference with scene.add.image().
// ---------------------------------------------------------------------------

function generateTextures(scene: Phaser.Scene): void {
  makeTileFloor(scene);
  makeTileWall(scene);
  makeTileTree(scene);
  makeTileRock(scene);
  makeTileExit(scene);
  makePlayerSprite(scene);
  makeSlimeSprite(scene);
  makeGoblinSprite(scene);
  makeShadowWispSprite(scene);
  makeIronGolemSprite(scene);
}

/** 32×32 floor tile — dark stone with subtle crosshatch. */
function makeTileFloor(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0x2a3a4a);
  g.fillRect(0, 0, 32, 32);
  g.lineStyle(1, 0x3a4d5e, 0.5);
  g.strokeRect(0, 0, 32, 32);
  g.lineStyle(1, 0x3a4d5e, 0.3);
  g.lineBetween(0, 16, 32, 16);
  g.lineBetween(16, 0, 16, 32);
  g.generateTexture('tile_floor', 32, 32);
  g.destroy();
}

/** 32×32 wall tile — dark stone bricks. */
function makeTileWall(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0x181825);
  g.fillRect(0, 0, 32, 32);
  // Upper brick
  g.fillStyle(0x22222e);
  g.fillRect(1, 1, 30, 13);
  // Lower brick (offset for masonry look)
  g.fillRect(1, 16, 30, 14);
  g.lineStyle(1, 0x2e2e3e, 0.9);
  g.strokeRect(1, 1, 30, 13);
  g.strokeRect(1, 16, 30, 14);
  g.generateTexture('tile_wall', 32, 32);
  g.destroy();
}

/** 32×32 tree tile — layered green canopy on a brown trunk. */
function makeTileTree(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Floor background
  g.fillStyle(0x2a3a4a);
  g.fillRect(0, 0, 32, 32);
  // Trunk
  g.fillStyle(0x7a5020);
  g.fillRect(13, 20, 6, 12);
  // Canopy layers (back to front)
  g.fillStyle(0x1a5a1a);
  g.fillTriangle(16, 2, 3, 24, 29, 24);
  g.fillStyle(0x228822);
  g.fillTriangle(16, 6, 6, 22, 26, 22);
  g.fillStyle(0x33aa33);
  g.fillTriangle(16, 10, 9, 20, 23, 20);
  g.generateTexture('tile_tree', 32, 32);
  g.destroy();
}

/** 32×32 rock tile — grey boulder with highlight. */
function makeTileRock(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  g.fillStyle(0x2a3a4a);
  g.fillRect(0, 0, 32, 32);
  // Shadow beneath the rock
  g.fillStyle(0x1a2030, 0.6);
  g.fillCircle(17, 23, 10);
  // Rock body
  g.fillStyle(0x565670);
  g.fillCircle(15, 19, 11);
  // Darker shaded face
  g.fillStyle(0x404055);
  g.fillCircle(15, 18, 9);
  // Highlight
  g.fillStyle(0x8888aa);
  g.fillCircle(10, 13, 4);
  g.generateTexture('tile_rock', 32, 32);
  g.destroy();
}

/** 32×32 exit tile — golden with a white upward arrow. */
function makeTileExit(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Golden base
  g.fillStyle(0xddaa00);
  g.fillRect(0, 0, 32, 32);
  // Shimmer
  g.fillStyle(0xffee66, 0.4);
  g.fillRect(0, 0, 32, 16);
  // Arrow head
  g.fillStyle(0xffffff, 0.95);
  g.fillTriangle(16, 3, 6, 17, 26, 17);
  // Arrow stem
  g.fillRect(11, 17, 10, 10);
  g.generateTexture('tile_exit', 32, 32);
  g.destroy();
}

/** 28×28 player sprite — blue-armoured adventurer. */
function makePlayerSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair
  g.fillStyle(0x885533);
  g.fillRect(9, 1, 10, 4);
  // Head (skin)
  g.fillStyle(0xffaa77);
  g.fillRect(9, 3, 10, 8);
  // Eyes
  g.fillStyle(0x000000);
  g.fillRect(11, 6, 2, 2);
  g.fillRect(15, 6, 2, 2);
  // Body — blue plate armour
  g.fillStyle(0x3366bb);
  g.fillRect(7, 11, 14, 10);
  // Chest plate highlight
  g.fillStyle(0x5588dd);
  g.fillRect(9, 12, 10, 4);
  // Belt
  g.fillStyle(0x8a5520);
  g.fillRect(7, 19, 14, 2);
  // Arms
  g.fillStyle(0x3366bb);
  g.fillRect(2, 11, 5, 8);
  g.fillRect(21, 11, 5, 8);
  // Hands (skin)
  g.fillStyle(0xffaa77);
  g.fillRect(2, 19, 5, 3);
  g.fillRect(21, 19, 5, 3);
  // Legs
  g.fillStyle(0x225588);
  g.fillRect(7, 21, 6, 7);
  g.fillRect(15, 21, 6, 7);
  // Boots
  g.fillStyle(0x442200);
  g.fillRect(6, 26, 7, 2);
  g.fillRect(15, 26, 7, 2);
  g.generateTexture('player', 28, 28);
  g.destroy();
}

/** 28×28 slime sprite — green blob with white eyes. */
function makeSlimeSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Drop shadow
  g.fillStyle(0x225522, 0.45);
  g.fillEllipse(15, 24, 22, 7);
  // Main body
  g.fillStyle(0x33cc44);
  g.fillCircle(14, 16, 12);
  // Underside flattening
  g.fillStyle(0x22aa33);
  g.fillEllipse(14, 23, 22, 7);
  // Mid shading
  g.fillStyle(0x55dd66);
  g.fillCircle(14, 14, 9);
  // Shine
  g.fillStyle(0xaaffaa, 0.85);
  g.fillCircle(9, 10, 3);
  // White eyes
  g.fillStyle(0xffffff);
  g.fillCircle(10, 14, 4);
  g.fillCircle(18, 14, 4);
  // Pupils
  g.fillStyle(0x112211);
  g.fillCircle(11, 15, 2);
  g.fillCircle(19, 15, 2);
  g.generateTexture('enemy_slime', 28, 28);
  g.destroy();
}

/** 28×28 goblin sprite — pointy-eared brown humanoid. */
function makeGoblinSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Pointy ears
  g.fillStyle(0xbb6622);
  g.fillTriangle(5, 1, 10, 2, 9, 10);
  g.fillTriangle(23, 1, 18, 2, 19, 10);
  // Head
  g.fillStyle(0xcc7733);
  g.fillRect(8, 3, 12, 11);
  // Eyes (angry red)
  g.fillStyle(0xff3300);
  g.fillRect(10, 6, 3, 3);
  g.fillRect(15, 6, 3, 3);
  // Nose
  g.fillStyle(0xaa5522);
  g.fillRect(13, 10, 2, 2);
  // Teeth
  g.fillStyle(0xffffaa);
  g.fillRect(11, 12, 2, 2);
  g.fillRect(15, 12, 2, 2);
  // Body
  g.fillStyle(0x886633);
  g.fillRect(7, 14, 14, 8);
  // Arms
  g.fillStyle(0xcc7733);
  g.fillRect(2, 14, 5, 7);
  g.fillRect(21, 14, 5, 7);
  // Crude weapon (left hand)
  g.fillStyle(0xaaaaaa);
  g.fillRect(0, 10, 3, 12);
  // Legs
  g.fillStyle(0x664422);
  g.fillRect(7, 22, 5, 6);
  g.fillRect(16, 22, 5, 6);
  g.generateTexture('enemy_goblin', 28, 28);
  g.destroy();
}

/** 28×28 shadow wisp sprite — glowing purple ghostly flame. */
function makeShadowWispSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Outer glow halo
  g.fillStyle(0x330044, 0.45);
  g.fillCircle(14, 15, 13);
  // Main body
  g.fillStyle(0x8822aa);
  g.fillCircle(14, 17, 10);
  // Flame tip
  g.fillStyle(0x9933cc);
  g.fillTriangle(14, 2, 6, 15, 22, 15);
  // Inner glow
  g.fillStyle(0xcc55ff);
  g.fillCircle(14, 17, 6);
  // Core
  g.fillStyle(0xeeccff);
  g.fillCircle(14, 17, 3);
  // Eyes
  g.fillStyle(0xffffff);
  g.fillCircle(10, 16, 3);
  g.fillCircle(18, 16, 3);
  // Irises (glowing purple)
  g.fillStyle(0xdd88ff);
  g.fillCircle(10, 16, 2);
  g.fillCircle(18, 16, 2);
  g.generateTexture('enemy_shadowWisp', 28, 28);
  g.destroy();
}

/** 28×28 iron golem sprite — heavy grey robot with red visor. */
function makeIronGolemSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Body
  g.fillStyle(0x666680);
  g.fillRect(5, 10, 18, 14);
  // Head
  g.fillStyle(0x777795);
  g.fillRect(8, 2, 12, 9);
  // Visor (glowing red slit)
  g.fillStyle(0xff4400);
  g.fillRect(9, 5, 10, 3);
  g.fillStyle(0xff8844);
  g.fillRect(10, 5, 8, 2);
  // Armoured arms
  g.fillStyle(0x556070);
  g.fillRect(0, 10, 6, 12);
  g.fillRect(22, 10, 6, 12);
  // Panel seams
  g.lineStyle(1, 0x4a4a60);
  g.strokeRect(5, 10, 18, 14);
  g.strokeRect(8, 2, 12, 9);
  // Legs
  g.fillStyle(0x666680);
  g.fillRect(5, 24, 7, 4);
  g.fillRect(16, 24, 7, 4);
  // Heavy feet
  g.fillStyle(0x445055);
  g.fillRect(4, 26, 9, 2);
  g.fillRect(15, 26, 9, 2);
  g.generateTexture('enemy_ironGolem', 28, 28);
  g.destroy();
}
