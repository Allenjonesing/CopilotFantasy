import { describe, it, expect, beforeEach } from 'vitest';
import { DialogueSystem } from '../systems/dialogue/DialogueSystem';
import { EventBus } from '../core/events/EventBus';

describe('DialogueSystem', () => {
  let dialogue: DialogueSystem;

  beforeEach(() => {
    EventBus.getInstance().clear();
    dialogue = new DialogueSystem();
  });

  it('starts a dialogue and emits the first line', () => {
    let received: unknown = null;
    EventBus.getInstance().on('dialogue:opened', (line) => { received = line; });
    dialogue.start('elder_intro');
    expect(dialogue.active).toBe(true);
    expect(received).not.toBeNull();
  });

  it('advances through lines without choices', () => {
    dialogue.start('merchant_intro');
    const first = dialogue.currentLine();
    expect(first?.speaker).toBe('Merchant');
    dialogue.advance(); // line 0 → line 1
    dialogue.advance(); // line 1 → end
    expect(dialogue.active).toBe(false);
  });

  it('does not advance when a choice is present', () => {
    dialogue.start('elder_intro');
    // Move to the line that has choices (3rd line in 'start' node)
    dialogue.advance(); // line 1 → line 2
    dialogue.advance(); // line 2 → line 3 (choices)
    const line = dialogue.currentLine();
    expect(line?.choices).toBeDefined();
    // Calling advance should be a no-op
    dialogue.advance();
    expect(dialogue.currentLine()).toEqual(line);
    expect(dialogue.active).toBe(true);
  });

  it('chooses "Yes, I will!" and transitions to accept node', () => {
    dialogue.start('elder_intro');
    dialogue.advance(); // line 1 → line 2
    dialogue.advance(); // line 2 → line 3 (choices)
    dialogue.choose(0); // "Yes, I will!" → 'accept' node
    const line = dialogue.currentLine();
    expect(line?.speaker).toBe('Elder');
    expect(line?.text).toMatch(/Brave soul/);
  });

  it('chooses "Tell me more" and transitions to more_info node', () => {
    dialogue.start('elder_intro');
    dialogue.advance(); // line 1 → line 2
    dialogue.advance(); // line 2 → line 3 (choices)
    dialogue.choose(1); // "Tell me more." → 'more_info' node
    const line = dialogue.currentLine();
    expect(line?.text).toMatch(/Crystals/);
  });

  it('emits dialogue:closed when dialogue finishes', () => {
    let closed = false;
    EventBus.getInstance().on('dialogue:closed', () => { closed = true; });
    dialogue.start('merchant_intro');
    dialogue.advance(); // line 0 → line 1
    dialogue.advance(); // line 1 → end
    expect(closed).toBe(true);
    expect(dialogue.active).toBe(false);
  });
});
