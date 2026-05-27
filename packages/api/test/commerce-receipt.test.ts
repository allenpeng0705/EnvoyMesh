import { describe, expect, it } from "vitest";
import { createTaskResultPayload } from "@envoymesh/protocol";
import {
  buildCommerceReceiptFromTaskResult,
  mapCommerceReceiptToActivity,
} from "../src/commerce-receipt.js";

describe("commerce-receipt", () => {
  it("builds receipt from task.result delivery attestation", () => {
    const result = createTaskResultPayload({
      taskId: "task-1",
      status: "completed",
      summary: "Delivered research pack",
      deliveryAttestation: {
        documentId: "doc-1",
        relativePath: "exports/report.pdf",
        contentHash: "abc123hash",
        cid: "bafytest",
        counterpartyOwnerId: "envoy:owner:buyer",
      },
    });

    const receipt = buildCommerceReceiptFromTaskResult({
      result,
      attestation: result.deliveryAttestation!,
      receiptId: "rcpt-1",
      direction: "inbound",
      messageId: "msg-1",
    });

    expect(receipt.contentHash).toBe("abc123hash");
    expect(receipt.cid).toBe("bafytest");
    expect(receipt.direction).toBe("inbound");
  });

  it("maps receipt to commerce_receipt activity", () => {
    const activity = mapCommerceReceiptToActivity(
      {
        receiptId: "rcpt-1",
        taskId: "task-1",
        counterpartyOwnerId: "envoy:owner:seller",
        documentId: "doc-1",
        relativePath: "file.pdf",
        contentHash: "hash",
        direction: "outbound",
        summary: "Paid export",
        createdAt: "2026-05-20T12:00:00.000Z",
      },
      "act-1",
    );

    expect(activity.kind).toBe("commerce_receipt");
    expect(activity.evidence?.some((row) => row.type === "contentHash")).toBe(true);
  });
});
