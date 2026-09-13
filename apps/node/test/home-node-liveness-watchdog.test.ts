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

  it("requires the identity it was given, not just a 200", () => {
    // The bug this fixes: every EnvoyMesh-family product answers `/health` with the
    // same body, so a *different* product holding the port satisfied the probe and a
    // wedged node stayed alive forever. The script now compares the owner id and
    // reports a mismatch as a failure.
    const script = buildLivenessWatchdogScript({
      port: 3030,
      parentPid: 1,
      graceMs: 0,
      intervalMs: 1,
      timeoutMs: 1,
      maxFails: 1,
      expectedOwnerId: "envoy:owner:abc123",
      expectedPeerId: "12D3KooWHome",
    });
    expect(script).toContain('"envoy:owner:abc123"');
    expect(script).toContain('"12D3KooWHome"');
    expect(script).toContain("bodyMatchesIdentity");
    expect(script).toContain("different node");
    // The body has to be read for that comparison to be possible at all.
    expect(script).toContain("res.setEncoding");
  });

  it("says so when it has no identity to check, rather than implying one", () => {
    const script = buildLivenessWatchdogScript({
      port: 3030,
      parentPid: 1,
      graceMs: 0,
      intervalMs: 1,
      timeoutMs: 1,
      maxFails: 1,
    });
    expect(script).toContain("no identity check");
    // With no identity the old behaviour is preserved: a 200 counts.
    expect(script).toContain("bodyMatchesIdentity");
  });
});
