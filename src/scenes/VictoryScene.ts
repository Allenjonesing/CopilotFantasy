import Phaser from 'phaser';
import itemsData from '../data/items.json';
import skillsData from '../data/skills.json';

interface SkillGain {
  charName: string;
  skillId: string;
}

interface VictoryData {
  expGained: number;
  gilGained: number;
  itemsGained: string[];
  leveledUp: boolean;
  newLevel: number;
  skillsGained?: SkillGain[];
  scoreGained: number;
  totalScore: number;
  difficultyLevel: number;
}

export class VictoryScene extends Phaser.Scene {
  private victoryData!: VictoryData;
  private continueKey!: Phaser.Input.Keyboard.Key;

  constructor() {
    super({ key: 'VictoryScene' });
  }

  init(data: VictoryData): void {
    this.victoryData = data;
  }

  create(): void {
    const { width, height } = this.scale;
    const d = this.victoryData;

    // Semi-transparent dark overlay
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.88);

    // ── VICTORY banner ──────────────────────────────────────────
    this.add
      .text(width / 2, height * 0.1, '✦  VICTORY  ✦', {
        fontSize: '38px',
        color: '#ffdd00',
        fontFamily: 'monospace',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    // Gold bar below title
    this.add.rectangle(width / 2, height * 0.19, width * 0.7, 2, 0xffdd00, 0.5);

    let cy = height * 0.26;
    const lineH = height * 0.072;

    const addLine = (txt: string, color: string, size = '20px'): void => {
      this.add
        .text(width / 2, cy, txt, {
          fontSize: size,
          color,
          fontFamily: 'monospace',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      cy += lineH;
    };

    addLine(`EXP  +${d.expGained}`, '#88ffaa', '22px');
    addLine(`Gil  +${d.gilGained}`, '#ffcc44', '22px');

    if (d.itemsGained.length > 0) {
      const names = d.itemsGained.map((id) => {
        const def = itemsData.items.find((it) => it.id === id);
        return def ? def.name : id;
      });
      addLine(`Found: ${names.join(', ')}`, '#aaddff', '20px');
    }

    cy += lineH * 0.3;

    if (d.leveledUp) {
      addLine(`★ LEVEL UP  →  Lv. ${d.newLevel} ★`, '#ffaa00', '24px');

      // Show each skill gained on level-up.
      const skills = d.skillsGained ?? [];
      for (const gain of skills) {
        const skillDef = skillsData.skills.find((s) => s.id === gain.skillId);
        const skillName = skillDef ? skillDef.name : gain.skillId;
        addLine(`  ${gain.charName} learned  ${skillName}!`, '#ffdd88', '18px');
      }
    }

    addLine(`Score  +${d.scoreGained}   (Total: ${d.totalScore})`, '#ff8888', '20px');

    cy += lineH * 0.2;
    // Gold bar above footer
    this.add.rectangle(width / 2, cy, width * 0.7, 2, 0xffdd00, 0.3);
    cy += lineH * 0.4;
    addLine(`Floor ${d.difficultyLevel}  --  Seek the exit to advance`, '#aa88ff', '18px');

    // ── Continue prompt ─────────────────────────────────────────
    this.add
      .text(width / 2, height * 0.9, 'Press ENTER or tap to continue', {
        fontSize: '16px',
        color: '#888888',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.continueKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    // Tap anywhere to continue.
    this.input.once('pointerdown', () => this.proceed());

    // Auto-advance after 10 seconds.
    this.time.delayedCall(10000, () => this.proceed());
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.continueKey)) {
      this.proceed();
    }
  }

  private proceed(): void {
    this.scene.start('ExplorationScene');
  }
}
