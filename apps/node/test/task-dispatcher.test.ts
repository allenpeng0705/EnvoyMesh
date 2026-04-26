import {
  createReport,
  createReportCreatePayload,
  createTaskCancelPayload,
  createTaskMandatePayload,
  createTaskProposePayload,
  createUnsignedEnvelope,
  createUnsignedMandate,
  type EnvoyEnvelope,
  type EnvoyIntent,
  type Mandate,
  type ProofOfIntent,
} from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { createTaskDispatcher } from "../src/task-dispatcher.js";

describe("task dispatcher", () => {
  it("ignores non-A2A task intents", async () => {
    const dispatcher = createTaskDispatcher();

    const decision = await dispatcher.dispatch(envelope("system.ping", { nonce: "nonce-1" }));

    expect(decision).toEqual({
      action: "ignored",
      intent: "system.ping",
      reason: "not an A2A task intent",
    });
  });

  it("routes task.mandate into a mandate-attached journal decision", async () => {
    const dispatcher = createTaskDispatcher();
    const mandate = testMandate();

    const decision = await dispatcher.dispatch(
      envelope("task.mandate", createTaskMandatePayload(mandate, { taskId: "task-1" })),
    );

    expect(decision.action).toBe("handled");
    if (decision.action !== "handled") {
      return;
    }
    expect(decision.taskId).toBe("task-1");
    expect(decision.mandateId).toBe(mandate.mandateId);
    expect(decision.state).toBe("created");
    expect(decision.journalEntry.eventType).toBe("mandate_attached");
  });

  it("routes task proposals through a custom handler with parsed payload", async () => {
    const dispatcher = createTaskDispatcher({
      "task.propose": ({ payload, defaultDecision }) => ({
        ...defaultDecision,
        journalEntry: {
          ...defaultDecision.journalEntry,
          summary: `custom:${payload.requestedResult}`,
        },
      }),
    });

    const decision = await dispatcher.dispatch(
      envelope(
        "task.propose",
        createTaskProposePayload({
          taskId: "task-1",
          mandateId: "mandate-1",
          proofOfIntent: testProofOfIntent("task.propose"),
          objective: "Find a book.",
          requestedResult: "One recommendation.",
        }),
      ),
    );

    expect(decision.action).toBe("handled");
    if (decision.action !== "handled") {
      return;
    }
    expect(decision.state).toBe("negotiating");
    expect(decision.journalEntry.summary).toBe("custom:One recommendation.");
  });

  it("routes cancellation and report creation into terminal journal decisions", async () => {
    const dispatcher = createTaskDispatcher();
    const cancelDecision = await dispatcher.dispatch(
      envelope(
        "task.cancel",
        createTaskCancelPayload({
          taskId: "task-1",
          mandateId: "mandate-1",
          reason: "Owner stopped the task.",
          cancelledBy: "owner",
          createdAt: "2026-04-27T10:04:00.000Z",
        }),
      ),
    );
    const report = createReport({
      taskId: "task-1",
      mandateId: "mandate-1",
      ownerId: "envoy:owner:alice",
      status: "completed",
      mode: "brief",
      summary: "Finished the book search.",
      createdAt: "2026-04-27T11:00:00.000Z",
    });
    const reportDecision = await dispatcher.dispatch(
      envelope("report.create", createReportCreatePayload(report)),
    );

    expect(cancelDecision.action).toBe("handled");
    if (cancelDecision.action === "handled") {
      expect(cancelDecision.state).toBe("cancelled");
      expect(cancelDecision.journalEntry.eventType).toBe("cancelled");
    }
    expect(reportDecision.action).toBe("handled");
    if (reportDecision.action === "handled") {
      expect(reportDecision.state).toBe("completed");
      expect(reportDecision.journalEntry.eventType).toBe("report_created");
    }
  });

  it("rejects malformed A2A task payloads", async () => {
    const dispatcher = createTaskDispatcher();

    const decision = await dispatcher.dispatch(envelope("task.propose", { taskId: "task-1" }));

    expect(decision.action).toBe("rejected");
    if (decision.action === "rejected") {
      expect(decision.reason).toContain("invalid task.propose payload");
    }
  });
});

function envelope(intent: EnvoyIntent, payload: unknown): EnvoyEnvelope {
  return {
    ...createUnsignedEnvelope({
      senderPeerId: "peer-a",
      senderPublicKey: "public-key",
      intent,
      payload,
      createdAt: "2026-04-27T10:00:00.000Z",
      messageId: "message-1",
    }),
    signature: "signature",
  };
}

function testMandate(): Mandate {
  return {
    ...createUnsignedMandate({
      ownerId: "envoy:owner:alice",
      issuedToDeviceId: "envoy:device:desktop",
      taskIntent: "find.book",
      objective: "Find a useful distributed systems book.",
      expiresAt: "2026-04-27T10:00:00.000Z",
      mandateId: "mandate-1",
    }),
    signature: "signature",
  };
}

function testProofOfIntent(requestIntent: EnvoyIntent): ProofOfIntent {
  return {
    version: "0.1",
    mandateId: "mandate-1",
    mandateHash: "hash-1",
    taskId: "task-1",
    requestIntent,
    nonce: "nonce-1",
    deviceId: "envoy:device:desktop",
    proof: "signature",
  };
}
