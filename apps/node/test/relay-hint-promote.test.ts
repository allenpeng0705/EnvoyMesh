import { describe, expect, it } from "vitest";
import { createVouchedRelayHintStore } from "../src/relay-hint-promote.js";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS,
} from "@envoymesh/api";

describe("createVouchedRelayHintStore", () => {
  const cn = DEFAULT_ENVOY_COMMUNITY_RELAY_PEER_IDS[0]!;
  const eu =
    "/dns4/eu.example.com/tcp/4001/p2p/12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU";

  it("ignores hints from non-preset peers", () => {
    const store = createVouchedRelayHintStore();
    store.noteFromPreset("12D3KooWRandomPeerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", [
      { relayId: "eu", multiaddrs: [eu], expiresAt: new Date().toISOString() },
    ]);
    expect(store.listAddrs()).toEqual([]);
  });

  it("accepts hints from community preset peer ids", () => {
    const store = createVouchedRelayHintStore();
    store.noteFromPreset(cn, [
      { relayId: "eu", multiaddrs: [eu], expiresAt: new Date().toISOString() },
    ]);
    expect(store.listAddrs()).toContain(eu);
  });
});
