import { describe, expect, it } from "vitest";
import {
  buildLivenessWatchdogScript,
  isHomeNodeLivenessWatchdogEnabled,
} from "../src/home-node-liveness-watchdog.js";

describe("home-node-liveness-watchdog", () => {
  it("is enabled by default and disabled by ENVOYMESH_LIVENESS_WATCHDOG=0", () => {
    expect(isHomeNodeLivenessWatchdogEnabled({})).toBe(true);
    expect(isHomeNodeLivenessWatchdogEnabled({ ENVOYMESH_LIVENESS_WATCHDOG: "0" })).toBe(false);
    expect(isHomeNodeLivenessWatchdogEnabled({ ENVOYMESH_LIVENESS_WATCHDOG: "false" })).toBe(false);
    expect(isHomeNodeLivenessWatchdogEnabled({ ENVOYMESH_LIVENESS_WATCHDOG: "1" })).toBe(true);
    expect(isHomeNodeLivenessWatchdogEnabled({}, false)).toBe(false);
    expect(isHomeNodeLivenessWatchdogEnabled({ ENVOYMESH_LIVENESS_WATCHDOG: "0" }, true)).toBe(true);
  });

  it("embeds probe settings into the sibling script", () => {
    const script = buildLivenessWatchdogScript({
      port: 4030,
      parentPid: 12345,
      graceMs: 90_000,
      intervalMs: 10_000,
      timeoutMs: 3_000,
      maxFails: 3,
    });
    expect(script).toContain("4030");
    expect(script).toContain("12345");
    expect(script).toContain("/health");
    expect(script).toContain("SIGKILL");
    expect(script).toContain("maxFails");
  });
});
