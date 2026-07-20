import { describe, expect, it, vi } from "vitest";
import { sendFeedNotifyToBonds } from "../src/feed-notify-outbound.js";
import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/api";

vi.mock("../src/chat-outbound-deliver.js", () => ({
  sendEnvelopeWithRetry: vi.fn(async () => undefined),
}));

import { sendEnvelopeWithRetry } from "../src/chat-outbound-deliver.js";

function makeProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner: {
      ownerId: owner.ownerId,
      publicKeyPem: owner.publicKeyPem,
      privateKeyPem: owner.privateKeyPem,
    },
    device: {
      deviceId: device.deviceId,
      publicKeyPem: device.publicKeyPem,
      privateKeyPem: device.privateKeyPem,
    },
    deviceCertificate: {
      deviceId: device.deviceId,
      ownerId: owner.ownerId,
      deviceProfile: "primary",
      capabilities: ["message.send"],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      signature: "sig",
    },
  } as NodeProfile;
}

describe("sendFeedNotifyToBonds", () => {
  it("sends to eligible bond peers and tags reachability", async () => {
    const profile = makeProfile();
    const mesh = {
      sendEnvelope: vi.fn(),
      mergePeerStoreDialHints: vi.fn(async () => undefined),
      tagContactForPersistentReachability: vi.fn(async () => undefined),
    };
    const tagReachability = vi.fn();
    const result = await sendFeedNotifyToBonds({
      mesh: mesh as never,
      profile,
      meta: {
        publisherOwnerId: profile.owner.ownerId,
        publishedAt: new Date().toISOString(),
        title: "Post",
        url: `envoy://${profile.owner.ownerId}/a.md`,
        kind: "article",
        visibility: "bonded",
        tags: ["music"],
      },
      bonds: [
        { peerOwnerId: "envoy:owner:bob", level: "direct" },
        { peerOwnerId: "envoy:owner:stranger", level: "public" },
      ],
      resolveLibp2pPeer: async (ownerId) =>
        ownerId === "envoy:owner:bob"
          ? { peerId: "12D3KooWbobpeeridxxxxxxxxxxxxxxxxxxxx" }
          : undefined,
      dialHintsFor: async () => ["/ip4/127.0.0.1/tcp/4001"],
      tagReachability,
    });
    expect(result.attempted).toBe(1);
    expect(result.sent).toBe(1);
    expect(sendEnvelopeWithRetry).toHaveBeenCalledTimes(1);
    expect(tagReachability).toHaveBeenCalled();
    expect(mesh.tagContactForPersistentReachability).toHaveBeenCalled();
  });

  it("skips private posts", async () => {
    const profile = makeProfile();
    const result = await sendFeedNotifyToBonds({
      mesh: {
        sendEnvelope: vi.fn(),
        mergePeerStoreDialHints: vi.fn(),
        tagContactForPersistentReachability: vi.fn(),
      } as never,
      profile,
      meta: {
        publisherOwnerId: profile.owner.ownerId,
        publishedAt: new Date().toISOString(),
        title: "Secret",
        url: `envoy://${profile.owner.ownerId}/secret.md`,
        kind: "note",
        visibility: "private",
      },
      bonds: [{ peerOwnerId: "envoy:owner:bob", level: "direct" }],
      resolveLibp2pPeer: async () => ({ peerId: "12D3KooWbob" }),
      dialHintsFor: async () => [],
    });
    expect(result).toEqual({ attempted: 0, sent: 0 });
  });
});
