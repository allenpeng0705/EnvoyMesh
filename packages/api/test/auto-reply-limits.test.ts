import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_REPLY_LIMITS,
  emptyContactAutoReplyState,
  evaluateAutoReplyLimit,
  markAutoReplyPaused,
  recordAutoReplySent,
  shouldEnforceAutoReplyLimits,
} from "../src/auto-reply-limits.js";

const HOUR = 60 * 60 * 1000;
const base = Date.parse("2026-05-28T12:00:00.000Z");

describe("auto-reply-limits", () => {
  it("allows sends under caps", () => {
    let state = emptyContactAutoReplyState(base);
    for (let i = 0; i < 3; i++) {
      const decision = evaluateAutoReplyLimit(state, DEFAULT_AUTO_REPLY_LIMITS, base + i * 1000);
      expect(decision.allowed).toBe(true);
      state = recordAutoReplySent(state, DEFAULT_AUTO_REPLY_LIMITS, base + i * 1000);
    }
    const after = evaluateAutoReplyLimit(state, DEFAULT_AUTO_REPLY_LIMITS, base + 4000);
    expect(after.hourlyCount).toBe(3);
    expect(after.allowed).toBe(true);
  });

  it("blocks at hourly cap", () => {
    let state = emptyContactAutoReplyState(base);
    for (let i = 0; i < DEFAULT_AUTO_REPLY_LIMITS.maxPerContactPerHour; i++) {
      state = recordAutoReplySent(state, DEFAULT_AUTO_REPLY_LIMITS, base + i * 1000);
    }
    const decision = evaluateAutoReplyLimit(state, DEFAULT_AUTO_REPLY_LIMITS, base + 5000);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("hourly_cap");
  });

  it("blocks at daily cap", () => {
    const limits = {
      ...DEFAULT_AUTO_REPLY_LIMITS,
      maxPerContactPerHour: 100,
      maxPerContactPerDay: 3,
    };
    let state = emptyContactAutoReplyState(base);
    for (let i = 0; i < 3; i++) {
      state = recordAutoReplySent(state, limits, base + i * HOUR);
    }
    const decision = evaluateAutoReplyLimit(state, limits, base + 3 * HOUR);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("daily_cap");
  });

  it("respects custom limits from settings", () => {
    const limits = {
      enabled: true,
      maxPerContactPerHour: 2,
      windowMs: HOUR,
      maxPerContactPerDay: 10,
      pauseThreadOnLimit: true,
    };
    let state = emptyContactAutoReplyState(base);
    state = recordAutoReplySent(state, limits, base);
    state = recordAutoReplySent(state, limits, base + 1000);
    const decision = evaluateAutoReplyLimit(state, limits, base + 2000);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("hourly_cap");
  });

  it("skips enforcement when disabled", () => {
    let state = emptyContactAutoReplyState(base);
    for (let i = 0; i < 10; i++) {
      state = recordAutoReplySent(state, { enabled: false }, base + i * 1000);
    }
    const decision = evaluateAutoReplyLimit(state, { enabled: false }, base + 20000);
    expect(decision.allowed).toBe(true);
  });

  it("keeps thread paused until window resets", () => {
    const limits = { ...DEFAULT_AUTO_REPLY_LIMITS, maxPerContactPerHour: 1 };
    let state = recordAutoReplySent(emptyContactAutoReplyState(base), limits, base);
    state = markAutoReplyPaused(state, limits, "hourly_cap", base + 1000);
    const blocked = evaluateAutoReplyLimit(state, limits, base + 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("hourly_cap");
  });

  it("skips enforcement for human senders when onlyForAgentPeers is true", () => {
    const limits = { ...DEFAULT_AUTO_REPLY_LIMITS, onlyForAgentPeers: true };
    expect(shouldEnforceAutoReplyLimits(limits, "human")).toBe(false);
    expect(shouldEnforceAutoReplyLimits(limits, "agent")).toBe(true);
  });

  it("enforces for all senders when onlyForAgentPeers is false", () => {
    const limits = { ...DEFAULT_AUTO_REPLY_LIMITS, onlyForAgentPeers: false };
    expect(shouldEnforceAutoReplyLimits(limits, "human")).toBe(true);
  });

  it("treats cap value 0 as unlimited", () => {
    const limits = {
      ...DEFAULT_AUTO_REPLY_LIMITS,
      maxPerContactPerHour: 0,
      maxPerContactPerDay: 0,
    };
    expect(shouldEnforceAutoReplyLimits(limits, "agent")).toBe(false);
    let state = emptyContactAutoReplyState(base);
    for (let i = 0; i < 30; i++) {
      state = recordAutoReplySent(state, limits, base + i * 1000);
    }
    const decision = evaluateAutoReplyLimit(state, limits, base + 30000);
    expect(decision.allowed).toBe(true);
  });

  it("allows unlimited hourly with finite daily cap", () => {
    const limits = {
      ...DEFAULT_AUTO_REPLY_LIMITS,
      maxPerContactPerHour: 0,
      maxPerContactPerDay: 2,
    };
    let state = emptyContactAutoReplyState(base);
    state = recordAutoReplySent(state, limits, base);
    state = recordAutoReplySent(state, limits, base + 1000);
    const decision = evaluateAutoReplyLimit(state, limits, base + 2000);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("daily_cap");
  });
});
