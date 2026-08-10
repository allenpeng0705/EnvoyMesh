import { describe, expect, it, vi } from "vitest";
import { waitForEnvoyLocalIdle } from "../../src/lib/envoy-local-wait.js";
import type { EnvoyLocalStatus } from "@envoymesh/api";

function status(partial: Partial<EnvoyLocalStatus>): EnvoyLocalStatus {
  return {
    enabled: true,
    running: false,
    phase: "downloading-runtime",
    port: 18790,
    endpoint: "http://127.0.0.1:18790/v1",
    runtimeInstalled: false,
    serverParams: {},
    ...partial,
  };
}

describe("waitForEnvoyLocalIdle", () => {
  it("returns when operationInProgress clears", async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce(status({ operationInProgress: true }))
      .mockResolvedValueOnce(
        status({ operationInProgress: false, phase: "ready", running: true }),
      );
    const updates: boolean[] = [];
    const st = await waitForEnvoyLocalIdle(getStatus, {
      intervalMs: 1,
      onUpdate: (s) => updates.push(Boolean(s.operationInProgress)),
    });
    expect(st.phase).toBe("ready");
    expect(updates).toEqual([true, false]);
  });

  it("throws a VPN-hinting error after timeout", async () => {
    const getStatus = vi.fn().mockResolvedValue(
      status({ operationInProgress: true }),
    );
    await expect(
      waitForEnvoyLocalIdle(getStatus, { intervalMs: 1, timeoutMs: 20 }),
    ).rejects.toThrow(/VPN/i);
  });
});
