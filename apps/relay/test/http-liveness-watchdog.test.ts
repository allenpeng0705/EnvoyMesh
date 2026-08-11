import { describe, expect, it } from "vitest";
import {
  buildRelayLivenessWatchdogScript,
  isRelayLivenessWatchdogEnabled,
} from "../src/http-liveness-watchdog.js";

describe("relay http-liveness-watchdog", () => {
  it("is enabled by default and disabled by ENVOYMESH_LIVENESS_WATCHDOG=0", () => {
    expect(isRelayLivenessWatchdogEnabled({})).toBe(true);
    expect(isRelayLivenessWatchdogEnabled({ ENVOYMESH_LIVENESS_WATCHDOG: "0" })).toBe(false);
    expect(isRelayLivenessWatchdogEnabled({ ENVOYMESH_RELAY_LIVENESS_WATCHDOG: "0" })).toBe(false);
    expect(isRelayLivenessWatchdogEnabled({ ENVOYMESH_LIVENESS_WATCHDOG: "1" })).toBe(true);
  });

  it("embeds heartbeat + http probe settings (stricter than home)", () => {
    const script = buildRelayLivenessWatchdogScript({
      port: 15432,
      parentPid: 99,
      graceMs: 60_000,
      intervalMs: 5_000,
      timeoutMs: 2_000,
      maxFails: 2,
      heartbeatPath: "/tmp/relay-hb",
      heartbeatStaleMs: 8_000,
    });
    expect(script).toContain("15432");
    expect(script).toContain("99");
    expect(script).toContain("/health");
    expect(script).toContain("SIGKILL");
    expect(script).toContain("/tmp/relay-hb");
    expect(script).toContain("heartbeat-stale");
    expect(script).toContain("8000");
  });
});
