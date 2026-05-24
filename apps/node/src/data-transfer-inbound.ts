import { deriveDeviceId, verifyDataTransferVoucher } from "@envoymesh/identity";
import {
  createAuditEvent,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type PeerDirectoryRecord,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import { parseDataTransferVoucher } from "@envoymesh/protocol";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

export function installEnvoyDataTransferReceiver(input: {
  mesh: EnvoyMesh;
  peerDirectoryStore: LocalPeerDirectoryStore;
  taskStore: LocalTaskStore;
  vaultDir: string;
  /**
   * After voucher verification, choose the vault-relative path for the written file.
   * Default: use the path from the signed voucher.
   */
  resolveInboundRelativePath?: (remotePeerId: string, voucherRelativePath: string) => string;
  /**
   * Called only after a successful verified write (so a pending save-path override can be cleared).
   */
  onInboundVaultWriteCommitted?: (remotePeerId: string, voucherSourceRelativePath: string) => void;
  /** ADB-D: notify runtime when inbound bytes are verified and written. */
  onInboundTransferVerified?: (input: {
    remotePeerId: string;
    relativePath: string;
    totalBytes: number;
  }) => void;
}): void {
  const {
    mesh,
    peerDirectoryStore,
    taskStore,
    vaultDir,
    resolveInboundRelativePath,
    onInboundVaultWriteCommitted,
    onInboundTransferVerified,
  } = input;

  mesh.onDataTransfer(async ({ remotePeerId, voucher: rawVoucher, chunks }) => {
    const createdAt = new Date().toISOString();
    let parsed;
    try {
      parsed = parseDataTransferVoucher(rawVoucher);
    } catch {
      console.warn(`[data transfer] rejected: invalid voucher payload from ${remotePeerId.slice(0, 12)}…`);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "sync.state",
          remotePeerId,
          direction: "inbound",
          outcome: "deny",
          summary: "[data] invalid voucher payload.",
          createdAt,
        }),
      );
      return;
    }

    if (new Date(parsed.expiresAt).getTime() < Date.now()) {
      console.warn(`[data transfer] rejected: voucher expired from ${remotePeerId.slice(0, 12)}…`);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "sync.state",
          remotePeerId,
          direction: "inbound",
          outcome: "deny",
          summary: "[data] voucher expired.",
          createdAt,
        }),
      );
      return;
    }

    const peers = await peerDirectoryStore.listPeerRecords();
    let peer =
      peers.find((record) => record.peerId === remotePeerId) ??
      (parsed.issuerOwnerId
        ? peers.find((record) => record.ownerId === parsed.issuerOwnerId)
        : undefined);
    const deviceKey = peer?.devicePublicKeyPem;

    if (!deviceKey || !verifyDataTransferVoucher(parsed, deviceKey)) {
      console.warn(
        `[data transfer] rejected: voucher signature could not be verified for ${remotePeerId.slice(0, 12)}…` +
          (deviceKey ? "" : " (no devicePublicKeyPem in peer directory — chat-only bond?)"),
      );
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "sync.state",
          remotePeerId,
          direction: "inbound",
          outcome: "deny",
          summary: "[data] voucher signature could not be verified for this peer.",
          createdAt,
        }),
      );
      return;
    }

    const expectedDeviceId = expectedIssuerDeviceId(peer, deviceKey);
    if (parsed.issuerPeerId !== remotePeerId || parsed.issuerDeviceId !== expectedDeviceId) {
      console.warn(
        `[data transfer] rejected: voucher issuer mismatch for ${remotePeerId.slice(0, 12)}… ` +
          `(issuerPeer=${parsed.issuerPeerId.slice(0, 12)}… issuerDevice=${parsed.issuerDeviceId.slice(0, 20)}… ` +
          `expectedDevice=${expectedDeviceId.slice(0, 20)}…)`,
      );
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "sync.state",
          remotePeerId,
          direction: "inbound",
          outcome: "deny",
          summary: "[data] voucher issuer does not match peer directory binding.",
          createdAt,
        }),
      );
      return;
    }

    const combined = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    if (combined.length !== parsed.totalBytes) {
      console.warn(
        `[data transfer] rejected: byte length ${combined.length} != voucher ${parsed.totalBytes} from ${remotePeerId.slice(0, 12)}…`,
      );
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "sync.state",
          remotePeerId,
          direction: "inbound",
          outcome: "deny",
          summary: "[data] byte length does not match voucher.totalBytes.",
          createdAt,
        }),
      );
      return;
    }

    const hash = createHash("sha256").update(combined).digest("base64url");
    if (hash !== parsed.contentHash) {
      console.warn(`[data transfer] rejected: content hash mismatch from ${remotePeerId.slice(0, 12)}…`);
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "sync.state",
          remotePeerId,
          direction: "inbound",
          outcome: "deny",
          summary: "[data] content hash mismatch.",
          createdAt,
        }),
      );
      return;
    }

    const sourceNorm = parsed.relativePath.replace(/^[\\/]+/, "");
    let relForVault = sourceNorm;
    if (resolveInboundRelativePath) {
      relForVault = resolveInboundRelativePath(remotePeerId, parsed.relativePath).replace(/^[\\/]+/, "");
    }

    let targetPath: string;
    try {
      targetPath = safeResolvedVaultFile(vaultDir, relForVault);
    } catch {
      console.warn(
        `[data transfer] rejected: unsafe vault path "${relForVault}" from ${remotePeerId.slice(0, 12)}…`,
      );
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "message.rejected",
          intent: "sync.state",
          remotePeerId,
          direction: "inbound",
          outcome: "deny",
          summary: "[data] rejected unsafe relativePath.",
          createdAt,
        }),
      );
      return;
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, combined, { mode: 0o600 });
    onInboundVaultWriteCommitted?.(remotePeerId, sourceNorm);
    onInboundTransferVerified?.({
      remotePeerId,
      relativePath: relForVault,
      totalBytes: parsed.totalBytes,
    });
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "sync.state",
        remotePeerId,
        direction: "inbound",
        outcome: "allow",
        summary: `[data] wrote ${relForVault} (${parsed.totalBytes} bytes)`,
        createdAt,
      }),
    );
    console.log(`[data transfer] wrote ${relForVault} (${parsed.totalBytes} bytes) from ${remotePeerId}`);
  });
}

function expectedIssuerDeviceId(_peer: PeerDirectoryRecord | undefined, devicePublicKeyPem: string): string {
  return deriveDeviceId(devicePublicKeyPem);
}

function safeResolvedVaultFile(rootDir: string, relativePath: string): string {
  const base = resolve(rootDir);
  const candidate = resolve(base, relativePath);
  const rel = relative(base, candidate);
  if (rel.startsWith("..") || rel.split(sep).includes("..") || rel === "") {
    throw new Error("unsafe relativePath");
  }
  return candidate;
}
