import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../core/events/EventBus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = EventBus.getInstance();
    bus.clear();
  });

  it('calls a registered listener when the event is emitted', () => {
    let called = false;
    bus.on('test:event', () => { called = true; });
    bus.emit('test:event');
    expect(called).toBe(true);
  });

  it('does not call a listener after it has been removed with off()', () => {
    let count = 0;
    const handler = () => { count++; };
    bus.on('test:event', handler);
    bus.off('test:event', handler);
    bus.emit('test:event');
    expect(count).toBe(0);
  });

  it('does not accumulate listeners when the same handler is added and removed repeatedly', () => {
    let count = 0;
    const handler = () => { count++; };

    // Simulate multiple scene create/shutdown cycles.
    for (let i = 0; i < 5; i++) {
      bus.on('test:cycle', handler);
      bus.off('test:cycle', handler);
    }

    bus.emit('test:cycle');
    expect(count).toBe(0);
  });

  it('each add/remove cycle leaves exactly zero listeners for that handler', () => {
    let count = 0;
    const handler = () => { count++; };

    bus.on('test:cycle', handler);
    bus.off('test:cycle', handler);

    // Re-register for a fresh scene cycle.
    bus.on('test:cycle', handler);
    bus.emit('test:cycle');
    // Exactly one invocation — the re-registered listener.
    expect(count).toBe(1);

    bus.off('test:cycle', handler);
    bus.emit('test:cycle');
    // Still only one — the handler was removed again.
    expect(count).toBe(1);
  });

  it('different handlers for the same event are tracked independently', () => {
    let a = 0;
    let b = 0;
    const handlerA = () => { a++; };
    const handlerB = () => { b++; };

    bus.on('test:multi', handlerA);
    bus.on('test:multi', handlerB);
    bus.emit('test:multi');
    expect(a).toBe(1);
    expect(b).toBe(1);

    bus.off('test:multi', handlerA);
    bus.emit('test:multi');
    // Only handlerB should fire.
    expect(a).toBe(1);
    expect(b).toBe(2);
  });

  it('clear() removes all listeners across all events', () => {
    let count = 0;
    bus.on('event:a', () => { count++; });
    bus.on('event:b', () => { count++; });
    bus.clear();
    bus.emit('event:a');
    bus.emit('event:b');
    expect(count).toBe(0);
  });

  it('passes arguments from emit() to listeners', () => {
    let received: unknown;
    bus.on('test:args', (val) => { received = val; });
    bus.emit('test:args', 42);
    expect(received).toBe(42);
  });
});
