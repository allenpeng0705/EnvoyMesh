/**
 * Phase 46 P2 — gated live / operator multi-relay E2E.
 *
 * Requires two deployed `apps/relay` instances that already seed each other
 * via mutual `--bootstrap` (miss-forward will not work against a single
 * community cn-relay).
 *
 *   TEST_RELAY_A=/ip4/.../tcp/.../p2p/... \
 *   TEST_RELAY_B=/ip4/.../tcp/.../p2p/... \
 *   npx vitest run apps/node/test/multi-relay-fleet-live-e2e.test.ts
 *
 * Or: ./scripts/multi-relay-fleet-live-signoff.sh
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  createChatMessagePayload,
  createUnsignedEnvelope,
  parseChatMessagePayload,
} from "@envoymesh/protocol";
import {
  createDeviceCertificate,
  derivePeerId,
  generateDeviceIdentity,
  generateIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import { EnvoyMesh } from "@envoymesh/network";
import { warmAndWatchRelayReservations } from "../src/relay-reservation-health.js";
import {
  checkinToRelay,
  lookupPeerOnRelay,
  peerIdFromMultiaddr,
  startRelayClient,
  waitFor,
} from "./helpers/multi-relay-fleet-client.js";

const RELAY_A = (process.env.TEST_RELAY_A ?? "").trim();
const RELAY_B = (process.env.TEST_RELAY_B ?? "").trim();
const LIVE_ENABLED = Boolean(RELAY_A && RELAY_B);

const meshes: EnvoyMesh[] = [];

describe.skipIf(!LIVE_ENABLED)("E2E Phase 46 live dual-relay fleet (TEST_RELAY_A + TEST_RELAY_B)", () => {
  afterEach(async () => {
    await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => undefined)));
  });

  it("rejects identical A/B (must be two distinct relays)", () => {
    expect(RELAY_A).not.toBe(RELAY_B);
    expect(peerIdFromMultiaddr(RELAY_A)).toBeTruthy();
    expect(peerIdFromMultiaddr(RELAY_B)).toBeTruthy();
    expect(peerIdFromMultiaddr(RELAY_A)).not.toBe(peerIdFromMultiaddr(RELAY_B));
  });

  it(
    "46B live: miss-forward + circuit dial across divergent presets",
    async () => {
      const relayBPeerId = peerIdFromMultiaddr(RELAY_B)!;

      const home = await startRelayClient(meshes);
      const joiner = await startRelayClient(meshes);
      const homeId = generateIdentity();
      const joinerId = generateIdentity();

      // Divergent presets: home only on B; joiner only on A.
      await warmAndWatchRelayReservations(
        home,
        { configuredRelays: [{ enabled: true, addr: RELAY_B }] },
        { healthIntervalMs: 20_000 },
      );
      await warmAndWatchRelayReservations(
        joiner,
        { configuredRelays: [{ enabled: true, addr: RELAY_A }] },
        { healthIntervalMs: 20_000 },
      );

      await waitFor(() => home.hasLiveRelayReservation() === true, 90_000, "home reserved on B");
      await waitFor(() => joiner.hasLiveRelayReservation() === true, 90_000, "joiner reserved on A");

      await checkinToRelay(home, RELAY_B, homeId);
      // Roster propagate / WAN RTT cushion.
      await new Promise((r) => setTimeout(r, 2_000));

      const miss = await lookupPeerOnRelay(joiner, RELAY_A, joinerId, home.peerId, 0, 30_000);
      expect(miss.peers.filter((p) => p.peerId === home.peerId)).toHaveLength(0);

      const hit = await lookupPeerOnRelay(joiner, RELAY_A, joinerId, home.peerId, 1, 45_000);
      const peer = hit.peers.find((p) => p.peerId === home.peerId);
      expect(peer).toBeTruthy();
      expect(peer!.hasHopSlot).not.toBe(false);
      expect(
        peer!.multiaddrs.some((m) => m.includes("/p2p-circuit/") && m.includes(relayBPeerId)),
      ).toBe(true);
      expect(peer!.viaRelayId).toBe(relayBPeerId);

      const circuit =
        peer!.multiaddrs.find((m) => m.includes("/p2p-circuit/") && m.includes(home.peerId)) ??
        peer!.multiaddrs.find((m) => m.includes("/p2p-circuit/"));
      expect(circuit).toBeTruthy();

      const received: string[] = [];
      home.onMessage(async ({ envelope }) => {
        if (!verifyInboundEnvelope(envelope)) return;
        if (envelope.intent !== "chat.message") return;
        received.push(parseChatMessagePayload(envelope.payload).text);
      });

      const owner = generateOwnerIdentity();
      const device = generateDeviceIdentity();
      createDeviceCertificate({
        owner,
        device,
        deviceProfile: "primary",
        capabilities: ["mesh.listen", "message.send"],
      });
      const chatPayload = createChatMessagePayload({
        senderOwnerId: owner.ownerId,
        text: "phase46-live-miss-forward",
      });
      const signed = signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: derivePeerId(device.publicKeyPem),
          senderPublicKey: device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: home.peerId,
          recipientRole: "human",
          intent: "chat.message",
          payload: chatPayload,
        }),
        device.privateKeyPem,
      );
      await joiner.send(circuit!, signed);
      await waitFor(() => received.length > 0, 60_000, "circuit chat delivered");
      expect(received[0]).toBe("phase46-live-miss-forward");
    },
    240_000,
  );
});
