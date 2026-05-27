import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { createTaskResultPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { signUnsignedEnvelope, generateOwnerIdentity, generateDeviceIdentity, derivePeerId } from "@envoymesh/identity";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { recordCommerceReceiptFromTaskResult } from "../src/commerce-receipt-inbound.js";
import { createCommerceReceiptStore, createLocalAgentActivityStore } from "@envoymesh/local-store";

describe("commerce receipt node service", () => {
  let profileDir: string;
  let vaultDir: string;
  let svc: NodeServiceImpl;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-commerce-svc-"));
    vaultDir = join(profileDir, "vault");
    await mkdir(vaultDir, { recursive: true });
    await writeFile(join(vaultDir, "good.txt"), "digital good bytes", "utf8");

    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const mesh = { peerId: "12D3KooWCommerce" } as unknown as EnvoyMesh;
    svc = new NodeServiceImpl(mesh, trustStore, peerDirectory, human, profileDir, undefined, vaultDir);
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("recordCommerceReceipt stores outbound receipt and activity", async () => {
    const items = await svc.listLibraryItems();
    expect(items.length).toBeGreaterThan(0);
    const doc = items[0]!;

    const receipt = await svc.recordCommerceReceipt({
      taskId: "task-commerce-1",
      counterpartyOwnerId: "envoy:owner:buyer",
      documentId: doc.documentId,
      summary: "Sold good.txt",
    });

    expect(receipt.direction).toBe("outbound");
    expect(receipt.contentHash).toBe(doc.contentHash);

    const listed = await svc.listCommerceReceipts();
    expect(listed.some((row) => row.receiptId === receipt.receiptId)).toBe(true);

    const activity = await svc.listAgentActivity({ limit: 10 });
    expect(activity.some((row) => row.kind === "commerce_receipt")).toBe(true);
  });

  it("recordCommerceReceiptFromTaskResult ingests inbound task.result attestation", async () => {
    const receiptStore = createCommerceReceiptStore(profileDir);
    const activityStore = createLocalAgentActivityStore(profileDir);
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const payload = createTaskResultPayload({
      taskId: "task-inbound-1",
      status: "completed",
      summary: "Inbound delivery",
      deliveryAttestation: {
        documentId: "doc-remote",
        relativePath: "remote.pdf",
        contentHash: "remotehash123",
        counterpartyOwnerId: owner.ownerId,
      },
    });
    const unsigned = createUnsignedEnvelope({
      senderPeerId: derivePeerId(device.publicKeyPem),
      senderPublicKey: device.publicKeyPem,
      senderRole: "agent",
      recipientPeerId: "local-agent",
      recipientRole: "agent",
      intent: "task.result",
      payload,
    });
    const envelope = signUnsignedEnvelope(unsigned, device.privateKeyPem);

    const ok = await recordCommerceReceiptFromTaskResult({
      envelope,
      receiptStore,
      activityStore,
    });
    expect(ok).toBe(true);

    const receipts = await receiptStore.list();
    expect(receipts[0]?.direction).toBe("inbound");
    const activity = await activityStore.list();
    expect(activity[0]?.kind).toBe("commerce_receipt");
  });
});
