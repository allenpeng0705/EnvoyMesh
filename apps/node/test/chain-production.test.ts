import { describe, expect, it } from "vitest";
import { derivePeerId } from "@envoymesh/identity";
import { generateKeyPairSync } from "node:crypto";
import {
  extractChainIdFromEnvelope,
  resolveChainTransportPeerId,
  sendChainEnvelopeOverMesh,
} from "../src/chain-production.js";

describe("chain-production", () => {
  it("extractChainIdFromEnvelope reads chainId from nested payloads", () => {
    expect(
      extractChainIdFromEnvelope({
        version: "0.1",
        messageId: "m1",
        createdAt: "2026-06-18T00:00:00.000Z",
        senderPeerId: "12D3KooW-s",
        senderPublicKey: "stub",
        senderRole: "agent",
        recipientPeerId: "12D3KooW-r",
        recipientRole: "agent",
        intent: "task.chain.bid",
        payload: {
          bid: {
            chainId: "chain_abc",
            subtaskId: "subtask_1",
          },
        },
        signature: "stub",
      }),
    ).toBe("chain_abc");
  });

  it("resolveChainTransportPeerId maps device peer id to libp2p transport peer", async () => {
    const { publicKey } = generateKeyPairSync("ed25519");
    const devicePublicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
    const devicePeerId = derivePeerId(devicePublicKeyPem);
    const transportPeerId = "12D3KooW-transport-peer";

    const resolved = await resolveChainTransportPeerId(
      {
        mesh: { peerId: "12D3KooW-self" } as never,
        peerDirectoryStore: {
          listPeerRecords: async () => [
            {
              ownerId: "envoy:owner:peer",
              peerId: transportPeerId,
              devicePublicKeyPem,
            },
          ],
          getPeerByOwnerId: async () => undefined,
        } as never,
      },
      devicePeerId,
    );

    expect(resolved).toBe(transportPeerId);
  });

  it("sendChainEnvelopeOverMesh loopbacks local agent instead of mesh self-dial", async () => {
    const delivered: string[] = [];
    const localAgent = "envoy_agent_local";
    const ok = await sendChainEnvelopeOverMesh(
      {
        mesh: {
          peerId: "12D3KooW-self",
          send: async () => {
            throw new Error("mesh.send must not run for local loopback");
          },
        } as never,
        peerDirectoryStore: {
          listPeerRecords: async () => [],
          getPeerByOwnerId: async () => undefined,
        } as never,
        localAgentPeerId: localAgent,
        deliverLocally: async (envelope) => {
          delivered.push(envelope.intent);
        },
      },
      localAgent,
      {
        version: "0.1",
        messageId: "m-local",
        createdAt: "2026-08-07T00:00:00.000Z",
        senderPeerId: localAgent,
        senderPublicKey: "stub",
        senderRole: "agent",
        recipientPeerId: localAgent,
        recipientRole: "agent",
        intent: "task.chain.propose",
        payload: {},
        signature: "stub",
      },
    );
    expect(ok).toBe(true);
    expect(delivered).toEqual(["task.chain.propose"]);
  });
});
