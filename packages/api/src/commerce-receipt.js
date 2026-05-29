/**
 * Story E receipt-only path — vault CID attestation linked to task.result (no payment rail).
 */
export function buildCommerceReceiptFromTaskResult(input) {
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
export function mapCommerceReceiptToActivity(receipt, activityId) {
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
//# sourceMappingURL=commerce-receipt.js.map