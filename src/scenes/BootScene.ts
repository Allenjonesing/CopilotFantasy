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
  makeKaelSprite(scene);
  makeLyraSprite(scene);
  makeSlimeSprite(scene);
  makeGoblinSprite(scene);
  makeShadowWispSprite(scene);
  makeIronGolemSprite(scene);
  makeCoinSprite(scene);
  makeChestSprite(scene);
  makeShopkeeperSprite(scene);
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

/** 28×28 player sprite — red-armoured warrior (Aria). */
function makePlayerSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — short dark auburn
  g.fillStyle(0x551a00);
  g.fillRect(8, 1, 12, 5);
  g.fillRect(7, 2, 14, 4);
  // Helmet crest on top
  g.fillStyle(0xcc2200);
  g.fillRect(10, 0, 8, 3);
  // Head (skin)
  g.fillStyle(0xf5a875);
  g.fillRect(9, 4, 10, 8);
  // Eyes (determined look)
  g.fillStyle(0x1a1a3a);
  g.fillRect(10, 7, 3, 2);
  g.fillRect(15, 7, 3, 2);
  // Eye shine
  g.fillStyle(0xffffff);
  g.fillRect(12, 7, 1, 1);
  g.fillRect(17, 7, 1, 1);
  // Nose / mouth
  g.fillStyle(0xcc7755);
  g.fillRect(13, 9, 2, 1);
  g.fillRect(11, 11, 6, 1);
  // Body — red plate armour
  g.fillStyle(0xaa1100);
  g.fillRect(7, 12, 14, 10);
  // Chest plate highlight
  g.fillStyle(0xdd3322);
  g.fillRect(9, 13, 10, 5);
  // Armour seam lines
  g.lineStyle(1, 0x881100, 0.8);
  g.lineBetween(14, 13, 14, 21);
  // Shoulder pads
  g.fillStyle(0xcc2200);
  g.fillRect(5, 12, 4, 4);
  g.fillRect(19, 12, 4, 4);
  // Belt
  g.fillStyle(0x7a4010);
  g.fillRect(7, 22, 14, 2);
  // Belt buckle
  g.fillStyle(0xddaa00);
  g.fillRect(12, 22, 4, 2);
  // Arms
  g.fillStyle(0xaa1100);
  g.fillRect(2, 12, 4, 8);
  g.fillRect(22, 12, 4, 8);
  // Bracers
  g.fillStyle(0x881100);
  g.fillRect(2, 17, 4, 3);
  g.fillRect(22, 17, 4, 3);
  // Hands (skin)
  g.fillStyle(0xf5a875);
  g.fillRect(1, 20, 5, 3);
  g.fillRect(22, 20, 5, 3);
  // Sword (right hand)
  g.fillStyle(0xaaaacc);
  g.fillRect(26, 10, 2, 10);
  // Sword guard
  g.fillStyle(0xddaa00);
  g.fillRect(25, 18, 4, 2);
  // Legs — armoured
  g.fillStyle(0x881100);
  g.fillRect(7, 24, 6, 4);
  g.fillRect(15, 24, 6, 4);
  // Boots
  g.fillStyle(0x3a1a00);
  g.fillRect(6, 26, 8, 2);
  g.fillRect(14, 26, 8, 2);
  g.generateTexture('player', 28, 28);
  g.destroy();
}

/** 28×28 Kael sprite — dark-robed mage with glowing staff. */
function makeKaelSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — black with blue highlight
  g.fillStyle(0x111122);
  g.fillRect(8, 1, 12, 6);
  g.fillStyle(0x2233aa);
  g.fillRect(9, 1, 10, 2);
  // Head (slightly pale, scholarly)
  g.fillStyle(0xf0d0b0);
  g.fillRect(9, 5, 10, 8);
  // Eyes (glowing arcane blue)
  g.fillStyle(0x0044ff);
  g.fillRect(10, 8, 3, 2);
  g.fillRect(15, 8, 3, 2);
  // Eye shine
  g.fillStyle(0xaaccff);
  g.fillRect(10, 8, 1, 1);
  g.fillRect(15, 8, 1, 1);
  // Focused mouth
  g.fillStyle(0xbb8855);
  g.fillRect(12, 11, 4, 1);
  // Robe body (dark navy with purple trim)
  g.fillStyle(0x111133);
  g.fillRect(7, 13, 14, 11);
  // Robe trim (purple)
  g.fillStyle(0x6622aa);
  g.fillRect(7, 13, 14, 2);
  g.fillRect(7, 22, 14, 2);
  g.fillRect(7, 13, 2, 11);
  g.fillRect(19, 13, 2, 11);
  // Belt with arcane rune
  g.fillStyle(0x4411aa);
  g.fillRect(7, 19, 14, 3);
  g.fillStyle(0x9955ff);
  g.fillRect(12, 20, 4, 1);
  // Arms (narrow robe sleeves)
  g.fillStyle(0x111133);
  g.fillRect(2, 13, 6, 9);
  g.fillRect(20, 13, 6, 9);
  // Robe sleeve trim
  g.fillStyle(0x6622aa);
  g.fillRect(2, 20, 6, 2);
  g.fillRect(20, 20, 6, 2);
  // Hands (pale)
  g.fillStyle(0xf0d0b0);
  g.fillRect(2, 21, 4, 3);
  g.fillRect(22, 21, 4, 3);
  // Robe skirt / legs (flowing)
  g.fillStyle(0x0d0d22);
  g.fillRect(6, 24, 6, 4);
  g.fillRect(16, 24, 6, 4);
  g.fillRect(10, 24, 8, 2);
  // Staff (left side, glowing tip)
  g.fillStyle(0x8855aa);
  g.fillRect(0, 5, 3, 22);
  // Staff crystal top
  g.fillStyle(0x4499ff);
  g.fillRect(0, 3, 3, 4);
  g.fillStyle(0xaaddff);
  g.fillRect(1, 3, 1, 2);
  // Staff glow ring
  g.fillStyle(0x6677ff);
  g.fillRect(0, 2, 3, 2);
  g.generateTexture('player_kael', 28, 28);
  g.destroy();
}

/** 28×28 Lyra sprite — white-robed healer with a glowing sceptre. */
function makeLyraSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — long golden, pulled back
  g.fillStyle(0xddaa22);
  g.fillRect(8, 1, 12, 6);
  g.fillRect(18, 6, 4, 8);
  // Hair shine
  g.fillStyle(0xffee88);
  g.fillRect(10, 1, 6, 2);
  // Head (warm skin)
  g.fillStyle(0xf8c899);
  g.fillRect(9, 5, 10, 8);
  // Eyes (gentle green)
  g.fillStyle(0x22aa44);
  g.fillRect(10, 8, 3, 2);
  g.fillRect(15, 8, 3, 2);
  // Eye shine
  g.fillStyle(0xaaffcc);
  g.fillRect(10, 8, 1, 1);
  g.fillRect(15, 8, 1, 1);
  // Gentle smile
  g.fillStyle(0xcc9966);
  g.fillRect(11, 11, 6, 1);
  g.fillRect(11, 12, 1, 1);
  g.fillRect(16, 12, 1, 1);
  // Robe body (white/ivory with green trim)
  g.fillStyle(0xeeeedd);
  g.fillRect(7, 13, 14, 11);
  // Holy symbol on chest
  g.fillStyle(0xffee88);
  g.fillRect(13, 14, 2, 6);
  g.fillRect(11, 16, 6, 2);
  // Robe trim (emerald green)
  g.fillStyle(0x118833);
  g.fillRect(7, 13, 14, 2);
  g.fillRect(7, 22, 14, 2);
  g.fillRect(7, 13, 2, 11);
  g.fillRect(19, 13, 2, 11);
  // Arms (wide sleeves)
  g.fillStyle(0xeeeedd);
  g.fillRect(2, 13, 6, 9);
  g.fillRect(20, 13, 6, 9);
  // Sleeve trim
  g.fillStyle(0x118833);
  g.fillRect(2, 20, 6, 2);
  g.fillRect(20, 20, 6, 2);
  // Hands (warm)
  g.fillStyle(0xf8c899);
  g.fillRect(2, 21, 4, 3);
  g.fillRect(22, 21, 4, 3);
  // Robe skirt
  g.fillStyle(0xddddc8);
  g.fillRect(6, 24, 6, 4);
  g.fillRect(16, 24, 6, 4);
  g.fillRect(10, 24, 8, 2);
  // Healing sceptre (right side, topped with glowing orb)
  g.fillStyle(0xccaa66);
  g.fillRect(25, 7, 3, 20);
  // Sceptre head ornament
  g.fillStyle(0xffee44);
  g.fillRect(23, 5, 5, 5);
  // Central orb (green healing glow)
  g.fillStyle(0x44ff88);
  g.fillCircle(26, 5, 3);
  g.fillStyle(0xaaffcc);
  g.fillCircle(26, 5, 2);
  g.generateTexture('player_lyra', 28, 28);
  g.destroy();
}


function makeSlimeSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Drop shadow
  g.fillStyle(0x220033, 0.5);
  g.fillEllipse(15, 25, 22, 7);
  // Main body — dark purple (venomous)
  g.fillStyle(0x7711aa);
  g.fillCircle(14, 16, 12);
  // Underside flattening
  g.fillStyle(0x550088);
  g.fillEllipse(14, 23, 22, 7);
  // Toxic sheen mid
  g.fillStyle(0xaa33cc);
  g.fillCircle(14, 14, 9);
  // Poison drip (bottom)
  g.fillStyle(0x55ff44);
  g.fillCircle(10, 24, 2);
  g.fillCircle(17, 25, 2);
  g.fillCircle(13, 26, 2);
  // Shine
  g.fillStyle(0xddaaff, 0.85);
  g.fillCircle(9, 10, 3);
  // White eyes (wide and menacing)
  g.fillStyle(0xffffff);
  g.fillCircle(10, 14, 4);
  g.fillCircle(18, 14, 4);
  // Pupils (slit-like)
  g.fillStyle(0x110011);
  g.fillRect(9, 13, 3, 4);
  g.fillRect(17, 13, 3, 4);
  // Eye glow
  g.fillStyle(0x44ff44);
  g.fillCircle(10, 14, 1);
  g.fillCircle(18, 14, 1);
  g.generateTexture('enemy_slime', 28, 28);
  g.destroy();
}

/** 28×28 goblin sprite — yellow-eyed green humanoid with crude weapon. */
function makeGoblinSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Pointy ears (green)
  g.fillStyle(0x448833);
  g.fillTriangle(5, 1, 10, 2, 8, 11);
  g.fillTriangle(23, 1, 18, 2, 20, 11);
  // Head (dark green)
  g.fillStyle(0x556633);
  g.fillRect(8, 3, 12, 11);
  // Brow ridge (darker green)
  g.fillStyle(0x3a4a22);
  g.fillRect(8, 3, 12, 3);
  // Eyes (glowing yellow — angry)
  g.fillStyle(0xffee00);
  g.fillRect(10, 6, 3, 3);
  g.fillRect(15, 6, 3, 3);
  // Pupils
  g.fillStyle(0x220000);
  g.fillRect(11, 7, 1, 2);
  g.fillRect(16, 7, 1, 2);
  // Nose (flat)
  g.fillStyle(0x2a3310);
  g.fillRect(13, 10, 2, 2);
  // Tusks / teeth
  g.fillStyle(0xffffcc);
  g.fillRect(10, 12, 2, 3);
  g.fillRect(16, 12, 2, 3);
  // Mouth snarl
  g.fillStyle(0x110800);
  g.fillRect(11, 13, 6, 1);
  // Body (ragged leather)
  g.fillStyle(0x3a2d18);
  g.fillRect(7, 14, 14, 8);
  // Chest straps
  g.fillStyle(0x5a4020);
  g.fillRect(8, 15, 2, 7);
  g.fillRect(18, 15, 2, 7);
  g.fillRect(8, 18, 12, 2);
  // Arms
  g.fillStyle(0x556633);
  g.fillRect(2, 14, 5, 7);
  g.fillRect(21, 14, 5, 7);
  // Crude bone club (left hand)
  g.fillStyle(0xddccaa);
  g.fillRect(0, 8, 3, 14);
  g.fillRect(0, 8, 5, 3);
  // Legs
  g.fillStyle(0x3a2d18);
  g.fillRect(7, 22, 5, 6);
  g.fillRect(16, 22, 5, 6);
  // Feet
  g.fillStyle(0x1a1a1a);
  g.fillRect(6, 26, 7, 2);
  g.fillRect(15, 26, 7, 2);
  g.generateTexture('enemy_goblin', 28, 28);
  g.destroy();
}

/** 28×28 shadow wisp sprite — glowing dark-blue ghostly flame. */
function makeShadowWispSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Outer glow halo (dark blue)
  g.fillStyle(0x000033, 0.5);
  g.fillCircle(14, 15, 14);
  // Wisp trails at bottom
  g.fillStyle(0x1122aa);
  g.fillTriangle(8, 22, 12, 28, 14, 19);
  g.fillTriangle(20, 22, 16, 28, 14, 19);
  g.fillTriangle(14, 24, 11, 28, 17, 28);
  // Main body
  g.fillStyle(0x1133cc);
  g.fillCircle(14, 17, 10);
  // Flame tip (sharp upward)
  g.fillStyle(0x2244ee);
  g.fillTriangle(14, 3, 7, 16, 21, 16);
  // Inner glow
  g.fillStyle(0x4466ff);
  g.fillCircle(14, 17, 6);
  // Core
  g.fillStyle(0x99aaff);
  g.fillCircle(14, 16, 3);
  // Eyes (icy cyan glow)
  g.fillStyle(0xaaeeff);
  g.fillCircle(10, 16, 3);
  g.fillCircle(18, 16, 3);
  // Irises
  g.fillStyle(0x00ccff);
  g.fillCircle(10, 16, 2);
  g.fillCircle(18, 16, 2);
  // Eye pupil (void)
  g.fillStyle(0x000011);
  g.fillCircle(10, 16, 1);
  g.fillCircle(18, 16, 1);
  g.generateTexture('enemy_shadowWisp', 28, 28);
  g.destroy();
}

/** 28×28 iron golem sprite — massive metallic construct with glowing core. */
function makeIronGolemSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Legs — thick pillars
  g.fillStyle(0x4a5060);
  g.fillRect(5, 22, 8, 6);
  g.fillRect(15, 22, 8, 6);
  // Heavy feet
  g.fillStyle(0x363c47);
  g.fillRect(3, 25, 10, 3);
  g.fillRect(15, 25, 10, 3);
  // Body (broad torso)
  g.fillStyle(0x5c6478);
  g.fillRect(4, 9, 20, 14);
  // Torso highlight (top edge)
  g.fillStyle(0x7a88a0);
  g.fillRect(4, 9, 20, 3);
  // Chest glow orb (red-orange energy core)
  g.fillStyle(0xff3300);
  g.fillCircle(14, 16, 5);
  g.fillStyle(0xff7744);
  g.fillCircle(14, 16, 3);
  g.fillStyle(0xffcc88);
  g.fillCircle(14, 16, 1);
  // Panel seam lines
  g.lineStyle(1, 0x2a3040, 1);
  g.lineBetween(4, 14, 24, 14);
  g.lineBetween(4, 18, 24, 18);
  g.lineBetween(9, 9, 9, 23);
  g.lineBetween(19, 9, 19, 23);
  // Shoulder armour (boxy)
  g.fillStyle(0x4a5060);
  g.fillRect(0, 9, 5, 9);
  g.fillRect(23, 9, 5, 9);
  // Head (square helmet)
  g.fillStyle(0x6a7488);
  g.fillRect(7, 1, 14, 9);
  // Helmet top plate
  g.fillStyle(0x7a88a0);
  g.fillRect(7, 1, 14, 2);
  // Visor (glowing amber slit)
  g.fillStyle(0xff6600);
  g.fillRect(9, 4, 10, 3);
  g.fillStyle(0xffcc44);
  g.fillRect(10, 5, 8, 1);
  // Arms (rectangular)
  g.fillStyle(0x4a5060);
  g.fillRect(0, 11, 4, 10);
  g.fillRect(24, 11, 4, 10);
  g.generateTexture('enemy_ironGolem', 28, 28);
  g.destroy();
}

/** 24×24 coin — golden disc with shine. */
function makeCoinSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Outer gold ring
  g.fillStyle(0xddaa00);
  g.fillCircle(12, 12, 11);
  // Inner gold face
  g.fillStyle(0xffcc00);
  g.fillCircle(12, 12, 9);
  // Shine highlight
  g.fillStyle(0xffee88);
  g.fillCircle(9, 9, 3);
  // Edge detail
  g.lineStyle(1, 0xcc9900, 0.8);
  g.strokeCircle(12, 12, 10);
  g.generateTexture('coin', 24, 24);
  g.destroy();
}

/** 28×28 chest — wooden chest with metal trim and latch. */
function makeChestSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Chest body (lower)
  g.fillStyle(0x8b5e1a);
  g.fillRect(2, 14, 24, 12);
  // Chest lid (upper)
  g.fillStyle(0xaa7722);
  g.fillRect(2, 6, 24, 10);
  // Metal band
  g.fillStyle(0xd4aa40);
  g.fillRect(2, 13, 24, 3);
  // Metal trim on lid
  g.fillStyle(0xd4aa40);
  g.fillRect(2, 6, 24, 2);
  g.fillRect(2, 14, 24, 2);
  // Latch
  g.fillStyle(0xe0c050);
  g.fillRect(11, 11, 6, 6);
  g.fillStyle(0xffd700);
  g.fillRect(13, 13, 2, 2);
  // Outline
  g.lineStyle(1, 0x5a3a0a, 0.9);
  g.strokeRect(2, 6, 24, 20);
  g.generateTexture('chest', 28, 28);
  g.destroy();
}

/** 28×28 shopkeeper — friendly merchant NPC. */
function makeShopkeeperSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Robe/body (blue merchant robe)
  g.fillStyle(0x2244aa);
  g.fillRect(6, 14, 16, 14);
  // Head
  g.fillStyle(0xf5c89a);
  g.fillCircle(14, 10, 7);
  // Hat (merchant cap)
  g.fillStyle(0x1133bb);
  g.fillRect(7, 3, 14, 5);
  g.fillRect(5, 6, 18, 3);
  // Hat brim shine
  g.fillStyle(0xffdd00);
  g.fillRect(5, 6, 18, 1);
  // Eyes
  g.fillStyle(0x222222);
  g.fillRect(11, 9, 2, 2);
  g.fillRect(15, 9, 2, 2);
  // Smile
  g.lineStyle(1, 0x553311);
  g.strokeRect(12, 12, 4, 1);
  // Satchel/bag
  g.fillStyle(0xcc8822);
  g.fillRect(18, 16, 6, 8);
  g.fillStyle(0xddaa33);
  g.fillRect(19, 17, 4, 6);
  // Arms
  g.fillStyle(0x2244aa);
  g.fillRect(2, 16, 4, 10);
  g.fillRect(22, 16, 4, 10);
  g.generateTexture('shopkeeper', 28, 28);
  g.destroy();
}
