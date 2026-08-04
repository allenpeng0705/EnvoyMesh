/**
 * CLI/Tauri mesh path must wire relay.lookup deps onto NodeServiceImpl so
 * searchPeers can fall back to the relay roster when DHT is empty.
 */
import { describe, expect, it } from "vitest";
import type { RelayClientCycleDeps } from "../src/relay-client-cycle.js";

describe("bindExternalRelayClientCycle", () => {
  it("exposes deps for _queryRelayLookupByTopic after CLI bindExternalMesh", async () => {
    const { NodeServiceImpl } = await import("../src/node-service-impl.js");
    const ns = Object.create(NodeServiceImpl.prototype) as InstanceType<typeof NodeServiceImpl> & {
      _relayClientCycleDeps?: RelayClientCycleDeps;
      bindExternalRelayClientCycle(deps: RelayClientCycleDeps): void;
    };
    ns._relayClientCycleDeps = undefined;
    ns.bindExternalRelayClientCycle = NodeServiceImpl.prototype.bindExternalRelayClientCycle;

    expect(ns._relayClientCycleDeps).toBeUndefined();

    const deps = {
      mesh: {} as never,
      profile: {} as never,
      bootstrapPeers: [
        "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
      ],
      inboundGuard: {} as never,
      discoverySeedStore: {} as never,
    } satisfies RelayClientCycleDeps;

    ns.bindExternalRelayClientCycle(deps);
    expect(ns._relayClientCycleDeps).toBe(deps);
    expect(ns._relayClientCycleDeps?.bootstrapPeers).toHaveLength(1);
  });
});
