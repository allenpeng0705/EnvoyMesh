import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createAuditEvent, type AuditEvent } from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import {
  fetchIpfsGatewayBytes,
  IPFS_GATEWAY_FETCH_MAX_BYTES,
  resolveAllowlistedGateway,
} from "./ipfs-gateway.js";
import { createPublishedExternalStore } from "./published-external-store.js";

export interface VerifyVaultDocumentIpfsGatewayResult {
  documentId: string;
  relativePath: string;
  cid: string;
  gatewayUrl: string;
  contentHashMatches: boolean;
  fetchedBytes: number;
  expectedContentHash: string;
  fetchedContentHash: string;
}

function sha256Base64Url(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("base64url");
}

export async function verifyVaultDocumentIpfsGateway(input: {
  vaultDir: string;
  profileDir: string;
  documentId: string;
  allowIpfs: boolean;
  gatewayAllowlist?: string[];
  gatewayUrl?: string;
  appendAudit: (event: AuditEvent) => Promise<void>;
}): Promise<VerifyVaultDocumentIpfsGatewayResult> {
  if (!input.allowIpfs) {
    throw new Error("IPFS gateway verify is disabled (enable externalPublish.allowIpfs in node settings)");
  }

  const gatewayBase = resolveAllowlistedGateway(input.gatewayAllowlist, input.gatewayUrl);

  const index = await buildVaultIndex({ rootDir: resolve(input.vaultDir) });
  const doc = index.documents.find((d) => d.documentId === input.documentId);
  if (!doc) {
    throw new Error(`Library document not found: ${input.documentId}`);
  }

  const exportRecord = await createPublishedExternalStore(input.profileDir).get(input.documentId);
  if (!exportRecord || exportRecord.contentHash !== doc.contentHash) {
    throw new Error("Document has no current IPFS export — export to IPFS first");
  }

  const correlationId = randomUUID();
  const startedAt = Date.now();
  const maxBytes = Math.min(Math.max(doc.byteLength, 1), IPFS_GATEWAY_FETCH_MAX_BYTES);

  await input.appendAudit(
    createAuditEvent({
      type: "vault.ipfs_gateway_verify.started",
      correlationId,
      direction: "local",
      outcome: "record",
      summary: `IPFS gateway verify started documentId=${input.documentId} cid=${exportRecord.cid} gateway=${gatewayBase}`,
    }),
  );

  try {
    const bytes = await fetchIpfsGatewayBytes(gatewayBase, exportRecord.cid, maxBytes);
    const fetchedContentHash = sha256Base64Url(bytes);
    const contentHashMatches = fetchedContentHash === doc.contentHash;
    const gatewayContentUrl = `${gatewayBase}/ipfs/${exportRecord.cid}`;

    if (!contentHashMatches) {
      await input.appendAudit(
        createAuditEvent({
          type: "vault.ipfs_gateway_verify.failed",
          correlationId,
          direction: "local",
          outcome: "deny",
          latencyMs: Date.now() - startedAt,
          summary: `IPFS gateway verify hash mismatch documentId=${input.documentId} cid=${exportRecord.cid}`,
        }),
      );
      throw new Error("Gateway bytes do not match vault contentHash — treat gateway as untrusted transport");
    }

    await input.appendAudit(
      createAuditEvent({
        type: "vault.ipfs_gateway_verify.completed",
        correlationId,
        direction: "local",
        outcome: "record",
        latencyMs: Date.now() - startedAt,
        summary: `IPFS gateway verify matched documentId=${input.documentId} cid=${exportRecord.cid} bytes=${bytes.byteLength}`,
      }),
    );

    return {
      documentId: input.documentId,
      relativePath: doc.relativePath,
      cid: exportRecord.cid,
      gatewayUrl: gatewayContentUrl,
      contentHashMatches,
      fetchedBytes: bytes.byteLength,
      expectedContentHash: doc.contentHash,
      fetchedContentHash,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("do not match")) {
      await input.appendAudit(
        createAuditEvent({
          type: "vault.ipfs_gateway_verify.failed",
          correlationId,
          direction: "local",
          outcome: "deny",
          latencyMs: Date.now() - startedAt,
          summary: `IPFS gateway verify failed documentId=${input.documentId} cid=${exportRecord.cid} error=${message}`,
        }),
      );
    }
    throw err;
  }
}
