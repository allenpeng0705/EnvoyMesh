import { describe, expect, it } from "vitest";
import { EnvoyMesh } from "../src/index.js";

describe("EnvoyMesh connectivity options", () => {
  it("reports enabled local and wide-area connectivity features", () => {
    const mesh = new EnvoyMesh({
      enableMdns: true,
      enableDht: true,
      bootstrapPeers: ["/ip4/127.0.0.1/tcp/4001/p2p/peer-a"],
      enableRelay: true,
      enableRelayServer: true,
      enableAutoNat: true,
      enableDcutr: true,
      enableP2pDebug: true,
    });

    expect(mesh.enabledFeatures).toEqual([
      "mdns",
      "bootstrap",
      "dht",
      "relay-transport",
      "relay-server",
      "autonat",
      "dcutr",
      "p2p-debug",
    ]);
  });

  it("keeps mDNS disabled when requested", () => {
    const mesh = new EnvoyMesh({
      enableMdns: false,
      enableDht: true,
    });

    expect(mesh.enabledFeatures).toEqual(["dht"]);
  });
});
