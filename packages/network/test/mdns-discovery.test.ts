import { describe, expect, it, vi } from "vitest";
import { EnvoyMesh, type EnvoyMeshPeerDiscoveryService } from "../src/index.js";

describe("mDNS discovery over EnvoyMesh", () => {
  it("forwards libp2p peer discovery events to mesh subscribers", async () => {
    const mesh = new EnvoyMesh({ enableMdns: false });
    const source = new FakePeerDiscoverySource();
    const discovered = new Promise((resolve) => {
      mesh.onPeerDiscovered(resolve);
    });

    mesh.attachPeerDiscovery(source);
    source.emit("peer:discovery", {
      id: { toString: () => "peer-b" },
      multiaddrs: [{ toString: () => "/ip4/127.0.0.1/tcp/10000/p2p/peer-b" }],
    });

    await expect(discovered).resolves.toEqual({
      peerId: "peer-b",
      multiaddrs: ["/ip4/127.0.0.1/tcp/10000/p2p/peer-b"],
    });
  });

  it("holds empty-addrs discoveries and re-dispatches when the peer store gains addrs", async () => {
    const mesh = new EnvoyMesh({ enableMdns: false });
    const source = new FakePeerDiscoverySource();
    const discovered = vi.fn();
    mesh.onPeerDiscovered(discovered);

    mesh.attachPeerDiscovery(source);

    // First sighting carries no addresses — must NOT reach subscribers.
    source.emit("peer:discovery", { id: { toString: () => "peer-empty" } });
    expect(discovered).not.toHaveBeenCalled();

    // A silent peer-store update adding real addrs must re-dispatch the held peer.
    source.emit("peer:update", {
      peer: {
        id: { toString: () => "peer-empty" },
        addresses: [{ multiaddr: { toString: () => "/ip4/192.168.1.10/tcp/4001/p2p/peer-empty" } }],
      },
    });

    await vi.waitFor(() => {
      expect(discovered).toHaveBeenCalledWith({
        peerId: "peer-empty",
        multiaddrs: ["/ip4/192.168.1.10/tcp/4001/p2p/peer-empty"],
      });
    });
  });
});

class FakePeerDiscoverySource implements EnvoyMeshPeerDiscoveryService {
  private handlers: {
    "peer:discovery"?: (event: { detail: DiscoveryDetail }) => void;
    "peer:update"?: (event: { detail: PeerUpdateDetail }) => void;
  } = {
    "peer:discovery": undefined,
    "peer:update": undefined,
  };

  addEventListener(
    type: "peer:discovery",
    handler: (event: { detail: DiscoveryDetail }) => void,
  ): void;
  addEventListener(
    type: "peer:update",
    handler: (event: { detail: PeerUpdateDetail }) => void,
  ): void;
  addEventListener(
    type: "peer:discovery" | "peer:update",
    handler:
      | ((event: { detail: DiscoveryDetail }) => void)
      | ((event: { detail: PeerUpdateDetail }) => void),
  ): void {
    if (type === "peer:discovery") {
      this.handlers["peer:discovery"] = handler as (event: { detail: DiscoveryDetail }) => void;
    } else {
      this.handlers["peer:update"] = handler as (event: { detail: PeerUpdateDetail }) => void;
    }
  }

  emit(type: "peer:discovery", detail: DiscoveryDetail): void;
  emit(type: "peer:update", detail: PeerUpdateDetail): void;
  emit(
    type: "peer:discovery" | "peer:update",
    detail: DiscoveryDetail | PeerUpdateDetail,
  ): void {
    const handler = this.handlers[type];
    if (handler) {
      handler({ detail } as never);
    }
  }
}

type DiscoveryDetail = {
  id: { toString(): string };
  multiaddrs?: Array<{ toString(): string }>;
};

type PeerUpdateDetail = {
  peer: {
    id: { toString(): string };
    addresses?: Array<{ multiaddr?: { toString(): string } }>;
  };
};
