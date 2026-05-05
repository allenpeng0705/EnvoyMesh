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
});
