import { EventBus } from '../../core/events/EventBus';

export interface DialogueLine {
  speaker: string;
  text: string;
  choices?: { text: string; next: string }[];
}

export interface DialogueNode {
  id: string;
  lines: DialogueLine[];
  next?: string;
}

const DIALOGUES: Record<string, DialogueNode[]> = {
  elder_intro: [
    {
      id: 'start',
      lines: [
        { speaker: 'Elder', text: 'Welcome, young adventurer. The world grows dark.' },
        { speaker: 'Elder', text: 'Seek the three Crystals before the Shadow King awakens.' },
        {
          speaker: 'Elder',
          text: 'Will you take on this quest?',
          choices: [
            { text: 'Yes, I will!', next: 'accept' },
            { text: 'Tell me more.', next: 'more_info' },
          ],
        },
      ],
    },
    {
      id: 'accept',
      lines: [
        { speaker: 'Elder', text: 'Brave soul! May the light guide your path.' },
      ],
    },
    {
      id: 'more_info',
      lines: [
        { speaker: 'Elder', text: 'The Crystals lie in the Forest, the Desert, and the Mountain.' },
        { speaker: 'Elder', text: 'Each is guarded by a powerful guardian. Be prepared.' },
      ],
    },
  ],
  merchant_intro: [
    {
      id: 'start',
      lines: [
        { speaker: 'Merchant', text: 'Welcome! I have fine wares for sale.' },
        { speaker: 'Merchant', text: 'Come back when you have more gil!' },
      ],
    },
  ],
};

export class DialogueSystem {
  private bus: EventBus;
  private currentDialogue: DialogueNode[] | null = null;
  private currentNodeIndex = 0;
  private currentLineIndex = 0;
  active = false;

  constructor() {
    this.bus = EventBus.getInstance();
  }

  start(dialogueId: string): void {
    const dialogue = DIALOGUES[dialogueId];
    if (!dialogue) return;
    this.currentDialogue = dialogue;
    this.currentNodeIndex = 0;
    this.currentLineIndex = 0;
    this.active = true;
    this.bus.emit('dialogue:opened', this.currentLine());
  }

  currentLine(): DialogueLine | null {
    if (!this.currentDialogue) return null;
    const node = this.currentDialogue[this.currentNodeIndex];
    if (!node) return null;
    return node.lines[this.currentLineIndex] ?? null;
  }

  advance(): void {
    if (!this.currentDialogue) return;
    const node = this.currentDialogue[this.currentNodeIndex];
    const line = node?.lines[this.currentLineIndex];
    if (line?.choices) return; // Wait for choice
    this.currentLineIndex++;
    if (this.currentLineIndex >= (node?.lines.length ?? 0)) {
      if (node?.next) {
        const nextIdx = this.currentDialogue.findIndex((n) => n.id === node.next);
        if (nextIdx >= 0) {
          this.currentNodeIndex = nextIdx;
          this.currentLineIndex = 0;
          this.bus.emit('dialogue:line', this.currentLine());
          return;
        }
      }
      this.end();
      return;
    }
    this.bus.emit('dialogue:line', this.currentLine());
  }

  choose(choiceIndex: number): void {
    if (!this.currentDialogue) return;
    const node = this.currentDialogue[this.currentNodeIndex];
    const line = node?.lines[this.currentLineIndex];
    const choice = line?.choices?.[choiceIndex];
    if (!choice) return;
    const nextIdx = this.currentDialogue.findIndex((n) => n.id === choice.next);
    if (nextIdx >= 0) {
      this.currentNodeIndex = nextIdx;
      this.currentLineIndex = 0;
      this.bus.emit('dialogue:line', this.currentLine());
    } else {
      this.end();
    }
  }

  private end(): void {
    this.active = false;
    this.currentDialogue = null;
    this.bus.emit('dialogue:closed');
  }
}
