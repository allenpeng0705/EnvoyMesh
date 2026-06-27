import { describe, expect, it } from "vitest";
import {
  lanListenAddrsForPresence,
  LAN_BONDED_PRESENCE_PORT,
  startLanBondedPresence,
} from "../src/lan-bonded-presence.js";
import dgram from "node:dgram";

describe("lan-bonded-presence", () => {
  it("extracts private LAN tcp/0 listen addrs", () => {
    const peerId = "12D3KooWMacPeerIdExample";
    const addrs = lanListenAddrsForPresence(peerId, [
      `/ip4/192.168.3.85/tcp/60034/p2p/${peerId}`,
      `/ip4/127.0.0.1/tcp/60034/p2p/${peerId}`,
      `/ip4/106.37.112.84/tcp/4001/p2p/${peerId}`,
    ]);
    expect(addrs).toEqual([`/ip4/192.168.3.85/tcp/60034/p2p/${peerId}`]);
  });

  it("delivers bonded peer listen addrs over UDP", async () => {
    const peerId = "12D3KooWRemotePeerExample";
    const ownerId = "envoy:owner:remote";
    const listenAddr = `/ip4/192.168.3.78/tcp/56858/p2p/${peerId}`;
    let received: string[] | undefined;

    const stop = startLanBondedPresence({
      getOwnPresence: () => undefined,
      isBondedPeer: async () => true,
      onPeerListenAddrs: (id, addrs) => {
        if (id === peerId) {
          received = addrs;
        }
      },
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    const sender = dgram.createSocket("udp4");
    await new Promise<void>((resolve, reject) => {
      sender.send(
        Buffer.from(
          JSON.stringify({
            v: 1,
            peerId,
            ownerId,
            listenAddrs: [listenAddr],
            sentAt: new Date().toISOString(),
          }),
        ),
        LAN_BONDED_PRESENCE_PORT,
        "127.0.0.1",
        (err) => (err ? reject(err) : resolve()),
      );
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    sender.close();
    stop();

    expect(received).toEqual([listenAddr]);
  });
});
