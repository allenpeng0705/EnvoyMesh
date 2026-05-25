import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CHAT_MESSAGES_FILE,
  createLocalChatLogStore,
  type ChatLogEnvelope,
} from "../src/chat-log-store.js";

const sample = (suffix: number): ChatLogEnvelope => ({
  messageId: `m-${suffix}`,
  sender: { nodeId: "12D3Koo...", displayName: "A", ownerId: "envoy:owner:x" },
  recipient: { nodeId: "12D3KooYYY", displayName: "B", ownerId: "envoy:owner:y" },
  content: { text: `hello ${suffix}` },
  metadata: { timestamp: new Date(2026, 0, suffix).toISOString(), deliveryReceipt: "delivered" },
  signature: "sig",
});

describe("createLocalChatLogStore", () => {
  it("filters listThread by peer owner id", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-chat-"));
    const store = createLocalChatLogStore(dir);
    await store.append("envoy:owner:alice", sample(1));
    await store.append("envoy:owner:bob", sample(2));
    const alice = await store.listThread("envoy:owner:alice");
    expect(alice).toHaveLength(1);
    expect(alice[0].messageId).toBe("m-1");

    const raw = await readFile(join(dir, CHAT_MESSAGES_FILE), "utf8");
    expect(raw.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("deletes one message and clears a thread", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-chat-"));
    const store = createLocalChatLogStore(dir);
    await store.append("envoy:owner:alice", sample(1));
    await store.append("envoy:owner:alice", sample(2));
    await store.append("envoy:owner:bob", sample(3));

    expect(await store.deleteMessage("envoy:owner:alice", "m-1")).toBe(true);
    expect(await store.deleteMessage("envoy:owner:alice", "missing")).toBe(false);
    expect((await store.listThread("envoy:owner:alice")).map((m) => m.messageId)).toEqual(["m-2"]);

    expect(await store.clearThread("envoy:owner:alice")).toBe(1);
    expect(await store.listThread("envoy:owner:alice")).toEqual([]);
    expect((await store.listThread("envoy:owner:bob")).map((m) => m.messageId)).toEqual(["m-3"]);
  });
});
