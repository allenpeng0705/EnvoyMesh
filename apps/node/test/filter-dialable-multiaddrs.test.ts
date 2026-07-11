/**
 * Regression test for the dialable-multiaddr filter used by
 * `createWanJoinInviteViaRuntime` and the bundled-sponsor-friend path.
 *
 * Background: the bundled DMG shipped a contact URI with only private
 * LAN addresses (192.168.3.85:64589 + a relay circuit that doesn't
 * support circuit-relay-v2). The installer's node couldn't dial any of
 * them across the internet and the sponsor setup silently failed
 * forever. Root cause was `filterDialableMultiaddrs` keeping RFC1918
 * addresses. The fix is a mode parameter:
 *
 *   - `"wan-public"` (default for outbound invites) — strip RFC1918 +
 *     CGNAT + link-local. The bug class this guards against.
 *   - `"lan-paired"` — keep private addresses for explicit LAN flows
 *     (mobile pairing kiosk, local home pairing).
 *   - `"all"` — historical behavior, only strips loopback/unspecified.
 */
import { describe, expect, it } from "vitest";
import { filterDialableMultiaddrs } from "../src/node-service-wan.js";

describe("filterDialableMultiaddrs — wan-public mode", () => {
  it("strips RFC1918 private IPv4 (192.168.x, 10.x, 172.16-31.x)", () => {
    const addrs = [
      "/ip4/192.168.3.85/tcp/64589/p2p/12D3KooW",
      "/ip4/10.0.0.5/tcp/4001/p2p/12D3KooW",
      "/ip4/172.16.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/172.20.5.10/tcp/4001/p2p/12D3KooW",
      "/ip4/172.31.255.255/tcp/4001/p2p/12D3KooW",
      // Outside the 172.16/12 band — should be kept (public)
      "/ip4/172.15.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/172.32.0.1/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual([
      "/ip4/172.15.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/172.32.0.1/tcp/4001/p2p/12D3KooW",
    ]);
  });

  it("strips CGNAT 100.64-127.x (carrier-grade NAT, not dialable from outside)", () => {
    const addrs = [
      "/ip4/100.64.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/100.100.50.25/tcp/4001/p2p/12D3KooW",
      "/ip4/100.127.255.255/tcp/4001/p2p/12D3KooW",
      // Boundary cases — should be kept
      "/ip4/100.63.255.255/tcp/4001/p2p/12D3KooW",
      "/ip4/100.128.0.0/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual([
      "/ip4/100.63.255.255/tcp/4001/p2p/12D3KooW",
      "/ip4/100.128.0.0/tcp/4001/p2p/12D3KooW",
    ]);
  });

  it("strips link-local (169.254.x) and loopback (127.x, 0.0.0.0)", () => {
    const addrs = [
      "/ip4/169.254.1.1/tcp/4001/p2p/12D3KooW",
      "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/127.42.42.42/tcp/4001/p2p/12D3KooW",
      "/ip4/0.0.0.0/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual([]);
  });

  it("strips IPv6 loopback, link-local (fe80:), and unique-local (fc/fd:)", () => {
    const addrs = [
      "/ip6/::1/tcp/4001/p2p/12D3KooW",
      "/ip6/fe80::1/tcp/4001/p2p/12D3KooW",
      "/ip6/fc00::1/tcp/4001/p2p/12D3KooW",
      "/ip6/fd12:3456:789a::1/tcp/4001/p2p/12D3KooW",
      // Public IPv6 — kept
      "/ip6/2001:db8::1/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual([
      "/ip6/2001:db8::1/tcp/4001/p2p/12D3KooW",
    ]);
  });

  it("keeps public IPv4 addresses", () => {
    const addrs = [
      "/ip4/1.2.3.4/tcp/4001/p2p/12D3KooW",
      "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooW",
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual(addrs);
  });

  it("keeps relay-circuit addresses (the relay's public IP, not the sponsor's LAN)", () => {
    const addrs = [
      "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWSponsor",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual(addrs);
  });

  it("strips relay-circuit addresses built on top of a private IP", () => {
    // The relay-circuit in the broken DMG had a 192.168.x address as the
    // outer hop — the filter should still drop it because the outer hop
    // is unreachable.
    const addrs = [
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooWRelay/p2p-circuit/p2p/12D3KooWSponsor",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual([]);
  });

  it("keeps DNS hostnames (the dial layer fails later if they resolve to private IPs)", () => {
    const addrs = [
      "/dns4/relay.example.com/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual(addrs);
  });

  it("does not mutate the input array", () => {
    const addrs = [
      "/ip4/192.168.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooW",
    ];
    const snapshot = [...addrs];
    filterDialableMultiaddrs(addrs, "wan-public");
    expect(addrs).toEqual(snapshot);
  });

  it("caps the result at 8 addresses to bound the invite size", () => {
    const addrs = Array.from({ length: 20 }, (_, i) =>
      `/ip4/${i + 1}.2.3.4/tcp/4001/p2p/12D3KooW`,
    );
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toHaveLength(8);
  });

  it("skips empty / whitespace entries", () => {
    const addrs = ["", "  ", "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooW", "   "];
    expect(filterDialableMultiaddrs(addrs, "wan-public")).toEqual([
      "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooW",
    ]);
  });
});

describe("filterDialableMultiaddrs — lan-paired mode", () => {
  it("keeps RFC1918 addresses (LAN pairing flow needs them)", () => {
    const addrs = [
      "/ip4/192.168.3.85/tcp/64589/p2p/12D3KooW",
      "/ip4/10.0.0.5/tcp/4001/p2p/12D3KooW",
      "/ip4/172.16.0.1/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "lan-paired")).toEqual(addrs);
  });

  it("still strips loopback and unspecified in lan-paired mode", () => {
    const addrs = [
      "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/0.0.0.0/tcp/4001/p2p/12D3KooW",
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "lan-paired")).toEqual([
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooW",
    ]);
  });

  it("keeps CGNAT in lan-paired mode (the recipient may be on the same carrier)", () => {
    const addrs = [
      "/ip4/100.64.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "lan-paired")).toEqual(addrs);
  });
});

describe("filterDialableMultiaddrs — all mode (historical behavior)", () => {
  it("only strips loopback and unspecified, keeps everything else", () => {
    const addrs = [
      "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/0.0.0.0/tcp/4001/p2p/12D3KooW",
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooW",
      "/ip4/10.0.0.5/tcp/4001/p2p/12D3KooW",
      "/ip4/100.64.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs, "all")).toEqual([
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooW",
      "/ip4/10.0.0.5/tcp/4001/p2p/12D3KooW",
      "/ip4/100.64.0.1/tcp/4001/p2p/12D3KooW",
      "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooW",
    ]);
  });
});

describe("filterDialableMultiaddrs — default mode is wan-public", () => {
  it("treats the omitted-mode call the same as wan-public", () => {
    const addrs = [
      "/ip4/192.168.3.85/tcp/4001/p2p/12D3KooW",
      "/ip4/8.8.8.8/tcp/4001/p2p/12D3KooW",
    ];
    expect(filterDialableMultiaddrs(addrs)).toEqual(
      filterDialableMultiaddrs(addrs, "wan-public"),
    );
  });
});
