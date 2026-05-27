/**
 * Story E receipt-only path — vault CID attestation linked to task.result (no payment rail).
 */

import type { CommerceDeliveryAttestation, TaskResultPayload } from "@envoymesh/protocol";
import type { AgentActivityRecord } from "./node-service.js";

export type { CommerceDeliveryAttestation };

export interface CommerceReceiptRecord {
  receiptId: string;
  taskId: string;
  mandateId?: string;
  counterpartyOwnerId: string;
  documentId: string;
  relativePath: string;
  contentHash: string;
  cid?: string;
  direction: "inbound" | "outbound";
  summary: string;
  messageId?: string;
  createdAt: string;
}

export interface RecordCommerceReceiptParams {
  taskId: string;
  mandateId?: string;
  counterpartyOwnerId: string;
  documentId: string;
  summary?: string;
  cid?: string;
}

export interface ListCommerceReceiptsParams {
  counterpartyOwnerId?: string;
  limit?: number;
}

export function buildCommerceReceiptFromTaskResult(input: {
  result: TaskResultPayload;
  attestation: CommerceDeliveryAttestation;
  receiptId: string;
  direction: "inbound" | "outbound";
  messageId?: string;
  createdAt?: string;
}): CommerceReceiptRecord {
  const att = input.attestation;
  return {
    receiptId: input.receiptId,
    taskId: input.result.taskId,
    mandateId: input.result.mandateId,
    counterpartyOwnerId: att.counterpartyOwnerId,
    documentId: att.documentId,
    relativePath: att.relativePath,
    contentHash: att.contentHash,
    cid: att.cid,
    direction: input.direction,
    summary: input.result.summary,
    messageId: input.messageId,
    createdAt: input.createdAt ?? input.result.createdAt,
  };
}

export function mapCommerceReceiptToActivity(
  receipt: CommerceReceiptRecord,
  activityId: string,
): AgentActivityRecord {
  const verb = receipt.direction === "inbound" ? "Received" : "Delivered";
  const evidence = [
    { type: "documentId", ref: receipt.documentId },
    { type: "contentHash", ref: receipt.contentHash },
  ];
  if (receipt.cid) {
    evidence.push({ type: "cid", ref: receipt.cid });
  }
  if (receipt.messageId) {
    evidence.push({ type: "messageId", ref: receipt.messageId });
  }

  return {
    activityId,
    correlationId: receipt.taskId,
    taskId: receipt.taskId,
    domain: "research",
    kind: "commerce_receipt",
    summary: `${verb} digital good — ${receipt.summary}`,
    remoteOwnerId: receipt.counterpartyOwnerId,
    evidence,
    createdAt: receipt.createdAt,
  };
}
