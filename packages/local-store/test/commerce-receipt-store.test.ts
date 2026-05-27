import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCommerceReceiptStore } from "../src/commerce-receipt-store.js";

describe("createCommerceReceiptStore", () => {
  let profileDir: string;

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("appends and lists receipts newest-first", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-commerce-"));
    const store = createCommerceReceiptStore(profileDir);
    await store.append({
      receiptId: "r1",
      taskId: "task-1",
      counterpartyOwnerId: "envoy:owner:a",
      documentId: "doc-1",
      relativePath: "a.pdf",
      contentHash: "hash1",
      direction: "outbound",
      summary: "first",
      createdAt: "2026-05-20T10:00:00.000Z",
    });
    await store.append({
      receiptId: "r2",
      taskId: "task-2",
      counterpartyOwnerId: "envoy:owner:b",
      documentId: "doc-2",
      relativePath: "b.pdf",
      contentHash: "hash2",
      direction: "inbound",
      summary: "second",
      createdAt: "2026-05-20T11:00:00.000Z",
    });

    const all = await store.list();
    expect(all.map((row) => row.receiptId)).toEqual(["r2", "r1"]);

    const filtered = await store.list({ counterpartyOwnerId: "envoy:owner:a" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.receiptId).toBe("r1");
  });
});
