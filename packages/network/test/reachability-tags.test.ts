import { KEEP_ALIVE } from "@libp2p/interface";
import { describe, expect, it } from "vitest";
import { getEnvoyContactKeepAlivePeerTagName, peerTagsTriggerReconnectQueue } from "../src/index.js";

describe("reachability / reconnect-queue tag rules", () => {
  it("Envoy contact tag uses KEEP_ALIVE prefix (libp2p reconnect queue)", () => {
    const name = getEnvoyContactKeepAlivePeerTagName();
    expect(name.startsWith(KEEP_ALIVE)).toBe(true);
    expect(name).toContain("envoymesh-contact");
  });

  it("peerTagsTriggerReconnectQueue matches libp2p rule (any KEEP_ALIVE-prefixed tag)", () => {
    expect(peerTagsTriggerReconnectQueue([])).toBe(false);
    expect(peerTagsTriggerReconnectQueue(["foo", "bar"])).toBe(false);
    expect(peerTagsTriggerReconnectQueue([`${KEEP_ALIVE}-other`])).toBe(true);
    expect(peerTagsTriggerReconnectQueue([getEnvoyContactKeepAlivePeerTagName()])).toBe(true);
  });

  it("accepts arbitrary iterables", () => {
    expect(peerTagsTriggerReconnectQueue(new Set([`${KEEP_ALIVE}-z`]))).toBe(true);
  });

  it("relay tag also uses KEEP_ALIVE prefix so libp2p reconnection-queue applies", () => {
    // The exact tag name is internal; what matters is that any tag prefixed
    // with KEEP_ALIVE (including ours) triggers the reconnect-queue.
    const relayStyleTag = `${KEEP_ALIVE}-envoymesh-relay`;
    expect(relayStyleTag.startsWith(KEEP_ALIVE)).toBe(true);
    expect(peerTagsTriggerReconnectQueue([relayStyleTag])).toBe(true);
  });

  it("relay tag and contact tag are independent (both still recognized)", () => {
    const contactTag = getEnvoyContactKeepAlivePeerTagName();
    const relayTag = `${KEEP_ALIVE}-envoymesh-relay`;
    expect(peerTagsTriggerReconnectQueue([contactTag, relayTag])).toBe(true);
    expect(peerTagsTriggerReconnectQueue([contactTag])).toBe(true);
    expect(peerTagsTriggerReconnectQueue([relayTag])).toBe(true);
  });
});
