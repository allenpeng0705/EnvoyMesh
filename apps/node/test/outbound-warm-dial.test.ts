import { describe, expect, it, vi } from "vitest";
import {
  ensureReachableWithLanFirstBudget,
  raceWithTimeout,
  WARM_CONTACT_SAME_SUBNET_EPHEMERAL_BUDGET_MS,
} from "../src/outbound-warm-dial.js";

describe("raceWithTimeout", () => {
  it("invokes onTimeout when the budget elapses", async () => {
    const onTimeout = vi.fn();
    const pending = new Promise<string>(() => {
      /* never settles */
    });
    await expect(raceWithTimeout(pending, 20, "testBudget", onTimeout)).rejects.toThrow(
      /testBudget timed out/,
    );
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});

describe("ensureReachableWithLanFirstBudget", () => {
  it("skips dedicated LAN-only phase for ephemeral LAN + circuits", async () => {
    const ensurePeerReachable = vi.fn().mockResolvedValue({ connected: true, direct: false });
    const mesh = {
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    await ensureReachableWithLanFirstBudget({
      mesh,
      transportPeerId: "12D3KooWPeer",
      protocol: "/envoymesh/chat/0.1.0",
      dialHints: [
        "/ip4/10.0.0.2/tcp/57944/p2p/12D3KooWPeer",
        "/ip4/1.2.3.4/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWPeer",
      ],
      sameSubnetLanFirst: true,
    });

    expect(ensurePeerReachable).toHaveBeenCalledOnce();
    const opts = ensurePeerReachable.mock.calls[0]?.[2] as {
      dialHints?: string[];
      signal?: AbortSignal;
    };
    expect(opts.dialHints).toHaveLength(2);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts hung ephemeral LAN-only warm when budget elapses", async () => {
    let phase1Signal: AbortSignal | undefined;
    let calls = 0;
    const mesh = {
      ensurePeerReachable: vi.fn((_peer: string, _proto: string, opts?: { signal?: AbortSignal }) => {
        calls += 1;
        if (calls === 1) {
          phase1Signal = opts?.signal;
          return new Promise((resolve) => {
            opts?.signal?.addEventListener(
              "abort",
              () => resolve({ connected: false, direct: false }),
              { once: true },
            );
          });
        }
        return Promise.resolve({ connected: false, direct: false });
      }),
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    const started = Date.now();
    const result = await ensureReachableWithLanFirstBudget({
      mesh,
      transportPeerId: "12D3KooWPeer",
      protocol: "/envoymesh/chat/0.1.0",
      // No circuits → dedicated ephemeral LAN-only phase.
      dialHints: ["/ip4/10.0.0.2/tcp/57944/p2p/12D3KooWPeer"],
      sameSubnetLanFirst: true,
    });
    const elapsed = Date.now() - started;

    expect(result).toEqual({ connected: false, direct: false });
    expect(phase1Signal?.aborted).toBe(true);
    expect(calls).toBe(2);
    expect(elapsed).toBeLessThan(WARM_CONTACT_SAME_SUBNET_EPHEMERAL_BUDGET_MS + 1_500);
  });

  it("stable LAN still gets a LAN-only phase before circuits", async () => {
    const ensurePeerReachable = vi
      .fn()
      .mockResolvedValueOnce({ connected: false, direct: false })
      .mockResolvedValueOnce({ connected: true, direct: false });
    const mesh = {
      ensurePeerReachable,
      getPeerConnectionInfo: vi.fn().mockReturnValue({ connected: false, direct: false }),
    };

    const result = await ensureReachableWithLanFirstBudget({
      mesh,
      transportPeerId: "12D3KooWPeer",
      protocol: "/envoymesh/chat/0.1.0",
      dialHints: [
        "/ip4/10.0.0.2/tcp/4011/p2p/12D3KooWPeer",
        "/ip4/1.2.3.4/tcp/4001/p2p/12Relay/p2p-circuit/p2p/12D3KooWPeer",
      ],
      sameSubnetLanFirst: true,
    });

    expect(result).toEqual({ connected: true, direct: false });
    expect(ensurePeerReachable).toHaveBeenCalledTimes(2);
    expect(ensurePeerReachable.mock.calls[0]?.[2]).toMatchObject({
      dialHints: ["/ip4/10.0.0.2/tcp/4011/p2p/12D3KooWPeer"],
    });
  });
});
