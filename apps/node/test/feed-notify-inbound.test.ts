import { createLocalPeerDirectoryStore, createLocalTaskStore, createLocalTrustStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundFeedNotify } from "../src/feed-notify-inbound.js";
import { loadFeedNotifyInbox } from "../src/feed-notify-store.js";

let profileDir: string;
let taskStore: ReturnType<typeof createLocalTaskStore>;
let trustStore: ReturnType<typeof createLocalTrustStore>;
let peerDirectoryStore: ReturnType<typeof createLocalPeerDirectoryStore>;

const PUBLISHER = "envoy:owner:publisher01";

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "feed-notify-"));
  taskStore = createLocalTaskStore(profileDir);
  trustStore = createLocalTrustStore(profileDir);
  peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
  await trustStore.setTrustRecord({
    peerOwnerId: PUBLISHER,
    level: "direct",
    displayName: "Publisher",
  });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function makeEnvelope(overrides?: { tags?: string[]; publisherOwnerId?: string }) {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "envoy_senderpeer",
      senderPublicKey: "-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----",
      senderRole: "human",
      recipientRole: "human",
      intent: "feed.notify",
      payload: {
        publisherOwnerId: overrides?.publisherOwnerId ?? PUBLISHER,
        publishedAt: "2026-07-20T12:00:00.000Z",
        title: "New post",
        url: `envoy://${PUBLISHER}/notes/new.md`,
        kind: "note",
        visibility: "bonded",
        tags: overrides?.tags,
      },
    }),
    signature: "signature",
  };
}

describe("handleInboundFeedNotify", () => {
  it("stores and emits for bonded publisher", async () => {
    const emitted: unknown[] = [];
    const result = await handleInboundFeedNotify({
      envelope: makeEnvelope(),
      profileDir,
      remotePeerId: "12D3KooWtestpeer",
      trustStore,
      peerDirectoryStore,
      taskStore,
      emit: (item) => emitted.push(item),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.item.title).toBe("New post");
    expect(emitted).toHaveLength(1);
    const inbox = await loadFeedNotifyInbox(profileDir);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.url).toContain("/notes/new.md");
  });

  it("denies public strangers", async () => {
    await trustStore.setTrustRecord({
      peerOwnerId: PUBLISHER,
      level: "public",
      displayName: "Publisher",
    });
    const result = await handleInboundFeedNotify({
      envelope: makeEnvelope(),
      profileDir,
      remotePeerId: "12D3KooWtestpeer",
      trustStore,
      peerDirectoryStore,
      taskStore,
    });
    expect(result.ok).toBe(false);
  });

  it("skips when interest overlap fails", async () => {
    const result = await handleInboundFeedNotify({
      envelope: makeEnvelope({ tags: ["music"] }),
      profileDir,
      remotePeerId: "12D3KooWtestpeer",
      trustStore,
      peerDirectoryStore,
      taskStore,
      localInterests: ["cooking"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.skipped).toBe(true);
  });
});
