import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createSignedDataTransferVoucher } from "@envoymesh/identity";
import { createUnsignedDataTransferVoucher } from "@envoymesh/protocol";
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { voucherJsonBytesFromObject } from "@envoymesh/network";
import { ENVOY_DATA_PROTOCOL } from "@envoymesh/network/protocols";
import type { NodeProfile, TransferStatus } from "@envoymesh/api";
import { isSafeVaultPath } from "./share-inbound.js";

/** Read a vault file and send it as verified chunks to `toPeerId` (FS-B). */
export async function sendVaultFileViaDataTransfer(input: {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  taskStore: LocalTaskStore;
  vaultDir: string;
  relativePath: string;
  toPeerId: string;
  dialHints?: string[];
  transferHooks?: {
    onUpdate: (status: Partial<TransferStatus> & { correlationId: string }) => void;
    correlationId: string;
    remotePeerOwnerId?: string;
  };
}): Promise<void> {
  const { mesh, profile, taskStore, vaultDir, relativePath, toPeerId, dialHints, transferHooks } = input;
  const norm = relativePath.replace(/^[\\/]+/, "");
  if (!isSafeVaultPath(vaultDir, norm)) {
    throw new Error("Unsafe vault path for data transfer");
  }
  const filePath = join(vaultDir, norm);
  const content = await readFile(filePath);
  const hash = createHash("sha256").update(content).digest("base64url");
  transferHooks?.onUpdate({
    correlationId: transferHooks.correlationId,
    phase: "transferring",
    totalBytes: content.byteLength,
    bytesTransferred: 0,
    remotePeerId: toPeerId,
    remotePeerOwnerId: transferHooks.remotePeerOwnerId,
    vaultRelativePath: norm,
    updatedAt: new Date().toISOString(),
  });
  const unsignedVoucher = createUnsignedDataTransferVoucher({
    issuerPeerId: mesh.peerId,
    issuerOwnerId: profile.owner.ownerId,
    issuerDeviceId: profile.device.deviceId,
    relativePath: norm,
    totalBytes: content.byteLength,
    contentHash: hash,
  });
  const voucher = createSignedDataTransferVoucher({
    unsigned: unsignedVoucher,
    devicePrivateKeyPem: profile.device.privateKeyPem,
  });
  const voucherUtf8 = voucherJsonBytesFromObject(voucher);
  const chunkSize = 64 * 1024;
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < content.length; offset += chunkSize) {
    chunks.push(content.subarray(offset, Math.min(offset + chunkSize, content.length)));
  }
  const latencyMs = await mesh.sendDataTransfer(
    toPeerId,
    voucherUtf8,
    chunks,
    dialHints?.length
      ? {
          dialHints,
          preferCircuitHints: dialHints.some((h) => h.includes("/p2p-circuit/")),
        }
      : undefined,
  );
  transferHooks?.onUpdate({
    correlationId: transferHooks.correlationId,
    phase: "verified",
    totalBytes: content.byteLength,
    bytesTransferred: content.byteLength,
    remotePeerId: toPeerId,
    remotePeerOwnerId: transferHooks.remotePeerOwnerId,
    vaultRelativePath: norm,
    updatedAt: new Date().toISOString(),
  });
  const createdAt = new Date().toISOString();
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.sent",
      intent: "sync.state",
      messageId: `data_${relativePath.replace(/[^a-zA-Z0-9_-]+/g, "_")}_${Date.now()}`,
      correlationId: undefined,
      remotePeerId: toPeerId,
      direction: "outbound",
      latencyMs,
      protocol: ENVOY_DATA_PROTOCOL,
      outcome: "record",
      summary: `Sent data transfer ${relativePath} (${content.byteLength} bytes).`,
      createdAt,
    }),
  );
}
