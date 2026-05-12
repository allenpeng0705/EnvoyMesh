import { createUnsignedEnvelope } from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { evaluateInboundEnvelopeRolePolicy } from "../src/role-policy.js";

describe("role policy", () => {
  it("allows chat.message when at least one role is human", () => {
    // human ↔ human: allowed
    const humanToHuman = evaluateInboundEnvelopeRolePolicy(
      createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk-a",
        senderRole: "human",
        recipientPeerId: "peer-b",
        recipientRole: "human",
        intent: "chat.message",
        payload: { senderOwnerId: "envoy:owner:a", text: "hi" },
      }) as any,
    );
    expect(humanToHuman).toEqual({ ok: true });

    // agent → human: allowed (Phase 9A — AI assistant / bridge replies)
    const agentToHuman = evaluateInboundEnvelopeRolePolicy({
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk-a",
        senderRole: "human",
        recipientPeerId: "peer-b",
        recipientRole: "human",
        intent: "chat.message",
        payload: { senderOwnerId: "envoy:owner:a", text: "hi" },
      }),
      senderRole: "agent",
    } as any);
    expect(agentToHuman).toEqual({ ok: true });

    // human → agent: allowed (Phase 9A — human talking to AI/bridge)
    const humanToAgent = evaluateInboundEnvelopeRolePolicy({
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk-a",
        senderRole: "human",
        recipientPeerId: "peer-b",
        recipientRole: "human",
        intent: "chat.message",
        payload: { senderOwnerId: "envoy:owner:a", text: "hi" },
      }),
      recipientRole: "agent",
    } as any);
    expect(humanToAgent).toEqual({ ok: true });

    // agent → agent: NOT allowed (use A2A task intents instead)
    const agentToAgent = evaluateInboundEnvelopeRolePolicy({
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk-a",
        senderRole: "human",
        recipientPeerId: "peer-b",
        recipientRole: "human",
        intent: "chat.message",
        payload: { senderOwnerId: "envoy:owner:a", text: "hi" },
      }),
      senderRole: "agent",
      recipientRole: "agent",
    } as any);
    expect(agentToAgent).toEqual({
      ok: false,
      reason: "chat.message requires at least one human role (use A2A intents for agent-to-agent)",
    });
  });

  it("requires task/report intents to be agent-to-agent", () => {
    const accepted = evaluateInboundEnvelopeRolePolicy(
      createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk-a",
        senderRole: "agent",
        recipientPeerId: "peer-b",
        recipientRole: "agent",
        intent: "task.propose",
        payload: {
          taskId: "task-1",
          mandateId: "mandate-1",
          proofOfIntent: {
            version: "0.1",
            mandateId: "mandate-1",
            mandateHash: "hash-1",
            taskId: "task-1",
            requestIntent: "task.propose",
            nonce: "nonce",
            deviceId: "device",
            proof: "proof",
          },
          objective: "x",
          requestedResult: "y",
          constraints: [],
        },
      }) as any,
    );
    expect(accepted).toEqual({ ok: true });

    const rejectedSender = evaluateInboundEnvelopeRolePolicy({
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk-a",
        senderRole: "agent",
        recipientPeerId: "peer-b",
        recipientRole: "agent",
        intent: "task.cancel",
        payload: {
          taskId: "task-1",
          reason: "nope",
          cancelledBy: "owner",
          createdAt: new Date().toISOString(),
        },
      }),
      senderRole: "human",
    } as any);
    expect(rejectedSender).toEqual({
      ok: false,
      reason: "task.cancel requires senderRole=agent",
    });

    const rejectedRecipient = evaluateInboundEnvelopeRolePolicy({
      ...createUnsignedEnvelope({
        senderPeerId: "peer-a",
        senderPublicKey: "pk-a",
        senderRole: "agent",
        recipientPeerId: "peer-b",
        recipientRole: "agent",
        intent: "report.create",
        payload: {
          report: {
            version: "0.1",
            reportId: "report-1",
            taskId: "task-1",
            ownerId: "envoy:owner:a",
            status: "completed",
            mode: "brief",
            summary: "done",
            evidence: [],
            suggestedActions: [],
            createdAt: new Date().toISOString(),
          },
        },
      }),
      recipientRole: "human",
    } as any);
    expect(rejectedRecipient).toEqual({
      ok: false,
      reason: "report.create requires recipientRole=agent",
    });
  });
});
