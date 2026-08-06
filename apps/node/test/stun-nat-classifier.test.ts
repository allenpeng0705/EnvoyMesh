/**
 * NAT-type classifier + definitive CGNAT detection unit tests.
 *
 * These are pure-function tests over `classifyNatFromStunResults` and
 * `classifyCgnat` — no network round-trips. The network-dependent
 * `detectNatType` (which calls real STUN servers) is covered by an
 * integration smoke test elsewhere.
 *
 * See docs/connectivity-internals-and-design.md Open Question #1.
 */
import { describe, expect, it } from "vitest";
import {
  classifyCgnat,
  classifyNatFromStunResults,
  isCgnatRangeIp,
  isRfc1918PrivateIp,
  type StunResult,
} from "../src/stun.js";

describe("classifyNatFromStunResults", () => {
  it("returns 'symmetric' when two servers see different mapped addresses", () => {
    const a: StunResult = { ip: "203.0.113.5", port: 4001 };
    const b: StunResult = { ip: "203.0.113.5", port: 50222 }; // different port
    expect(classifyNatFromStunResults(a, b)).toBe("symmetric");

    const c: StunResult = { ip: "203.0.113.9", port: 4001 }; // different IP
    expect(classifyNatFromStunResults(a, c)).toBe("symmetric");
  });

  it("returns 'full-cone' when both servers see the same public mapping", () => {
    const a: StunResult = { ip: "203.0.113.5", port: 4001 };
    const b: StunResult = { ip: "203.0.113.5", port: 4001 };
    expect(classifyNatFromStunResults(a, b)).toBe("full-cone");
  });

  it("returns 'open' when the mapping matches a local interface IP (no NAT)", () => {
    const local = "203.0.113.5"; // imagine a directly-assigned public IP
    const a: StunResult = { ip: local, port: 4001 };
    const b: StunResult = { ip: local, port: 4001 };
    expect(classifyNatFromStunResults(a, b, [local])).toBe("open");
  });

  it("returns 'unknown' when both STUN queries fail", () => {
    expect(classifyNatFromStunResults(null, null)).toBe("unknown");
  });

  it("returns 'unknown' when only one STUN server responds", () => {
    const a: StunResult = { ip: "203.0.113.5", port: 4001 };
    expect(classifyNatFromStunResults(a, null)).toBe("unknown");
    expect(classifyNatFromStunResults(null, a)).toBe("unknown");
  });
});

describe("isCgnatRangeIp (RFC 6598)", () => {
  it("matches 100.64.0.0/10", () => {
    expect(isCgnatRangeIp("100.64.0.1")).toBe(true);
    expect(isCgnatRangeIp("100.100.50.50")).toBe(true);
    expect(isCgnatRangeIp("100.127.255.255")).toBe(true);
  });
  it("rejects addresses just outside the range", () => {
    expect(isCgnatRangeIp("100.63.255.255")).toBe(false);
    expect(isCgnatRangeIp("100.128.0.1")).toBe(false);
    expect(isCgnatRangeIp("99.64.0.1")).toBe(false);
  });
  it("rejects non-CGNAT public IPs", () => {
    expect(isCgnatRangeIp("203.0.113.5")).toBe(false);
    expect(isCgnatRangeIp("8.8.8.8")).toBe(false);
  });
  it("rejects malformed input", () => {
    expect(isCgnatRangeIp("not-an-ip")).toBe(false);
    expect(isCgnatRangeIp("")).toBe(false);
  });
});

describe("isRfc1918PrivateIp", () => {
  it("matches 10/8, 172.16/12, 192.168/16", () => {
    expect(isRfc1918PrivateIp("10.0.0.1")).toBe(true);
    expect(isRfc1918PrivateIp("172.16.0.1")).toBe(true);
    expect(isRfc1918PrivateIp("172.31.255.255")).toBe(true);
    expect(isRfc1918PrivateIp("192.168.1.1")).toBe(true);
  });
  it("rejects 172.32+ (not in the /12)", () => {
    expect(isRfc1918PrivateIp("172.32.0.1")).toBe(false);
  });
  it("rejects public IPs", () => {
    expect(isRfc1918PrivateIp("8.8.8.8")).toBe(false);
    expect(isRfc1918PrivateIp("100.64.0.1")).toBe(false); // CGNAT, not RFC1918
  });
});

describe("classifyCgnat — definitive CGNAT detection", () => {
  it("returns 'cgnat' when NAT type is symmetric", () => {
    expect(classifyCgnat({ natType: "symmetric" })).toBe("cgnat");
  });

  it("returns 'cgnat' when STUN-observed IP is in the CGNAT range", () => {
    expect(classifyCgnat({ stunObservedIp: "100.64.5.5" })).toBe("cgnat");
  });

  it("returns 'cgnat' when UPnP external IP is RFC1918 private", () => {
    // Allen's case: UPnP gateway reports 192.168.1.6 as the "external" IP.
    expect(classifyCgnat({ upnpExternalIp: "192.168.1.6" })).toBe("cgnat");
    expect(classifyCgnat({ upnpExternalIp: "10.0.0.1" })).toBe("cgnat");
  });

  it("returns 'not-cgnat' for full-cone NAT with a routable public IP", () => {
    expect(
      classifyCgnat({ natType: "full-cone", stunObservedIp: "203.0.113.5" }),
    ).toBe("not-cgnat");
  });

  it("returns 'not-cgnat' for open NAT (no NAT, direct public IP)", () => {
    expect(classifyCgnat({ natType: "open" })).toBe("not-cgnat");
  });

  it("returns 'unknown' when signals are ambiguous (STUN failed, no UPnP)", () => {
    expect(classifyCgnat({})).toBe("unknown");
    expect(classifyCgnat({ natType: "unknown" })).toBe("unknown");
  });

  it("returns 'cgnat' even with conflicting signals (symmetric wins over a routable IP)", () => {
    // Symmetric NAT is definitive even if one STUN server happened to report a
    // routable IP — the two servers disagreed, which is the CGNAT signature.
    expect(
      classifyCgnat({ natType: "symmetric", stunObservedIp: "203.0.113.5" }),
    ).toBe("cgnat");
  });

  it("returns 'cgnat' when multiple definitive signals fire", () => {
    expect(
      classifyCgnat({
        natType: "symmetric",
        stunObservedIp: "100.64.0.1",
        upnpExternalIp: "192.168.1.6",
      }),
    ).toBe("cgnat");
  });
});
