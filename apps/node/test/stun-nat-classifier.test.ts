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

describe("classifyCgnat — definitive CGNAT detection (false-positive hardened)", () => {
  // ── Pristine signal: trusted alone ────────────────────────────────────────
  it("returns 'cgnat' when STUN-observed IP is in the RFC 6598 CGNAT range (alone)", () => {
    expect(classifyCgnat({ stunObservedIp: "100.64.5.5" })).toBe("cgnat");
    expect(classifyCgnat({ stunObservedIp: "100.64.5.5", natType: "full-cone" })).toBe("cgnat");
  });

  it("returns 'unknown' when STUN 100.64 coincides with a local Tailscale NIC", () => {
    // Overlay VPN puts 100.64 on the local interface — not ISP CGNAT.
    expect(
      classifyCgnat({
        stunObservedIp: "100.64.5.5",
        localInterfaceIps: ["100.64.1.10", "192.168.1.20"],
      }),
    ).toBe("unknown");
  });

  it("returns 'unknown' for symmetric+UPnP when a VPN is active", () => {
    expect(
      classifyCgnat({
        natType: "symmetric",
        upnpExternalIp: "192.168.1.6",
        likelyVpnActive: true,
      }),
    ).toBe("unknown");
  });

  // ── Noisy signals: require corroboration ─────────────────────────────────
  it("returns 'unknown' for symmetric NAT ALONE (transient-IP / firewall false positive)", () => {
    // A lone symmetric signal could be a Wi-Fi↔cellular handoff or an
    // enterprise firewall intercepting STUN. Don't auto-apply on it alone.
    expect(classifyCgnat({ natType: "symmetric" })).toBe("unknown");
  });

  it("returns 'unknown' for UPnP-private ALONE (could be fixable double-NAT)", () => {
    // UPnP reporting 192.168.x could mean the outer router has a public IP and
    // port-forwarding would fix it — NOT CGNAT. Don't auto-apply on it alone.
    expect(classifyCgnat({ upnpExternalIp: "192.168.1.6" })).toBe("unknown");
    expect(classifyCgnat({ upnpExternalIp: "10.0.0.1" })).toBe("unknown");
  });

  it("returns 'cgnat' when symmetric NAT AND UPnP-private agree (corroboration)", () => {
    // Two independent noisy signals agreeing → high confidence. This is the
    // realistic CGNAT case: STUN sees per-destination mappings AND UPnP can't
    // reach a public IP.
    expect(
      classifyCgnat({ natType: "symmetric", upnpExternalIp: "192.168.1.6" }),
    ).toBe("cgnat");
  });

  // ── Negative signal ───────────────────────────────────────────────────────
  it("returns 'not-cgnat' for full-cone NAT with a routable public IP", () => {
    expect(
      classifyCgnat({ natType: "full-cone", stunObservedIp: "203.0.113.5" }),
    ).toBe("not-cgnat");
  });

  it("returns 'not-cgnat' for open NAT (no NAT, direct public IP)", () => {
    expect(classifyCgnat({ natType: "open" })).toBe("not-cgnat");
  });

  it("returns 'not-cgnat' when full-cone NAT coexists with a routable STUN IP", () => {
    // A healthy reading wins — even if UPnP mis-reports (buggy UPnP),
    // a confirmed full-cone NAT with a public IP means NOT CGNAT.
    expect(
      classifyCgnat({ natType: "full-cone", stunObservedIp: "203.0.113.5", upnpExternalIp: "192.168.1.6" }),
    ).toBe("not-cgnat");
  });

  // ── Ambiguous ─────────────────────────────────────────────────────────────
  it("returns 'unknown' when signals are ambiguous (STUN failed, no UPnP)", () => {
    expect(classifyCgnat({})).toBe("unknown");
    expect(classifyCgnat({ natType: "unknown" })).toBe("unknown");
  });

  // ── The pristine signal wins over a stale UPnP mis-report ─────────────────
  it("returns 'cgnat' when RFC 6598 range fires even if UPnP reports private", () => {
    expect(
      classifyCgnat({ stunObservedIp: "100.64.0.1", upnpExternalIp: "192.168.1.6" }),
    ).toBe("cgnat");
  });
});
