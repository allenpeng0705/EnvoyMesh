import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getEnvoyAiInflight,
  setEnvoyAiInflight,
  subscribeEnvoyAiInflight,
} from "../../src/lib/envoy-ai-inflight.js";

afterEach(() => {
  setEnvoyAiInflight(false);
});

describe("envoy-ai-inflight", () => {
  it("notifies subscribers when inflight flips", () => {
    const seen: boolean[] = [];
    const unsub = subscribeEnvoyAiInflight(() => {
      seen.push(getEnvoyAiInflight());
    });
    setEnvoyAiInflight(true);
    setEnvoyAiInflight(true); // no-op
    setEnvoyAiInflight(false);
    unsub();
    setEnvoyAiInflight(true); // unsubscribed
    expect(seen).toEqual([true, false]);
    expect(getEnvoyAiInflight()).toBe(true);
    setEnvoyAiInflight(false);
  });

  it("does not call removed listeners", () => {
    const spy = vi.fn();
    const unsub = subscribeEnvoyAiInflight(spy);
    unsub();
    setEnvoyAiInflight(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
