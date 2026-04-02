import Phaser from 'phaser';
import { GameState } from '../core/state/GameState';
import jobsData from '../data/jobs.json';
import charactersData from '../data/characters.json';

/** One job definition from jobs.json. */
interface JobDef {
  id: string;
  name: string;
  description: string;
  baseStats: {
    hp: number;
    mp: number;
    stm: number;
    maxStm: number;
    strength: number;
    magic: number;
    defense: number;
    magicDefense: number;
    agility: number;
    luck: number;
  };
}

const JOB_COLORS: Record<string, number> = {
  warrior: 0xcc6622,
  mage: 0x4466ff,
  healer: 0x44cc88,
};

export class JobSelectionScene extends Phaser.Scene {
  private upKey!: Phaser.Input.Keyboard.Key;
  private downKey!: Phaser.Input.Keyboard.Key;
  private leftKey!: Phaser.Input.Keyboard.Key;
  private rightKey!: Phaser.Input.Keyboard.Key;
  private confirmKey!: Phaser.Input.Keyboard.Key;

  /** Currently focused row (0–2 = characters, 3 = Confirm button). */
  private focusRow = 0;

  /** Index into jobsData.jobs for each character slot. */
  private jobSelections: number[] = [0, 1, 2];

  private readonly jobs: JobDef[] = (jobsData.jobs as unknown) as JobDef[];
  private readonly characterIds: string[] = charactersData.characters.map((c) => c.id);
  private readonly characterNames: string[] = charactersData.characters.map((c) => c.name);

  /** Dynamic text objects that must be refreshed on navigation. */
  private jobNameTexts: Phaser.GameObjects.Text[] = [];
  private jobDescTexts: Phaser.GameObjects.Text[] = [];
  private statTexts: Phaser.GameObjects.Text[] = [];
  private rowHighlights: Phaser.GameObjects.Rectangle[] = [];
  private confirmHighlight!: Phaser.GameObjects.Rectangle;
  private confirmText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'JobSelectionScene' });
  }

  create(): void {
    const { width: W, height: H } = this.scale;
    const gs = GameState.getInstance();

    // Reset character jobs to match their natural defaults before the player chooses.
    gs.reset();

    // Title
    this.add.text(W / 2, H * 0.05, 'Select Jobs', {
      fontSize: '28px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.add.text(W / 2, H * 0.10, '◄ ► Change job   ▲ ▼ Select character   OK Confirm', {
      fontSize: '11px', color: '#888899', fontFamily: 'monospace',
      align: 'center', wordWrap: { width: W - 16 },
    }).setOrigin(0.5);

    const ROW_H = Math.floor(H * 0.22);
    const ROW_TOP = H * 0.15;

    // Build one row per character
    this.characterNames.forEach((name, i) => {
      const rowY = ROW_TOP + i * ROW_H;

      // Row highlight (selection indicator)
      const highlight = this.add.rectangle(W / 2, rowY + ROW_H / 2 - 4, W - 12, ROW_H - 6, 0x333366, 0.8);
      highlight.setStrokeStyle(2, i === 0 ? 0xffff00 : 0x333355);
      this.rowHighlights.push(highlight);

      // Character name
      this.add.text(14, rowY + 8, name, {
        fontSize: '16px', color: '#aaaaff', fontFamily: 'monospace',
        stroke: '#000000', strokeThickness: 2,
      });

      // Job selector: ◄ JobName ►
      // Create the row-focus zone BEFORE the arrows so the arrows sit higher in
      // the display list and receive pointer events first (Phaser checks topmost
      // interactive objects first when input.topOnly = true).
      const rowZone = this.add.zone(W / 2, rowY + ROW_H / 2, W, ROW_H).setInteractive();
      rowZone.on('pointerdown', () => {
        this.focusRow = i;
        this.refreshHighlights();
      });

      const arrowL = this.add.text(14, rowY + 32, '◄', {
        fontSize: '20px', color: '#ffdd44', fontFamily: 'monospace',
      }).setInteractive({ useHandCursor: true });
      arrowL.on('pointerdown', () => {
        this.focusRow = i;
        this.changeJob(i, -1);
      });

      const jobName = this.add.text(44, rowY + 32, this.jobs[this.jobSelections[i]].name, {
        fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
        stroke: '#000000', strokeThickness: 2,
      });
      this.jobNameTexts.push(jobName);

      const arrowR = this.add.text(W - 28, rowY + 32, '►', {
        fontSize: '20px', color: '#ffdd44', fontFamily: 'monospace',
      }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
      arrowR.on('pointerdown', () => {
        this.focusRow = i;
        this.changeJob(i, 1);
      });

      // Job description
      const jobDesc = this.add.text(14, rowY + 56, this.jobs[this.jobSelections[i]].description, {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'monospace',
        wordWrap: { width: W - 28 },
      });
      this.jobDescTexts.push(jobDesc);

      // Quick stat preview: HP / MP / STM / STR / MAG
      const stats = this.jobs[this.jobSelections[i]].baseStats;
      const statStr = `HP:${stats.hp}  MP:${stats.mp}  STM:${stats.stm}  STR:${stats.strength}  MAG:${stats.magic}  DEF:${stats.defense}  AGI:${stats.agility}`;
      const statText = this.add.text(14, rowY + 74, statStr, {
        fontSize: '9px', color: '#88ccff', fontFamily: 'monospace',
      });
      this.statTexts.push(statText);
    });

    // Confirm button
    const confirmY = ROW_TOP + 3 * ROW_H + 8;
    this.confirmHighlight = this.add.rectangle(W / 2, confirmY + 18, W * 0.7, 38, 0x224422, 0.9);
    this.confirmHighlight.setStrokeStyle(2, 0x44aa66);
    this.confirmHighlight.setInteractive({ useHandCursor: true });
    this.confirmHighlight.on('pointerdown', () => this.startGame());

    this.confirmText = this.add.text(W / 2, confirmY + 18, '▶ START ADVENTURE', {
      fontSize: '18px', color: '#aaffaa', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(W / 2, confirmY + 44, '(jobs can be changed at a Job Crystal in the dungeon)', {
      fontSize: '9px', color: '#445566', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Keyboard
    this.upKey      = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.downKey    = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.leftKey    = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.rightKey   = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);
    this.confirmKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);

    this.refreshHighlights();
  }

  update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.upKey)) {
      this.focusRow = (this.focusRow - 1 + 4) % 4;
      this.refreshHighlights();
    } else if (Phaser.Input.Keyboard.JustDown(this.downKey)) {
      this.focusRow = (this.focusRow + 1) % 4;
      this.refreshHighlights();
    } else if (Phaser.Input.Keyboard.JustDown(this.leftKey)) {
      if (this.focusRow < 3) this.changeJob(this.focusRow, -1);
    } else if (Phaser.Input.Keyboard.JustDown(this.rightKey)) {
      if (this.focusRow < 3) this.changeJob(this.focusRow, 1);
    } else if (Phaser.Input.Keyboard.JustDown(this.confirmKey)) {
      this.startGame();
    }
  }

  private changeJob(charIdx: number, delta: number): void {
    const count = this.jobs.length;
    this.jobSelections[charIdx] = (this.jobSelections[charIdx] + delta + count) % count;
    this.refreshJobDisplay(charIdx);
    this.refreshHighlights();
  }

  private refreshJobDisplay(charIdx: number): void {
    const job = this.jobs[this.jobSelections[charIdx]];
    const color = JOB_COLORS[job.id] ?? 0xffffff;
    const hexColor = '#' + color.toString(16).padStart(6, '0');

    this.jobNameTexts[charIdx].setText(job.name).setColor(hexColor);
    this.jobDescTexts[charIdx].setText(job.description);
    const stats = job.baseStats;
    const statStr = `HP:${stats.hp}  MP:${stats.mp}  STM:${stats.stm}  STR:${stats.strength}  MAG:${stats.magic}  DEF:${stats.defense}  AGI:${stats.agility}`;
    this.statTexts[charIdx].setText(statStr);
  }

  private refreshHighlights(): void {
    this.rowHighlights.forEach((h, i) => {
      h.setStrokeStyle(2, i === this.focusRow ? 0xffff00 : 0x333355);
    });
    const isConfirmFocused = this.focusRow === 3;
    this.confirmHighlight.setStrokeStyle(2, isConfirmFocused ? 0xffff00 : 0x44aa66);
    this.confirmText.setColor(isConfirmFocused ? '#ffff00' : '#aaffaa');
  }

  private startGame(): void {
    const gs = GameState.getInstance();
    // Apply selected jobs to each character.
    this.characterIds.forEach((id, i) => {
      gs.applyJobToCharacter(id, this.jobs[this.jobSelections[i]].id);
    });
    this.scene.start('ExplorationScene');
  }
}
