import { createLocalTaskStore } from "@envoymesh/local-store";
import { createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleInboundKnowledgeQuery } from "../src/knowledge-query-inbound.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-knowledge-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function knowledgeEnvelope(payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "public-key",
      intent: "knowledge.query",
      payload,
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "message-kq-1",
    }),
    signature: "signature",
  };
}

describe("handleInboundKnowledgeQuery", () => {
  it("writes audit and succeeds for valid payload", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope({ query: "What is EnvoyMesh?" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: "corr-1",
      taskStore,
    });

    expect(result).toEqual({ ok: true });
    const audits = await taskStore.readAuditEvents();
    expect(audits.some((a) => a.summary?.includes("mock knowledge.query handled"))).toBe(true);
  });

  it("returns failure for invalid payload", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const result = await handleInboundKnowledgeQuery({
      envelope: knowledgeEnvelope({ query: "" }),
      remotePeerId: "remote-libp2p",
      receivedAt: Date.now(),
      correlationId: undefined,
      taskStore,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason.length).toBeGreaterThan(0);
    }
    const audits = await taskStore.readAuditEvents();
    expect(audits.length).toBe(0);
  });
});
