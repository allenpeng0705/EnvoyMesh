/** @vitest-environment node */
import { describe, expect, it, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import {
  createRelayCheckinPayload,
  createRelayLookupPayload,
  createRelayLookupResponsePayload,
  createUnsignedEnvelope,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_PUBLIC_KEY,
  RENDEZVOUS_RESPONSE_PLACEHOLDER_SIGNATURE,
} from "@envoymesh/protocol";
import { generateDeviceIdentity, signUnsignedEnvelope } from "@envoymesh/identity";
import { sendRelayCheckinOverWs, sendRelayLookupOverWs } from "../src/relay-ws-control-client.js";
import { createWsRelayRoster } from "../../relay/src/ws-relay-roster.js";
import { handleWsRelayControlEnvelope } from "../../relay/src/ws-relay-control.js";

describe("relay-ws-control-client", () => {
  let wss: WebSocketServer;
  let port = 0;
  const roster = createWsRelayRoster();
  const device = generateDeviceIdentity();
  const meshPeerId = "12D3KooWTestHomePeerIdExample";
  const meshMultiaddrs = [
    "/ip4/192.168.3.85/tcp/58239/p2p/12D3KooWTestHomePeerIdExample",
  ];

  afterEach(async () => {
    if (wss) {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
  });

  it("checkin + bonded lookup returns LAN listen addrs", async () => {
    wss = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => wss.on("listening", resolve));
    port = (wss.address() as AddressInfo).port;

    wss.on("connection", (ws) => {
      ws.on("message", (raw) => {
        const envelope = JSON.parse(String(raw)) as Record<string, unknown>;
        handleWsRelayControlEnvelope({
          ws,
          envelope,
          roster,
          relayPeerId: "12D3KooWRelayExample",
          meshMultiaddrs: ["/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWRelayExample"],
          advertiseAddrs: [],
        });
      });
    });

    const profile = {
      owner: { ownerId: "envoy:owner:test" },
      device: {
        publicKeyPem: device.publicKeyPem,
        privateKeyPem: device.privateKeyPem,
      },
      deviceCertificate: { capabilities: [] },
    } as const;

    const mesh = { peerId: meshPeerId, multiaddrs: meshMultiaddrs } as const;
    const relayWsUrl = `ws://127.0.0.1:${port}/ws`;

    await sendRelayCheckinOverWs({ relayWsUrl, mesh, profile });

    const lookup = createRelayLookupPayload({
      queryId: "q-test",
      targetOwnerId: "envoy:owner:remote",
      visibilityScope: "bonded",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    roster.checkin(
      createRelayCheckinPayload({
        peerId: "12D3KooWRemotePeerExample",
        ownerId: "envoy:owner:remote",
        relayReachableAddrs: ["/ip4/192.168.3.78/tcp/61316/p2p/12D3KooWRemotePeerExample"],
        capabilities: ["mesh.discovery"],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    );

    const response = await sendRelayLookupOverWs({
      relayWsUrl,
      profile,
      lookup,
    });
    expect(response.peers).toHaveLength(1);
    expect(response.peers[0]?.multiaddrs.some((a) => a.includes("192.168.3.78"))).toBe(true);
  });
});
