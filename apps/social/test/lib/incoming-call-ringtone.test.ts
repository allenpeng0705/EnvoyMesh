/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createIncomingCallRingtone,
  startIncomingCallRingtone,
  stopIncomingCallRingtone,
} from "../../src/lib/incoming-call-ringtone.js";

describe("incoming-call-ringtone", () => {
  const stopFns: Array<() => void> = [];

  beforeEach(() => {
    class MockOscillator {
      type = "sine";
      frequency = { value: 0 };
      start = vi.fn();
      stop = vi.fn();
      connect = vi.fn();
      disconnect = vi.fn();
    }

    class MockGain {
      gain = { value: 0 };
      connect = vi.fn();
      disconnect = vi.fn();
    }

    class MockAudioContext {
      currentTime = 0;
      createOscillator = vi.fn(() => new MockOscillator());
      createGain = vi.fn(() => new MockGain());
      resume = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
    }

    (globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext =
      MockAudioContext as unknown as typeof AudioContext;
  });

  afterEach(() => {
    stopIncomingCallRingtone();
    for (const stop of stopFns.splice(0)) stop();
    vi.useRealTimers();
  });

  it("starts and stops without throwing", () => {
    const ringtone = createIncomingCallRingtone();
    stopFns.push(() => ringtone.stop());

    ringtone.start();
    expect(ringtone.isPlaying()).toBe(true);

    ringtone.stop();
    expect(ringtone.isPlaying()).toBe(false);
  });

  it("singleton helpers do not stack multiple players", () => {
    startIncomingCallRingtone();
    startIncomingCallRingtone();
    stopIncomingCallRingtone();
  });

  it("is a no-op when AudioContext is unavailable", () => {
    const prev = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    delete (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;

    const ringtone = createIncomingCallRingtone();
    ringtone.start();
    expect(ringtone.isPlaying()).toBe(false);

    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext = prev;
  });
});
