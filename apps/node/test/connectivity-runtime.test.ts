import { describe, expect, it } from "vitest";
import { resolveConnectivityRuntime } from "../src/connectivity-runtime.js";

describe("resolveConnectivityRuntime — lan-fast mDNS", () => {
  it("caps mDNS interval at 12s for lan-fast even under optimized preset", () => {
    const runtime = resolveConnectivityRuntime({
      profile: "lan-fast",
      tuning: { connectivityMode: "optimized" },
    });
    expect(runtime.enableMdns).toBe(true);
    expect(runtime.mdnsIntervalMs).toBeLessThanOrEqual(12_000);
  });

  it("keeps slower mDNS for wan-default + optimized", () => {
    const runtime = resolveConnectivityRuntime({
      profile: "wan-default",
      tuning: { connectivityMode: "optimized" },
    });
    expect(runtime.mdnsIntervalMs).toBeGreaterThan(12_000);
  });
});
