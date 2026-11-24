import { describe, expect, it } from "vitest";
import {
  __resetEhSubagentAccountForTests,
  activeEhSubagentChildren,
  releaseEhSubagentSlots,
  tryAcquireEhSubagentSlots,
} from "../src/agent-runtime-envoy/eh-subagent-account.js";

describe("eh-subagent-account (FH-P2-B)", () => {
  it("tracks acquire and release per account", () => {
    __resetEhSubagentAccountForTests();
    const key = "owner:test";
    expect(tryAcquireEhSubagentSlots(key, 2)).toEqual({ ok: true });
    expect(activeEhSubagentChildren(key)).toBe(2);
    releaseEhSubagentSlots(key, 2);
    expect(activeEhSubagentChildren(key)).toBe(0);
  });

  it("refuses when account cap exceeded", () => {
    __resetEhSubagentAccountForTests();
    const key = "owner:cap";
    expect(tryAcquireEhSubagentSlots(key, 8, 8)).toEqual({ ok: true });
    const second = tryAcquireEhSubagentSlots(key, 1, 8);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toMatch(/account concurrency/);
    }
  });
});