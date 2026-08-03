import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALL_ICE_SERVERS,
  resolveCallIceServers,
  isPath2Call,
} from "../../src/lib/call-ice-servers.js";

describe("call-ice-servers", () => {
  it("uses invite ice servers when present", () => {
    const invite = [{ urls: "stun:stun.example.com:3478" }];
    expect(resolveCallIceServers(invite)).toEqual(invite);
  });

  it("falls back to node config then profile-aware defaults", () => {
    const node = [{ urls: "stun:node.example.com:3478" }];
    expect(resolveCallIceServers(undefined, node)).toEqual(node);
    // lan-fast / empty profile: no public STUN (blocked Google must not delay LAN calls)
    expect(resolveCallIceServers([], [], { discoveryProfile: "lan-fast" })).toEqual([]);
    expect(resolveCallIceServers(undefined, undefined, { discoveryProfile: "" })).toEqual([]);
    expect(resolveCallIceServers(undefined, undefined, { discoveryProfile: "wan-default" })).toEqual(
      DEFAULT_CALL_ICE_SERVERS,
    );
  });

  it("treats wan defaults as path2", () => {
    expect(isPath2Call([])).toBe(true);
    expect(isPath2Call(undefined)).toBe(true);
  });
});
