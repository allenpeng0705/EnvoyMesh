import { describe, expect, it } from "vitest";
import { EnvoyMesh, type EnvoyMeshPeerDiscoveryService } from "../src/index.js";

describe("mDNS discovery over EnvoyMesh", () => {
  it("forwards libp2p peer discovery events to mesh subscribers", async () => {
    const mesh = new EnvoyMesh({ enableMdns: false });
    const source = new FakePeerDiscoverySource();
    const discovered = new Promise((resolve) => {
      mesh.onPeerDiscovered(resolve);
    });

    mesh.attachPeerDiscovery(source);
    source.emit({
      id: { toString: () => "peer-b" },
      multiaddrs: [{ toString: () => "/ip4/127.0.0.1/tcp/10000/p2p/peer-b" }],
    });

    await expect(discovered).resolves.toEqual({
      peerId: "peer-b",
      multiaddrs: ["/ip4/127.0.0.1/tcp/10000/p2p/peer-b"],
    });
  });
});

class FakePeerDiscoverySource implements EnvoyMeshPeerDiscoveryService {
  private handler?: Parameters<EnvoyMeshPeerDiscoveryService["addEventListener"]>[1];

  addEventListener(
    _type: "peer:discovery",
    handler: Parameters<EnvoyMeshPeerDiscoveryService["addEventListener"]>[1],
  ): void {
    this.handler = handler;
  }

  emit(detail: Parameters<Parameters<EnvoyMeshPeerDiscoveryService["addEventListener"]>[1]>[0]["detail"]): void {
    if (this.handler) {
      this.handler({ detail });
    }
  }
}
