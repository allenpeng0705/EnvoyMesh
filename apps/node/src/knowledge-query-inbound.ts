import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import { parseKnowledgeQueryPayload, type EnvoyEnvelope } from "@envoymesh/protocol";
import { ZodError } from "zod";

export async function handleInboundKnowledgeQuery(input: {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const payload = parseKnowledgeQueryPayload(input.envelope.payload);
    const preview =
      payload.query.length > 120 ? `${payload.query.slice(0, 117)}...` : payload.query;

    await input.taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: input.envelope.intent,
        messageId: input.envelope.messageId,
        correlationId: input.correlationId,
        remotePeerId: input.remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - input.receivedAt,
        outcome: "allow",
        summary: `mock knowledge.query handled: ${preview}`,
        createdAt: input.envelope.createdAt,
      }),
    );

    const sens = payload.requestedSensitivity ? ` sensitivity=${payload.requestedSensitivity}` : "";
    console.log(
      `[mock knowledge.query] from ${input.envelope.senderPeerId} via ${input.remotePeerId}: ${preview}${sens}`,
    );
    return { ok: true };
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
        : "invalid knowledge.query payload";
    return { ok: false, reason };
  }
}
