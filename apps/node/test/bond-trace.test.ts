import { describe, expect, it, vi } from "vitest";
import { bondTrace, classifyBondDialTarget } from "../src/bond-trace.js";

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
