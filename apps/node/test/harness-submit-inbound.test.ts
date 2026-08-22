/**
 * v2.2 — worker-side `task.harness.submit.request` handler tests.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
  derivePeerId,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createTaskHarnessSubmitRequestPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type SignedAgentResult,
} from "@envoymesh/protocol";
import type { AgentAdapter } from "@envoymesh/agent-adapter";

import { handleInboundHarnessSubmitRequest } from "../src/harness-submit-inbound.js";

let keyPair: { privateKey: string; publicKey: string };
let WORKER_ID: string;

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  keyPair = {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKey: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
  WORKER_ID = derivePeerId(keyPair.publicKey);
});

function signedResult(correlationId: string): SignedAgentResult {
  return {
    skillId: "research",
    runtime: "envoy-harness",
    peerId: "envoy_agent_worker",
    correlationId,
    content: [{ kind: "text", text: "worker result" }],
    citations: [],
    metrics: { durationMs: 5, costUsd: 0.01 },
    completedAt: "2026-06-18T00:00:05.000Z",
    signature: "sig",
  };
}

function requestEnvelope(overrides: {
  payload?: unknown;
  correlationId?: string;
} = {}): EnvoyEnvelope {
  const correlationId = overrides.correlationId ?? "corr-submit-1";
  const payload =
    overrides.payload ??
    createTaskHarnessSubmitRequestPayload({
      skillId: "research",
      objective: "summarize the report",
      costCeilingUsd: 1.5,
      deadlineMs: 60_000,
      correlationId,
    });
  return signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: "envoy_agent_parent",
      senderPublicKey: keyPair.publicKey,
      senderRole: "agent",
      recipientPeerId: "envoy_agent_worker",
      recipientRole: "agent",
      intent: "task.harness.submit.request",
      payload,
      correlationId,
    }),
    keyPair.privateKey,
  );
}

function stubAdapter(overrides: Partial<AgentAdapter> = {}): AgentAdapter {
  return {
    runtime: "envoy-harness",
    describeSkills: () => [],
    buildManifest: async () => ({}) as never,
    execute: async (input) => signedResult(input.correlationId),
    verify: async () => [],
    ...overrides,
  };
}

describe("handleInboundHarnessSubmitRequest", () => {
  it("executes via the adapter and replies with the signed result", async () => {
    let received: ExecuteInputCapture | undefined;
    let reply: EnvoyEnvelope | undefined;
    const result = await handleInboundHarnessSubmitRequest({
      envelope: requestEnvelope(),
      replyWithEnvelope: async (e) => {
        reply = e;
      },
      agentPeerId: WORKER_ID,
      agentPublicKeyPem: keyPair.publicKey,
      agentPrivateKeyPem: keyPair.privateKey,
      getAdapter: () =>
        stubAdapter({
          execute: async (input) => {
            received = input as ExecuteInputCapture;
            return signedResult(input.correlationId);
          },
        }),
    });
    expect(result).toEqual({ ok: true, responded: true });
    expect(received?.objective).toBe("summarize the report");
    expect(received?.skillId).toBe("research");
    expect(received?.signal).toBeInstanceOf(AbortSignal);
    expect(reply?.intent).toBe("task.harness.submit.response");
    expect(reply?.correlationId).toBe("corr-submit-1");
    // The parent's transport verifies the reply envelope before trusting
    // it — assert the handler's reply actually passes that check.
    expect(reply === undefined ? false : verifyInboundEnvelope(reply)).toBe(true);
    const payload = reply?.payload as { ok: true; result: SignedAgentResult };
    expect(payload.ok).toBe(true);
    expect(payload.result.correlationId).toBe("corr-submit-1");
  });

  it("replies with a wire error when the adapter is unavailable", async () => {
    let reply: EnvoyEnvelope | undefined;
    const result = await handleInboundHarnessSubmitRequest({
      envelope: requestEnvelope(),
      replyWithEnvelope: async (e) => {
        reply = e;
      },
      agentPeerId: WORKER_ID,
      agentPublicKeyPem: keyPair.publicKey,
      agentPrivateKeyPem: keyPair.privateKey,
      getAdapter: () => undefined,
    });
    expect(result).toEqual({ ok: false, reason: "envoy_harness_unavailable" });
    expect((reply?.payload as { ok: false }).ok).toBe(false);
    expect((reply?.payload as { error: string }).error).toBe(
      "envoy_harness_unavailable",
    );
  });

  it("replies with a wire error when execution throws", async () => {
    let reply: EnvoyEnvelope | undefined;
    const result = await handleInboundHarnessSubmitRequest({
      envelope: requestEnvelope(),
      replyWithEnvelope: async (e) => {
        reply = e;
      },
      agentPeerId: WORKER_ID,
      agentPublicKeyPem: keyPair.publicKey,
      agentPrivateKeyPem: keyPair.privateKey,
      getAdapter: () =>
        stubAdapter({
          execute: async () => {
            throw new Error("model provider down");
          },
        }),
    });
    expect(result).toEqual({ ok: false, reason: "model provider down" });
    expect((reply?.payload as { error: string }).error).toBe(
      "model provider down",
    );
  });

  it("replies with a wire error on a malformed payload", async () => {
    let reply: EnvoyEnvelope | undefined;
    const result = await handleInboundHarnessSubmitRequest({
      envelope: requestEnvelope({ payload: { not: "a request" } }),
      replyWithEnvelope: async (e) => {
        reply = e;
      },
      agentPeerId: WORKER_ID,
      agentPublicKeyPem: keyPair.publicKey,
      agentPrivateKeyPem: keyPair.privateKey,
      getAdapter: () => stubAdapter(),
    });
    expect(result).toEqual({ ok: false, reason: "malformed_payload" });
    expect((reply?.payload as { error: string }).error).toBe("malformed_payload");
  });

  it("rejects non-request intents without executing", async () => {
    let executed = false;
    const envelope = requestEnvelope();
    const wrong = { ...envelope, intent: "task.harness.submit.response" };
    const result = await handleInboundHarnessSubmitRequest({
      envelope: wrong,
      agentPeerId: WORKER_ID,
      agentPublicKeyPem: keyPair.publicKey,
      agentPrivateKeyPem: keyPair.privateKey,
      getAdapter: () =>
        stubAdapter({
          execute: async () => {
            executed = true;
            return signedResult("x");
          },
        }),
    });
    expect(result).toEqual({ ok: false, reason: "wrong_intent" });
    expect(executed).toBe(false);
  });

  it("does not execute when there is no reply channel", async () => {
    let executed = false;
    const result = await handleInboundHarnessSubmitRequest({
      envelope: requestEnvelope(),
      agentPeerId: WORKER_ID,
      agentPublicKeyPem: keyPair.publicKey,
      agentPrivateKeyPem: keyPair.privateKey,
      getAdapter: () =>
        stubAdapter({
          execute: async () => {
            executed = true;
            return signedResult("x");
          },
        }),
    });
    expect(result).toEqual({ ok: false, reason: "no_reply_channel" });
    expect(executed).toBe(false);
  });
});

type ExecuteInputCapture = {
  skillId: string;
  objective: string;
  costCeilingUsd: number;
  deadlineMs: number;
  correlationId: string;
  signal: AbortSignal;
};
