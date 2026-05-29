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
export declare function buildCommerceReceiptFromTaskResult(input: {
    result: TaskResultPayload;
    attestation: CommerceDeliveryAttestation;
    receiptId: string;
    direction: "inbound" | "outbound";
    messageId?: string;
    createdAt?: string;
}): CommerceReceiptRecord;
export declare function mapCommerceReceiptToActivity(receipt: CommerceReceiptRecord, activityId: string): AgentActivityRecord;
//# sourceMappingURL=commerce-receipt.d.ts.map