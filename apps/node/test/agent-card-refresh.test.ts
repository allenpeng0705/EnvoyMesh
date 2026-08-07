import { describe, expect, it } from "vitest";
import {
  AGENT_CARD_REFRESH_CONNECTED_MS,
  AGENT_CARD_REFRESH_RELAY_MS,
  agentCardDialHintsBudgetMs,
  agentCardRefreshTimeoutMs,
  mapPoolSettled,
} from "../src/agent-card-refresh.js";

describe("agentCardRefreshTimeoutMs", () => {
  it("uses a short budget when the peer is already connected", () => {
    expect(agentCardRefreshTimeoutMs(true)).toBe(AGENT_CARD_REFRESH_CONNECTED_MS);
  });

  it("uses a relay budget that exceeds dial-hints + deliver headroom", () => {
    expect(agentCardRefreshTimeoutMs(false)).toBe(AGENT_CARD_REFRESH_RELAY_MS);
    expect(AGENT_CARD_REFRESH_RELAY_MS).toBeGreaterThan(30_000 + 15_000 - 1);
  });
});

describe("agentCardDialHintsBudgetMs", () => {
  it("leaves headroom inside a total request budget", () => {
    expect(agentCardDialHintsBudgetMs(60_000)).toBe(30_000);
    expect(agentCardDialHintsBudgetMs(45_000)).toBe(30_000);
    expect(agentCardDialHintsBudgetMs(25_000)).toBe(10_000);
  });

  it("never goes below 5s or above 30s", () => {
    expect(agentCardDialHintsBudgetMs(10_000)).toBe(5_000);
    expect(agentCardDialHintsBudgetMs(120_000)).toBe(30_000);
  });
});

describe("mapPoolSettled", () => {
  it("runs with bounded concurrency and preserves order", async () => {
    const inFlight: number[] = [];
    let maxInFlight = 0;
    const results = await mapPoolSettled([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight.push(n);
      maxInFlight = Math.max(maxInFlight, inFlight.length);
      await new Promise((r) => setTimeout(r, 20));
      inFlight.splice(inFlight.indexOf(n), 1);
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });
});
