import { randomUUID } from "node:crypto";
import { parseTaskResultPayload, type EnvoyEnvelope } from "@envoymesh/protocol";
import {
  buildCommerceReceiptFromTaskResult,
  mapCommerceReceiptToActivity,
} from "@envoymesh/api";
import type { AgentActivityRecord, LocalAgentActivityStore } from "@envoymesh/local-store";
import type { CommerceReceiptStore } from "@envoymesh/local-store";

export async function recordCommerceReceiptFromTaskResult(input: {
  envelope: EnvoyEnvelope;
  receiptStore: CommerceReceiptStore;
  activityStore: LocalAgentActivityStore;
  emit?: (record: AgentActivityRecord) => void;
}): Promise<boolean> {
  if (input.envelope.intent !== "task.result") {
    return false;
  }

  let result;
  try {
    result = parseTaskResultPayload(input.envelope.payload);
  } catch {
    return false;
  }

  if (!result.deliveryAttestation) {
    return false;
  }

  const receipt = buildCommerceReceiptFromTaskResult({
    result,
    attestation: result.deliveryAttestation,
    receiptId: randomUUID(),
    direction: "inbound",
    messageId: input.envelope.messageId,
  });

  await input.receiptStore.append(receipt);
  const activity = mapCommerceReceiptToActivity(receipt, randomUUID());
  const saved = await input.activityStore.append(activity);
  input.emit?.(saved);
  return true;
}
