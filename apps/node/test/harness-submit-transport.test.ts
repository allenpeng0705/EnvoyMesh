/**
 * v2.2 — parent-side libp2p `RemoteSubmitterTransport` tests.
 *
 * `sendExpectReplyWithRetry` is mocked; everything else (resolution,
 * envelope signing/verification, payload mapping, abort) is real.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  derivePeerId,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createTaskHarnessSubmitResponsePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import type { ExecuteInput, SignedAgentResult } from "@envoymesh/agent-adapter";
import type { ChainTransportResolver } from "../src/chain-production.js";
import { sendExpectReplyWithRetry } from "../src/chat-outbound-deliver.js";
import { createLibp2pRemoteSubmitterTransport } from "../src/harness-submit-transport.js";

vi.mock("../src/chat-outbound-deliver.js", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../src/chat-outbound-deliver.js")
  >();
  return {
    ...actual,
    sendExpectReplyWithRetry: vi.fn(),
  };
});

let PARENT_ID: string;
let WORKER_ID: string;
let IMPOSTOR_ID: string;

let parentKey: { privateKey: string; publicKey: string };
let workerKey: { privateKey: string; publicKey: string };
let impostorKey: { privateKey: string; publicKey: string };

beforeAll(() => {
  const parent = generateKeyPairSync("ed25519");
  parentKey = {
    privateKey: parent.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: parent.publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
  const worker = generateKeyPairSync("ed25519");
  workerKey = {
    privateKey: worker.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: worker.publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
  const impostor = generateKeyPairSync("ed25519");
  impostorKey = {
    privateKey: impostor.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: impostor.publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
  PARENT_ID = derivePeerId(parentKey.publicKey);
  WORKER_ID = derivePeerId(workerKey.publicKey);
  IMPOSTOR_ID = derivePeerId(impostorKey.publicKey);
});

function signedResult(correlationId: string): SignedAgentResult {
  return {
    skillId: "research",
    runtime: "envoy-harness",
    peerId: WORKER_ID,
    correlationId,
    content: [{ kind: "text", text: "worker result" }],
    citations: [],
    metrics: { durationMs: 5, costUsd: 0.01 },
    completedAt: "2026-06-18T00:00:05.000Z",
    signature: "sig",
  };
}

function replyEnvelope(input: {
  payload?: unknown;
  intent?: string;
  correlationId?: string;
  signed?: boolean;
  sender?: { peerId: string; publicKey: string; privateKey: string };
} = {}): EnvoyEnvelope {
  const correlationId = input.correlationId ?? "corr";
  const sender = input.sender ?? {
    peerId: WORKER_ID,
    publicKey: workerKey.publicKey,
    privateKey: workerKey.privateKey,
  };
  const payload =
    input.payload ??
    createTaskHarnessSubmitResponsePayload({
      ok: true,
      result: signedResult(correlationId),
    });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: sender.peerId,
    senderPublicKey: sender.publicKey,
    senderRole: "agent",
    recipientPeerId: PARENT_ID,
    recipientRole: "agent",
    intent: input.intent ?? "task.harness.submit.response",
    payload,
    correlationId,
  });
  return input.signed === false
    ? (unsigned as EnvoyEnvelope)
    : signUnsignedEnvelope(unsigned, sender.privateKey);
}

function makeResolver(overrides: Partial<ChainTransportResolver> = {}): ChainTransportResolver {
  return {
    mesh: { peerId: PARENT_ID } as ChainTransportResolver["mesh"],
    peerDirectoryStore: {
      listPeerRecords: async () => [
        {
          version: "0.1",
          ownerId: "envoy:owner:worker",
          peerId: WORKER_ID,
          deviceId: "worker-device",
          lastSeenAt: "2026-06-18T00:00:00.000Z",
          listenAddrs: [],
        },
      ],
      getPeerByOwnerId: async () => undefined,
      getPeerByPeerId: async () => undefined,
    } as unknown as ChainTransportResolver["peerDirectoryStore"],
    ...overrides,
  };
}

const baseInput = {
  objective: "summarize the report",
  capabilityTag: "research",
  costCeilingUsd: 1,
  deadlineMs: 10_000,
};

/**
 * Mock the expect-reply round-trip with a reply envelope whose
 * correlationId echoes the request's (the transport generates it
 * internally, so tests cannot know it up front).
 */
function mockReply(
  overrides: Omit<NonNullable<Parameters<typeof replyEnvelope>[0]>, "correlationId"> = {},
): void {
  vi.mocked(sendExpectReplyWithRetry).mockImplementation(async (args) =>
    replyEnvelope({
      correlationId: args.envelope.correlationId ?? "corr",
      ...overrides,
    }),
  );
}

describe("createLibp2pRemoteSubmitterTransport", () => {
  beforeEach(() => {
    vi.mocked(sendExpectReplyWithRetry).mockReset();
  });

  it("sends a signed request and maps the verified result back", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    mockReply();

    const result = await transport.send(baseInput, WORKER_ID, new AbortController().signal);
    expect(result.status).toBe("completed");
    expect(result.workerPeerId).toBe(WORKER_ID);
    expect(result.workerRuntime).toBe("envoy-harness");
    expect(result.signature).toBe("sig");
    expect(result.content[0]).toMatchObject({ type: "text", text: "worker result" });

    const call = vi.mocked(sendExpectReplyWithRetry).mock.calls[0]?.[0];
    expect(call?.envelope.intent).toBe("task.harness.submit.request");
    expect(call?.envelope.recipientPeerId).toBe(WORKER_ID);
    expect(call?.transportPeerId).toBe(WORKER_ID);
    expect(verifyInboundEnvelope(call?.envelope as EnvoyEnvelope)).toBe(true);
    const reqPayload = call?.envelope.payload as {
      skillId: string;
      objective: string;
      deadlineMs: number;
    };
    expect(reqPayload.skillId).toBe("research");
    expect(reqPayload.objective).toBe("summarize the report");
    expect(reqPayload.deadlineMs).toBe(10_000);
  });

  it("throws the worker's wire error", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    mockReply({
      payload: createTaskHarnessSubmitResponsePayload({
        ok: false,
        error: "model provider down",
      }),
    });
    await expect(
      transport.send(baseInput, WORKER_ID, new AbortController().signal),
    ).rejects.toThrow(/worker error: model provider down/);
  });

  it("rejects an unexpected reply intent", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    mockReply({ intent: "task.chain.ready.response" });
    await expect(
      transport.send(baseInput, WORKER_ID, new AbortController().signal),
    ).rejects.toThrow(/unexpected reply intent/);
  });

  it("rejects a correlationId mismatch", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    mockReply({ correlationId: "different-corr" });
    await expect(
      transport.send(baseInput, WORKER_ID, new AbortController().signal),
    ).rejects.toThrow(/correlationId mismatch/);
  });

  it("rejects an unsigned reply (bad signature)", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    mockReply({ signed: false });
    await expect(
      transport.send(baseInput, WORKER_ID, new AbortController().signal),
    ).rejects.toThrow(/bad reply signature/);
  });

  it("rejects a reply from a different sender (impersonation)", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    mockReply({
      sender: {
        peerId: IMPOSTOR_ID,
        publicKey: impostorKey.publicKey,
        privateKey: impostorKey.privateKey,
      },
    });
    await expect(
      transport.send(baseInput, WORKER_ID, new AbortController().signal),
    ).rejects.toThrow(/sender mismatch/);
  });

  it("rejects a malformed reply payload", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    mockReply({ payload: { not: "a response" } });
    await expect(
      transport.send(baseInput, WORKER_ID, new AbortController().signal),
    ).rejects.toThrow(/malformed reply payload/);
  });

  it("honors a pre-aborted signal with AbortError", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      transport.send(baseInput, WORKER_ID, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sendExpectReplyWithRetry).not.toHaveBeenCalled();
  });

  it("throws when the target resolves to no transport peer", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    await expect(
      transport.send(baseInput, "unknown-peer", new AbortController().signal),
    ).rejects.toThrow(/no transport peer/);
  });

  it("executes locally for a self-target when executeLocally is wired", async () => {
    const executeLocally = vi.fn(async (input: ExecuteInput) =>
      signedResult(input.correlationId),
    );
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
      executeLocally,
    });
    const result = await transport.send(baseInput, PARENT_ID, new AbortController().signal);
    expect(executeLocally).toHaveBeenCalledTimes(1);
    expect(sendExpectReplyWithRetry).not.toHaveBeenCalled();
    expect(result.workerPeerId).toBe(WORKER_ID);
  });

  it("throws for a self-target without a local executor", async () => {
    const transport = createLibp2pRemoteSubmitterTransport({
      resolver: makeResolver(),
      parentAgentPeerId: PARENT_ID,
      parentAgentPublicKeyPem: parentKey.publicKey,
      parentAgentPrivateKeyPem: parentKey.privateKey,
    });
    await expect(
      transport.send(baseInput, PARENT_ID, new AbortController().signal),
    ).rejects.toThrow(/no executeLocally/);
  });
});
