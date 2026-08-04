import { describe, expect, it, vi } from "vitest";
import {
  bondDialTimeoutMs,
  bondTrace,
  BOND_DEFAULT_DIAL_TIMEOUT_MS,
  BOND_LAN_OR_PRIVATE_HOP_DIAL_TIMEOUT_MS,
  BOND_PUBLIC_CIRCUIT_DIAL_TIMEOUT_MS,
  classifyBondDialTarget,
} from "../src/bond-trace.js";

describe("bond-trace", () => {
  it("classifies public vs private circuit dial targets", () => {
    expect(
      classifyBondDialTarget(
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer",
      ),
    ).toBe("public-circuit");
    expect(
      classifyBondDialTarget(
        "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWPeer",
      ),
    ).toBe("private-circuit");
    expect(classifyBondDialTarget("/ip4/192.168.1.10/tcp/4011/p2p/12D3KooWPeer")).toBe("lan");
  });

  it("uses a longer timeout for bond.request public-circuit dials", () => {
    expect(bondDialTimeoutMs("public-circuit", true)).toBe(BOND_PUBLIC_CIRCUIT_DIAL_TIMEOUT_MS);
    expect(bondDialTimeoutMs("public-circuit", false)).toBe(BOND_DEFAULT_DIAL_TIMEOUT_MS);
    expect(bondDialTimeoutMs("private-circuit", true)).toBe(BOND_LAN_OR_PRIVATE_HOP_DIAL_TIMEOUT_MS);
    expect(bondDialTimeoutMs("lan", true)).toBe(BOND_LAN_OR_PRIVATE_HOP_DIAL_TIMEOUT_MS);
    expect(BOND_PUBLIC_CIRCUIT_DIAL_TIMEOUT_MS).toBeGreaterThanOrEqual(45_000);
  });

  it("emits grep-friendly step lines", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    bondTrace(2, "PASS", "have public circuit", { publicCircuits: 1 });
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[bond-trace\] step=2\/4 name=sponsor-circuit status=PASS have public circuit publicCircuits=1$/,
      ),
    );
    spy.mockRestore();
  });
});
