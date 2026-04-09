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
  // Job-class sprites (one per playable job — used in combat to reflect the chosen class)
  makeJobWarriorSprite(scene);
  makeJobMageSprite(scene);
  makeJobHealerSprite(scene);
  makeJobGunsmithSprite(scene);
  makeJobRangerSprite(scene);
  makeJobThiefSprite(scene);
  makeJobPaladinSprite(scene);
  makeJobBerserkerSprite(scene);
  makeSlimeSprite(scene);
  makeGoblinSprite(scene);
  makeShadowWispSprite(scene);
  makeIronGolemSprite(scene);
  makeCaveBatSprite(scene);
  makeStoneTrollSprite(scene);
  makeDarkWraithSprite(scene);
  makeVoidDrakeSprite(scene);
  makeZombieSlimeSprite(scene);
  makeMushroomSporeSprite(scene);
  makeCrystalGolemSprite(scene);
  makeHealingWispSprite(scene);
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

// ─────────────────────────────────────────────────────────────────────────────
// Job-class sprites: one 28×28 sprite per playable job.
// These are displayed in combat when the character's chosen class should be
// shown, rather than a fixed character portrait.
// ─────────────────────────────────────────────────────────────────────────────

/** 28×28 Warrior job sprite — red-armoured sword fighter. */
function makeJobWarriorSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — short dark auburn
  g.fillStyle(0x551a00);
  g.fillRect(8, 1, 12, 5);
  // Helmet crest
  g.fillStyle(0xcc2200);
  g.fillRect(10, 0, 8, 3);
  // Head (skin)
  g.fillStyle(0xf5a875);
  g.fillRect(9, 4, 10, 8);
  // Eyes
  g.fillStyle(0x1a1a3a);
  g.fillRect(10, 7, 3, 2);
  g.fillRect(15, 7, 3, 2);
  // Body — red plate armour
  g.fillStyle(0xaa1100);
  g.fillRect(7, 12, 14, 10);
  g.fillStyle(0xdd3322);
  g.fillRect(9, 13, 10, 5);
  // Shoulder pads
  g.fillStyle(0xcc2200);
  g.fillRect(5, 12, 4, 4);
  g.fillRect(19, 12, 4, 4);
  // Belt
  g.fillStyle(0x7a4010);
  g.fillRect(7, 22, 14, 2);
  g.fillStyle(0xddaa00);
  g.fillRect(12, 22, 4, 2);
  // Arms
  g.fillStyle(0xaa1100);
  g.fillRect(2, 12, 4, 8);
  g.fillRect(22, 12, 4, 8);
  // Hands
  g.fillStyle(0xf5a875);
  g.fillRect(1, 20, 5, 3);
  g.fillRect(22, 20, 5, 3);
  // Sword
  g.fillStyle(0xaaaacc);
  g.fillRect(26, 10, 2, 10);
  g.fillStyle(0xddaa00);
  g.fillRect(25, 18, 4, 2);
  // Legs
  g.fillStyle(0x881100);
  g.fillRect(7, 24, 6, 4);
  g.fillRect(15, 24, 6, 4);
  g.fillStyle(0x3a1a00);
  g.fillRect(6, 26, 8, 2);
  g.fillRect(14, 26, 8, 2);
  g.generateTexture('job_warrior', 28, 28);
  g.destroy();
}

/** 28×28 Mage job sprite — dark-robed arcane caster with glowing staff. */
function makeJobMageSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — black with blue highlight
  g.fillStyle(0x111122);
  g.fillRect(8, 1, 12, 6);
  g.fillStyle(0x2233aa);
  g.fillRect(9, 1, 10, 2);
  // Head (pale, scholarly)
  g.fillStyle(0xf0d0b0);
  g.fillRect(9, 5, 10, 8);
  // Eyes (glowing arcane blue)
  g.fillStyle(0x0044ff);
  g.fillRect(10, 8, 3, 2);
  g.fillRect(15, 8, 3, 2);
  // Robe body (dark navy with purple trim)
  g.fillStyle(0x111133);
  g.fillRect(7, 13, 14, 11);
  g.fillStyle(0x6622aa);
  g.fillRect(7, 13, 14, 2);
  g.fillRect(7, 22, 14, 2);
  g.fillRect(7, 13, 2, 11);
  g.fillRect(19, 13, 2, 11);
  // Belt
  g.fillStyle(0x4411aa);
  g.fillRect(7, 19, 14, 3);
  // Arms
  g.fillStyle(0x111133);
  g.fillRect(2, 13, 6, 9);
  g.fillRect(20, 13, 6, 9);
  // Hands
  g.fillStyle(0xf0d0b0);
  g.fillRect(2, 21, 4, 3);
  g.fillRect(22, 21, 4, 3);
  // Robe skirt
  g.fillStyle(0x0d0d22);
  g.fillRect(6, 24, 6, 4);
  g.fillRect(16, 24, 6, 4);
  g.fillRect(10, 24, 8, 2);
  // Staff
  g.fillStyle(0x8855aa);
  g.fillRect(0, 5, 3, 22);
  g.fillStyle(0x4499ff);
  g.fillRect(0, 3, 3, 4);
  g.fillStyle(0xaaddff);
  g.fillRect(1, 3, 1, 2);
  g.generateTexture('job_mage', 28, 28);
  g.destroy();
}

/** 28×28 Healer job sprite — white-robed healer with healing sceptre. */
function makeJobHealerSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — long golden
  g.fillStyle(0xddaa22);
  g.fillRect(8, 1, 12, 6);
  g.fillRect(18, 6, 4, 8);
  g.fillStyle(0xffee88);
  g.fillRect(10, 1, 6, 2);
  // Head
  g.fillStyle(0xf8c899);
  g.fillRect(9, 5, 10, 8);
  // Eyes (gentle green)
  g.fillStyle(0x22aa44);
  g.fillRect(10, 8, 3, 2);
  g.fillRect(15, 8, 3, 2);
  // Smile
  g.fillStyle(0xcc9966);
  g.fillRect(11, 11, 6, 1);
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
  // Arms
  g.fillStyle(0xeeeedd);
  g.fillRect(2, 13, 6, 9);
  g.fillRect(20, 13, 6, 9);
  g.fillStyle(0x118833);
  g.fillRect(2, 20, 6, 2);
  g.fillRect(20, 20, 6, 2);
  // Hands
  g.fillStyle(0xf8c899);
  g.fillRect(2, 21, 4, 3);
  g.fillRect(22, 21, 4, 3);
  // Robe skirt
  g.fillStyle(0xddddc8);
  g.fillRect(6, 24, 6, 4);
  g.fillRect(16, 24, 6, 4);
  g.fillRect(10, 24, 8, 2);
  // Sceptre
  g.fillStyle(0xccaa66);
  g.fillRect(25, 7, 3, 20);
  g.fillStyle(0xffee44);
  g.fillRect(23, 5, 5, 5);
  g.fillStyle(0x44ff88);
  g.fillCircle(26, 5, 3);
  g.generateTexture('job_healer', 28, 28);
  g.destroy();
}

/** 28×28 Gunsmith job sprite — leather-clad marksman with a flintlock pistol. */
function makeJobGunsmithSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — short brown
  g.fillStyle(0x6a3810);
  g.fillRect(8, 1, 12, 5);
  // Wide-brim hat
  g.fillStyle(0x5a3010);
  g.fillRect(6, 2, 16, 3);
  g.fillRect(5, 1, 18, 2);
  // Head (tanned skin)
  g.fillStyle(0xe8a060);
  g.fillRect(9, 5, 10, 8);
  // Eyes (sharp, focused)
  g.fillStyle(0x1a1a0a);
  g.fillRect(10, 7, 3, 2);
  g.fillRect(15, 7, 3, 2);
  // Stubble/jaw
  g.fillStyle(0xb07840);
  g.fillRect(10, 11, 8, 2);
  // Leather coat (dark brown)
  g.fillStyle(0x5a3010);
  g.fillRect(7, 13, 14, 11);
  // Coat lapels (lighter brown)
  g.fillStyle(0x7a4820);
  g.fillRect(9, 13, 4, 8);
  g.fillRect(15, 13, 4, 8);
  // Brass buttons
  g.fillStyle(0xddaa22);
  g.fillRect(13, 14, 2, 2);
  g.fillRect(13, 18, 2, 2);
  // Belt with ammo pouch
  g.fillStyle(0x3a1a00);
  g.fillRect(7, 24, 14, 2);
  g.fillStyle(0x8a5030);
  g.fillRect(8, 24, 5, 2);
  // Arms
  g.fillStyle(0x5a3010);
  g.fillRect(2, 13, 5, 9);
  g.fillRect(21, 13, 5, 9);
  // Gloves
  g.fillStyle(0x3a2010);
  g.fillRect(2, 20, 5, 3);
  g.fillRect(21, 20, 5, 3);
  // Flintlock pistol (right hand, barrel pointing forward)
  g.fillStyle(0x222222);
  g.fillRect(22, 17, 6, 3);
  // Pistol barrel
  g.fillStyle(0x444444);
  g.fillRect(24, 18, 5, 1);
  // Pistol handle
  g.fillStyle(0x5a3010);
  g.fillRect(23, 19, 3, 3);
  // Pistol flintlock mechanism (gold)
  g.fillStyle(0xddaa22);
  g.fillRect(22, 17, 2, 2);
  // Boots
  g.fillStyle(0x3a1a00);
  g.fillRect(7, 26, 5, 2);
  g.fillRect(16, 26, 5, 2);
  g.generateTexture('job_gunsmith', 28, 28);
  g.destroy();
}

/** 28×28 Ranger job sprite — green-clad hunter with a longbow. */
function makeJobRangerSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — dark green-tinted brown
  g.fillStyle(0x3a3010);
  g.fillRect(8, 1, 12, 6);
  // Hood (dark forest green)
  g.fillStyle(0x1a4a1a);
  g.fillRect(7, 0, 14, 6);
  g.fillRect(6, 3, 2, 6);
  g.fillRect(20, 3, 2, 6);
  // Head (tanned, weathered)
  g.fillStyle(0xd08850);
  g.fillRect(9, 5, 10, 8);
  // Eyes (keen, amber)
  g.fillStyle(0x884400);
  g.fillRect(10, 7, 3, 2);
  g.fillRect(15, 7, 3, 2);
  // Eye shine
  g.fillStyle(0xffaa44);
  g.fillRect(10, 7, 1, 1);
  g.fillRect(15, 7, 1, 1);
  // Leather tunic (forest green)
  g.fillStyle(0x2a6a2a);
  g.fillRect(7, 13, 14, 11);
  // Tunic detail
  g.fillStyle(0x1a5a1a);
  g.fillRect(7, 13, 14, 2);
  g.fillRect(7, 22, 14, 2);
  // Quiver strap (brown)
  g.fillStyle(0x6a4020);
  g.fillRect(19, 13, 2, 10);
  // Belt
  g.fillStyle(0x4a2a00);
  g.fillRect(7, 24, 14, 2);
  // Arms (green sleeves)
  g.fillStyle(0x2a6a2a);
  g.fillRect(2, 13, 5, 9);
  g.fillRect(21, 13, 5, 9);
  // Bracers (brown leather)
  g.fillStyle(0x6a4020);
  g.fillRect(2, 18, 5, 4);
  g.fillRect(21, 18, 5, 4);
  // Hands
  g.fillStyle(0xd08850);
  g.fillRect(2, 21, 4, 3);
  g.fillRect(22, 21, 4, 3);
  // Longbow (left side, strung)
  g.fillStyle(0x8a5a20);
  g.fillRect(0, 2, 2, 24);
  // Bow curve (top)
  g.fillStyle(0x7a4a10);
  g.fillRect(0, 2, 4, 2);
  // Bow curve (bottom)
  g.fillRect(0, 24, 4, 2);
  // Bow string
  g.fillStyle(0xeeeecc);
  g.fillRect(1, 4, 1, 20);
  // Arrow nocked (thin, brown shaft with yellow fletching)
  g.fillStyle(0xaa7730);
  g.fillRect(2, 11, 10, 1);
  g.fillStyle(0xffee44);
  g.fillRect(2, 10, 3, 3);
  // Legs
  g.fillStyle(0x2a5a2a);
  g.fillRect(7, 26, 5, 2);
  g.fillRect(16, 26, 5, 2);
  g.generateTexture('job_ranger', 28, 28);
  g.destroy();
}

/** 28×28 Thief job sprite — dark-cloaked rogue with a dagger. */
function makeJobThiefSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Hair — short black
  g.fillStyle(0x111111);
  g.fillRect(8, 1, 12, 6);
  // Cloak hood (deep purple)
  g.fillStyle(0x3a1a5a);
  g.fillRect(6, 0, 16, 8);
  g.fillRect(5, 2, 2, 8);
  g.fillRect(21, 2, 2, 8);
  // Head (pale, shadowed)
  g.fillStyle(0xe8c898);
  g.fillRect(9, 5, 10, 8);
  // Eyes (sly, narrow)
  g.fillStyle(0x221111);
  g.fillRect(10, 7, 3, 2);
  g.fillRect(15, 7, 3, 2);
  // Smirk
  g.fillStyle(0xc08860);
  g.fillRect(11, 11, 6, 1);
  g.fillRect(16, 10, 1, 1);
  // Cloak body (dark purple with shadow)
  g.fillStyle(0x2a1040);
  g.fillRect(7, 13, 14, 11);
  g.fillStyle(0x3a1a5a);
  g.fillRect(7, 13, 3, 11);
  g.fillRect(18, 13, 3, 11);
  // Leather chest under cloak (visible strip)
  g.fillStyle(0x3a2010);
  g.fillRect(10, 14, 8, 8);
  // Belt with coin pouches
  g.fillStyle(0x221000);
  g.fillRect(7, 24, 14, 2);
  g.fillStyle(0x6a4020);
  g.fillRect(9, 24, 4, 2);
  g.fillRect(16, 24, 4, 2);
  // Arms (cloaked)
  g.fillStyle(0x2a1040);
  g.fillRect(2, 13, 5, 10);
  g.fillRect(21, 13, 5, 10);
  // Hands (gloved, dark)
  g.fillStyle(0x1a0a28);
  g.fillRect(2, 21, 5, 3);
  g.fillRect(21, 21, 5, 3);
  // Dagger (right hand)
  g.fillStyle(0x8899bb);
  g.fillRect(24, 14, 2, 8);
  g.fillStyle(0xddaa22);
  g.fillRect(23, 20, 4, 1);
  g.fillStyle(0x6a4020);
  g.fillRect(23, 21, 4, 3);
  // Legs (dark trousers)
  g.fillStyle(0x1a1028);
  g.fillRect(7, 26, 5, 2);
  g.fillRect(16, 26, 5, 2);
  g.generateTexture('job_thief', 28, 28);
  g.destroy();
}

/** 28×28 Paladin job sprite — gleaming gold-and-white holy knight. */
function makeJobPaladinSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Helmet (gold)
  g.fillStyle(0xddaa00);
  g.fillRect(8, 0, 12, 6);
  // Helmet visor (white glow)
  g.fillStyle(0xffffcc);
  g.fillRect(9, 4, 10, 4);
  // Holy light behind visor
  g.fillStyle(0xffffff);
  g.fillRect(10, 5, 8, 2);
  // Chin guard
  g.fillStyle(0xcc9900);
  g.fillRect(9, 8, 10, 4);
  // Eyes (holy golden glow)
  g.fillStyle(0xffdd44);
  g.fillRect(10, 6, 3, 2);
  g.fillRect(15, 6, 3, 2);
  // Body — gleaming gold plate
  g.fillStyle(0xddaa00);
  g.fillRect(7, 12, 14, 12);
  // Chest plate highlight
  g.fillStyle(0xffdd66);
  g.fillRect(9, 13, 10, 6);
  // Holy symbol (cross) on chest
  g.fillStyle(0xffffff);
  g.fillRect(13, 13, 2, 7);
  g.fillRect(10, 16, 8, 2);
  // Shoulder guards (large)
  g.fillStyle(0xcc9900);
  g.fillRect(4, 11, 5, 6);
  g.fillRect(19, 11, 5, 6);
  // Belt (white leather)
  g.fillStyle(0xeeeedd);
  g.fillRect(7, 24, 14, 2);
  // Arms (golden gauntlets)
  g.fillStyle(0xddaa00);
  g.fillRect(1, 12, 5, 9);
  g.fillRect(22, 12, 5, 9);
  // Shield (left arm, heraldic)
  g.fillStyle(0x2244aa);
  g.fillRect(0, 9, 3, 10);
  g.fillStyle(0xddaa00);
  g.fillRect(0, 10, 3, 2);
  // Holy sword (right hand, glowing blade)
  g.fillStyle(0xeeeeff);
  g.fillRect(26, 6, 2, 14);
  g.fillStyle(0xffffaa);
  g.fillRect(26, 7, 2, 6);
  // Sword crossguard
  g.fillStyle(0xddaa00);
  g.fillRect(24, 18, 6, 2);
  // Legs (gold plate)
  g.fillStyle(0xcc9900);
  g.fillRect(7, 26, 6, 2);
  g.fillRect(15, 26, 6, 2);
  g.generateTexture('job_paladin', 28, 28);
  g.destroy();
}

/** 28×28 Berserker job sprite — massive bare-armed warrior in fury. */
function makeJobBerserkerSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Wild hair — fierce red-brown
  g.fillStyle(0x8a2200);
  g.fillRect(6, 0, 16, 7);
  g.fillRect(4, 2, 4, 5);
  g.fillRect(20, 2, 4, 5);
  // Head (fierce, large)
  g.fillStyle(0xd08050);
  g.fillRect(8, 5, 12, 9);
  // Battle scars
  g.fillStyle(0xaa5030);
  g.fillRect(10, 7, 1, 3);
  g.fillRect(17, 6, 2, 4);
  // Eyes (burning red rage)
  g.fillStyle(0xff2200);
  g.fillRect(10, 7, 3, 2);
  g.fillRect(15, 7, 3, 2);
  // Eye glow
  g.fillStyle(0xff6644);
  g.fillRect(11, 7, 1, 1);
  g.fillRect(16, 7, 1, 1);
  // Furrowed brow (angry)
  g.fillStyle(0x8a3010);
  g.fillRect(9, 5, 10, 2);
  // Mouth (snarl)
  g.fillStyle(0x7a2a00);
  g.fillRect(11, 12, 6, 1);
  // Massive torso (bare-chested, battle-scarred)
  g.fillStyle(0xc07040);
  g.fillRect(5, 14, 18, 12);
  // Chest hair / war paint (dark streaks)
  g.fillStyle(0x8a3010);
  g.fillRect(11, 15, 2, 8);
  g.fillRect(15, 15, 2, 8);
  // War tattoo (tribal, left chest)
  g.fillStyle(0x4a0a00);
  g.fillRect(6, 16, 4, 2);
  g.fillRect(6, 20, 4, 2);
  g.fillRect(6, 16, 2, 6);
  // Tattered belt (dark)
  g.fillStyle(0x2a1000);
  g.fillRect(5, 26, 18, 2);
  // Massive arms (bare)
  g.fillStyle(0xc07040);
  g.fillRect(0, 14, 5, 10);
  g.fillRect(23, 14, 5, 10);
  // Wrist wraps (leather strips)
  g.fillStyle(0x5a3010);
  g.fillRect(0, 20, 5, 4);
  g.fillRect(23, 20, 5, 4);
  // Hands (huge, clenched)
  g.fillStyle(0xb06030);
  g.fillRect(0, 23, 5, 3);
  g.fillRect(23, 23, 5, 3);
  // Great axe (right hand)
  g.fillStyle(0x666688);
  g.fillRect(26, 4, 2, 18);
  // Axe head (massive, double-bit)
  g.fillStyle(0x888899);
  g.fillRect(24, 4, 4, 5);
  g.fillRect(24, 7, 4, 5);
  // Axe edge highlight
  g.fillStyle(0xaaaacc);
  g.fillRect(24, 4, 1, 4);
  g.fillRect(24, 8, 1, 4);
  // Legs (rough hide trousers)
  g.fillStyle(0x4a2a00);
  g.fillRect(5, 26, 7, 2);
  g.fillRect(16, 26, 7, 2);
  g.generateTexture('job_berserker', 28, 28);
  g.destroy();
}
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

/** 28×28 cave bat sprite — dark leathery wings with red eyes. */
function makeCaveBatSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Left wing (stretched, dark brown)
  g.fillStyle(0x3a1a0a);
  g.fillTriangle(0, 14, 10, 6, 12, 20);
  g.fillTriangle(0, 18, 6, 10, 10, 22);
  // Right wing
  g.fillTriangle(28, 14, 18, 6, 16, 20);
  g.fillTriangle(28, 18, 22, 10, 18, 22);
  // Wing membranes (lighter veins)
  g.fillStyle(0x5a2a10);
  g.fillTriangle(2, 14, 10, 8, 12, 18);
  g.fillTriangle(26, 14, 18, 8, 16, 18);
  // Body (dark grey-brown, oval)
  g.fillStyle(0x2a1a10);
  g.fillEllipse(14, 15, 10, 12);
  // Fur highlights
  g.fillStyle(0x4a3020);
  g.fillEllipse(14, 13, 7, 6);
  // Ears (tall, pointed)
  g.fillStyle(0x2a1a10);
  g.fillTriangle(9, 8, 11, 2, 13, 8);
  g.fillTriangle(19, 8, 17, 2, 15, 8);
  // Inner ears (pink)
  g.fillStyle(0x8a3030);
  g.fillTriangle(10, 7, 11, 3, 12, 7);
  g.fillTriangle(18, 7, 17, 3, 16, 7);
  // Eyes (glowing red)
  g.fillStyle(0xcc1100);
  g.fillCircle(11, 14, 2);
  g.fillCircle(17, 14, 2);
  // Eye glow
  g.fillStyle(0xff4422);
  g.fillCircle(11, 14, 1);
  g.fillCircle(17, 14, 1);
  // Tiny fangs
  g.fillStyle(0xffffee);
  g.fillTriangle(12, 19, 13, 22, 14, 19);
  g.fillTriangle(14, 19, 15, 22, 16, 19);
  g.generateTexture('enemy_caveBat', 28, 28);
  g.destroy();
}

/** 28×28 stone troll sprite — squat rocky humanoid with a club. */
function makeStoneTrollSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Shadow
  g.fillStyle(0x111111, 0.4);
  g.fillEllipse(14, 27, 22, 5);
  // Legs (stubby, rocky)
  g.fillStyle(0x6a6050);
  g.fillRect(6, 21, 7, 7);
  g.fillRect(15, 21, 7, 7);
  // Feet (wide, flat)
  g.fillStyle(0x4a4030);
  g.fillRect(4, 25, 9, 3);
  g.fillRect(15, 25, 9, 3);
  // Body (wide, barrel-shaped, stony)
  g.fillStyle(0x706858);
  g.fillRect(4, 10, 20, 12);
  // Rocky surface texture
  g.fillStyle(0x888070);
  g.fillRect(5, 11, 6, 5);
  g.fillRect(16, 13, 5, 4);
  g.fillRect(9, 17, 8, 3);
  // Darker cracks
  g.lineStyle(1, 0x3a3028, 1);
  g.lineBetween(8, 12, 10, 16);
  g.lineBetween(18, 14, 16, 19);
  // Arms (thick, hanging low)
  g.fillStyle(0x706858);
  g.fillRect(0, 11, 5, 10);
  g.fillRect(23, 11, 5, 10);
  // Fists (rocky knuckles)
  g.fillStyle(0x5a5040);
  g.fillRect(0, 20, 6, 5);
  g.fillRect(22, 20, 6, 5);
  // Club (right hand, crude stone-tipped)
  g.fillStyle(0x8a7a60);
  g.fillRect(24, 4, 4, 18);
  g.fillStyle(0xa08868);
  g.fillRect(23, 2, 6, 6);
  // Head (large, blocky)
  g.fillStyle(0x706858);
  g.fillRect(7, 2, 14, 10);
  // Brow ridge (overhanging)
  g.fillStyle(0x4a4030);
  g.fillRect(7, 2, 14, 3);
  // Eyes (small, beady, yellow)
  g.fillStyle(0xcc8800);
  g.fillRect(10, 5, 3, 3);
  g.fillRect(15, 5, 3, 3);
  g.fillStyle(0x220000);
  g.fillRect(11, 6, 1, 2);
  g.fillRect(16, 6, 1, 2);
  // Flat nose
  g.fillStyle(0x3a3028);
  g.fillRect(13, 8, 2, 2);
  // Tusks
  g.fillStyle(0xffffff);
  g.fillRect(11, 10, 2, 3);
  g.fillRect(15, 10, 2, 3);
  g.generateTexture('enemy_stoneTroll', 28, 28);
  g.destroy();
}

/** 28×28 dark wraith sprite — shadowy hooded figure with glowing purple tendrils. */
function makeDarkWraithSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Outer shadow/aura
  g.fillStyle(0x110011, 0.6);
  g.fillEllipse(14, 18, 24, 28);
  // Flowing shadow tendrils (bottom)
  g.fillStyle(0x220033);
  g.fillTriangle(6, 26, 10, 18, 8, 28);
  g.fillTriangle(22, 26, 18, 18, 20, 28);
  g.fillTriangle(14, 28, 11, 20, 17, 20);
  // Robe body (very dark purple)
  g.fillStyle(0x1a0022);
  g.fillRect(6, 10, 16, 14);
  // Robe highlights
  g.fillStyle(0x330044);
  g.fillRect(7, 11, 4, 10);
  g.fillRect(17, 11, 3, 10);
  // Hood (dark, oversized)
  g.fillStyle(0x110011);
  g.fillEllipse(14, 8, 16, 14);
  g.fillRect(7, 4, 14, 8);
  // Hood highlight (subtle purple)
  g.fillStyle(0x220033);
  g.fillRect(8, 4, 12, 3);
  // Void inside hood (nearly black)
  g.fillStyle(0x050005);
  g.fillEllipse(14, 9, 10, 8);
  // Glowing eyes (purple-red)
  g.fillStyle(0xaa00ff);
  g.fillCircle(11, 9, 2);
  g.fillCircle(17, 9, 2);
  // Eye cores
  g.fillStyle(0xff44ff);
  g.fillCircle(11, 9, 1);
  g.fillCircle(17, 9, 1);
  // Spectral hands (claws)
  g.fillStyle(0x330044);
  g.fillRect(2, 14, 5, 4);
  g.fillRect(21, 14, 5, 4);
  // Claw tips
  g.fillStyle(0x9900cc);
  g.fillTriangle(2, 14, 0, 12, 4, 14);
  g.fillTriangle(26, 14, 28, 12, 24, 14);
  // Purple glow ring
  g.lineStyle(2, 0x6600aa, 0.6);
  g.strokeCircle(14, 14, 12);
  g.generateTexture('enemy_darkWraith', 28, 28);
  g.destroy();
}

/** 28×28 void drake sprite — dark dragon with iridescent scales and glowing eyes. */
function makeVoidDrakeSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Left wing (swept back)
  g.fillStyle(0x1a0022);
  g.fillTriangle(0, 12, 8, 6, 10, 20);
  g.fillTriangle(0, 18, 6, 14, 9, 24);
  // Wing membrane veins
  g.fillStyle(0x330044);
  g.fillTriangle(1, 14, 8, 8, 9, 18);
  // Right wing
  g.fillStyle(0x1a0022);
  g.fillTriangle(28, 12, 20, 6, 18, 20);
  g.fillTriangle(28, 18, 22, 14, 19, 24);
  g.fillStyle(0x330044);
  g.fillTriangle(27, 14, 20, 8, 19, 18);
  // Tail
  g.fillStyle(0x22003a);
  g.fillTriangle(10, 26, 2, 28, 14, 22);
  // Body (dark, scaly)
  g.fillStyle(0x22003a);
  g.fillEllipse(14, 17, 14, 12);
  // Scale highlights (iridescent dark purple)
  g.fillStyle(0x440066);
  g.fillRect(8, 14, 4, 4);
  g.fillRect(13, 12, 4, 4);
  g.fillRect(17, 15, 3, 3);
  g.fillStyle(0x220033);
  g.fillRect(9, 18, 3, 3);
  g.fillRect(15, 17, 3, 3);
  // Neck
  g.fillStyle(0x22003a);
  g.fillRect(11, 8, 6, 8);
  // Head (angular, draconic)
  g.fillStyle(0x22003a);
  g.fillRect(8, 2, 12, 8);
  // Head ridge
  g.fillStyle(0x440066);
  g.fillRect(9, 2, 10, 2);
  // Snout (projecting)
  g.fillStyle(0x1a002a);
  g.fillRect(7, 5, 5, 4);
  // Fangs
  g.fillStyle(0xddeeff);
  g.fillRect(7, 8, 2, 3);
  g.fillRect(10, 8, 2, 3);
  // Eyes (void-blue glow)
  g.fillStyle(0x0044aa);
  g.fillCircle(13, 5, 3);
  g.fillCircle(19, 5, 3);
  g.fillStyle(0x00aaff);
  g.fillCircle(13, 5, 2);
  g.fillCircle(19, 5, 2);
  g.fillStyle(0xaaddff);
  g.fillCircle(13, 5, 1);
  g.fillCircle(19, 5, 1);
  // Horns
  g.fillStyle(0x110011);
  g.fillTriangle(10, 2, 8, 0, 12, 0);
  g.fillTriangle(18, 2, 20, 0, 16, 0);
  g.generateTexture('enemy_voidDrake', 28, 28);
  g.destroy();
}

/** 28×28 zombie slime sprite — decayed, sickly greenish-grey slime with X eyes. */
function makeZombieSlimeSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Drop shadow
  g.fillStyle(0x111100, 0.4);
  g.fillEllipse(15, 26, 22, 7);
  // Main body — sickly grey-green
  g.fillStyle(0x3a5a2a);
  g.fillCircle(14, 16, 12);
  // Underside (darker, flattened)
  g.fillStyle(0x283a1a);
  g.fillEllipse(14, 23, 22, 7);
  // Toxic mid-sheen (grey-green tint)
  g.fillStyle(0x4a6e3a);
  g.fillCircle(14, 14, 9);
  // Rotting drips (dark green)
  g.fillStyle(0x1a3a0a);
  g.fillCircle(9, 24, 2);
  g.fillCircle(16, 25, 2);
  g.fillCircle(12, 26, 2);
  // Decay spots (darker patches)
  g.fillStyle(0x223a12);
  g.fillCircle(9, 12, 2);
  g.fillCircle(19, 18, 2);
  g.fillCircle(12, 20, 2);
  // Dim highlight (sickly)
  g.fillStyle(0x88aa66, 0.5);
  g.fillCircle(9, 10, 3);
  // X eyes (zombie look)
  g.fillStyle(0xffffff);
  g.fillCircle(10, 14, 4);
  g.fillCircle(18, 14, 4);
  // X pupils (dead)
  g.lineStyle(2, 0x330000, 1);
  g.lineBetween(8, 12, 12, 16);
  g.lineBetween(12, 12, 8, 16);
  g.lineBetween(16, 12, 20, 16);
  g.lineBetween(20, 12, 16, 16);
  // Rotting stench lines
  g.lineStyle(1, 0x448822, 0.7);
  g.lineBetween(4, 8, 6, 4);
  g.lineBetween(22, 6, 24, 2);
  g.generateTexture('enemy_zombieSlime', 28, 28);
  g.destroy();
}

/** 28×28 mushroom spore sprite — round cap with stem and floating spores. */
function makeMushroomSporeSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Shadow
  g.fillStyle(0x111111, 0.3);
  g.fillEllipse(14, 27, 14, 4);
  // Stem (pale, fleshy)
  g.fillStyle(0xd4b896);
  g.fillRect(10, 18, 8, 10);
  // Stem highlight
  g.fillStyle(0xe8ceac);
  g.fillRect(11, 18, 3, 9);
  // Cap gills (underside, darker)
  g.fillStyle(0x9a7255);
  g.fillEllipse(14, 18, 18, 5);
  // Cap body (rust-brown with purple tinge)
  g.fillStyle(0x8b4513);
  g.fillEllipse(14, 12, 22, 14);
  // Cap highlight (top sheen)
  g.fillStyle(0xaa6633);
  g.fillEllipse(14, 10, 16, 8);
  // Cap top highlight
  g.fillStyle(0xcc8855);
  g.fillEllipse(12, 8, 8, 5);
  // White spots on cap (classic mushroom)
  g.fillStyle(0xffffff);
  g.fillCircle(10, 10, 2);
  g.fillCircle(18, 11, 2);
  g.fillCircle(14, 8, 2);
  g.fillCircle(8, 13, 1);
  g.fillCircle(20, 8, 1);
  // Eyes (small, beady, front of stem)
  g.fillStyle(0x220011);
  g.fillCircle(11, 21, 2);
  g.fillCircle(17, 21, 2);
  g.fillStyle(0x880033);
  g.fillCircle(11, 21, 1);
  g.fillCircle(17, 21, 1);
  // Floating spores
  g.fillStyle(0xddaa66, 0.85);
  g.fillCircle(3, 6, 2);
  g.fillCircle(24, 4, 2);
  g.fillCircle(5, 14, 1);
  g.fillCircle(25, 12, 2);
  g.fillCircle(2, 20, 1);
  g.fillCircle(26, 20, 1);
  g.generateTexture('enemy_mushroomSpore', 28, 28);
  g.destroy();
}

/** 28×28 crystal golem sprite — angular icy-blue construct with glowing inner light. */
function makeCrystalGolemSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Shadow
  g.fillStyle(0x001122, 0.4);
  g.fillEllipse(14, 27, 20, 5);
  // Legs (crystalline columns)
  g.fillStyle(0x6699bb);
  g.fillRect(5, 22, 7, 6);
  g.fillRect(16, 22, 7, 6);
  // Crystal facets on legs
  g.fillStyle(0x88bbdd);
  g.fillRect(6, 22, 4, 3);
  g.fillRect(17, 22, 4, 3);
  // Feet
  g.fillStyle(0x4477aa);
  g.fillRect(3, 25, 10, 3);
  g.fillRect(15, 25, 10, 3);
  // Body (hexagonal/multi-faceted)
  g.fillStyle(0x7799cc);
  g.fillRect(4, 9, 20, 14);
  // Crystal face highlights
  g.fillStyle(0x99ccee);
  g.fillRect(5, 10, 8, 6);
  g.fillRect(15, 12, 7, 5);
  g.fillRect(6, 18, 6, 3);
  // Edge facets (darker blue)
  g.fillStyle(0x4466aa);
  g.fillRect(4, 9, 3, 14);
  g.fillRect(21, 9, 3, 14);
  // Inner glow (blue-white)
  g.fillStyle(0xaae8ff, 0.8);
  g.fillCircle(14, 16, 4);
  g.fillStyle(0xeeffff);
  g.fillCircle(14, 16, 2);
  // Crystal shoulder spikes
  g.fillStyle(0x99ccee);
  g.fillTriangle(0, 12, 4, 9, 4, 16);
  g.fillTriangle(28, 12, 24, 9, 24, 16);
  // Head (angular facets)
  g.fillStyle(0x7799cc);
  g.fillRect(7, 1, 14, 9);
  // Head crest (sharp, icy)
  g.fillStyle(0xaaddff);
  g.fillTriangle(9, 1, 14, 0, 19, 1);
  // Visor (icy glow)
  g.fillStyle(0xaaeeff);
  g.fillRect(9, 3, 10, 4);
  g.fillStyle(0xeeffff);
  g.fillRect(10, 4, 8, 2);
  // Crystal arms (sharp-edged)
  g.fillStyle(0x6699bb);
  g.fillRect(0, 11, 4, 9);
  g.fillRect(24, 11, 4, 9);
  g.generateTexture('enemy_crystalGolem', 28, 28);
  g.destroy();
}

/** 28×28 healing wisp sprite — warm golden healing flame with a gentle glow. */
function makeHealingWispSprite(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  // Outer warm glow halo
  g.fillStyle(0x441100, 0.3);
  g.fillCircle(14, 15, 14);
  // Wisp trails at bottom (warm yellow)
  g.fillStyle(0xcc8800);
  g.fillTriangle(8, 22, 12, 28, 14, 19);
  g.fillTriangle(20, 22, 16, 28, 14, 19);
  g.fillTriangle(14, 24, 11, 28, 17, 28);
  // Main body (golden flame)
  g.fillStyle(0xee9900);
  g.fillCircle(14, 17, 10);
  // Flame tip (sharp upward)
  g.fillStyle(0xffbb22);
  g.fillTriangle(14, 3, 7, 16, 21, 16);
  // Inner warm glow
  g.fillStyle(0xffcc44);
  g.fillCircle(14, 17, 6);
  // Core (white-yellow, brightest)
  g.fillStyle(0xffeebb);
  g.fillCircle(14, 16, 3);
  // Small sparkle stars
  g.fillStyle(0xffffff);
  g.fillCircle(5, 8, 1);
  g.fillCircle(23, 6, 1);
  g.fillCircle(3, 18, 1);
  g.fillCircle(25, 16, 1);
  // Eyes (gentle warm gold)
  g.fillStyle(0xffeedd);
  g.fillCircle(10, 16, 3);
  g.fillCircle(18, 16, 3);
  // Irises (warm amber)
  g.fillStyle(0xee8800);
  g.fillCircle(10, 16, 2);
  g.fillCircle(18, 16, 2);
  // Eye shine
  g.fillStyle(0xffffff);
  g.fillCircle(10, 15, 1);
  g.fillCircle(18, 15, 1);
  g.generateTexture('enemy_healingWisp', 28, 28);
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
