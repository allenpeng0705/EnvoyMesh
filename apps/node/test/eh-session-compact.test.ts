import { describe, expect, it } from "vitest";
import {
  resolveEhAutoCompactPolicy,
  shouldAutoCompactEhSession,
} from "../src/agent-runtime-envoy/eh-session-compact.js";

describe("eh-session-compact (FH-P2-D)", () => {
  it("defaults to disabled", () => {
    const prev = process.env.ENVOYMESH_EH_AUTO_COMPACT_AFTER_MSGS;
    delete process.env.ENVOYMESH_EH_AUTO_COMPACT_AFTER_MSGS;
    try {
      expect(resolveEhAutoCompactPolicy().afterMessageCount).toBe(0);
      expect(shouldAutoCompactEhSession(999)).toBe(false);
    } finally {
      if (prev !== undefined) process.env.ENVOYMESH_EH_AUTO_COMPACT_AFTER_MSGS = prev;
    }
  });

  it("compacts when over threshold", () => {
    const policy = { afterMessageCount: 100, keep: 40 };
    expect(shouldAutoCompactEhSession(99, policy)).toBe(false);
    expect(shouldAutoCompactEhSession(100, policy)).toBe(true);
  });
});