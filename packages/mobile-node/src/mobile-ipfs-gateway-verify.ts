import type { VerifyLibraryItemIpfsGatewayResult } from "@envoymesh/api";
import type { MobileVault } from "@envoymesh/mobile-vault";
import { appendMobileAuditEvent } from "./mobile-audit-log.js";
import {
  fetchIpfsGatewayBytes,
  IPFS_GATEWAY_FETCH_MAX_BYTES,
  resolveAllowlistedGateway,
} from "./mobile-ipfs-gateway.js";
import { loadMobilePublishedExternalMap } from "./mobile-published-external.js";
import {
  mobileVaultExtension,
  mobileVaultLibraryFingerprint,
  mobileVaultRelativePath,
} from "./mobile-vault-fingerprint.js";

async function sha256Base64Url(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const out = new Uint8Array(digest);
  let bin = "";
  for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifyMobileLibraryDocumentIpfsGateway(input: {
  vault: MobileVault;
  profileDir: string;
  documentId: string;
  allowIpfs: boolean;
  gatewayAllowlist?: string[];
  gatewayUrl?: string;
}): Promise<VerifyLibraryItemIpfsGatewayResult> {
  if (!input.allowIpfs) {
    throw new Error("IPFS gateway verify is disabled (enable externalPublish.allowIpfs in node settings)");
  }

  const gatewayBase = resolveAllowlistedGateway(input.gatewayAllowlist, input.gatewayUrl);
  const paths = await input.vault.listFiles("/");
  let relativePath = "";
  let contentHash = "";
  let byteLength = 0;

  for (const absPath of paths) {
    const rel = mobileVaultRelativePath(absPath);
    const ext = mobileVaultExtension(absPath);
    const entry = await input.vault.readFile(absPath);
    const fp = await mobileVaultLibraryFingerprint(rel, entry.content, ext);
    if (fp.documentId === input.documentId) {
      relativePath = rel;
      contentHash = fp.contentHash;
      byteLength = entry.sizeBytes;
      break;
    }
  }

  if (!relativePath) {
    throw new Error(`Library document not found: ${input.documentId}`);
  }

  const exportRecord = (await loadMobilePublishedExternalMap(input.profileDir)).get(input.documentId);
  if (!exportRecord || exportRecord.contentHash !== contentHash) {
    throw new Error("Document has no current IPFS export — export to IPFS first");
  }

  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();
  const maxBytes = Math.min(Math.max(byteLength, 1), IPFS_GATEWAY_FETCH_MAX_BYTES);

  await appendMobileAuditEvent(input.profileDir, {
    eventId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    type: "vault.ipfs_gateway_verify.started",
    correlationId,
    direction: "local",
    outcome: "record",
    summary: `IPFS gateway verify started documentId=${input.documentId} cid=${exportRecord.cid} gateway=${gatewayBase}`,
  });

  try {
    const bytes = await fetchIpfsGatewayBytes(gatewayBase, exportRecord.cid, maxBytes);
    const fetchedContentHash = await sha256Base64Url(bytes);
    const contentHashMatches = fetchedContentHash === contentHash;
    const gatewayContentUrl = `${gatewayBase}/ipfs/${exportRecord.cid}`;

    if (!contentHashMatches) {
      await appendMobileAuditEvent(input.profileDir, {
        eventId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        type: "vault.ipfs_gateway_verify.failed",
        correlationId,
        direction: "local",
        outcome: "deny",
        latencyMs: Date.now() - startedAt,
        summary: `IPFS gateway verify hash mismatch documentId=${input.documentId} cid=${exportRecord.cid}`,
      });
      throw new Error("Gateway bytes do not match vault contentHash — treat gateway as untrusted transport");
    }

    await appendMobileAuditEvent(input.profileDir, {
      eventId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      type: "vault.ipfs_gateway_verify.completed",
      correlationId,
      direction: "local",
      outcome: "record",
      latencyMs: Date.now() - startedAt,
      summary: `IPFS gateway verify matched documentId=${input.documentId} cid=${exportRecord.cid} bytes=${bytes.byteLength}`,
    });

    return {
      documentId: input.documentId,
      relativePath,
      cid: exportRecord.cid,
      gatewayUrl: gatewayContentUrl,
      contentHashMatches,
      fetchedBytes: bytes.byteLength,
      expectedContentHash: contentHash,
      fetchedContentHash,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("do not match")) {
      await appendMobileAuditEvent(input.profileDir, {
        eventId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        type: "vault.ipfs_gateway_verify.failed",
        correlationId,
        direction: "local",
        outcome: "deny",
        latencyMs: Date.now() - startedAt,
        summary: `IPFS gateway verify failed documentId=${input.documentId} cid=${exportRecord.cid} error=${message}`,
      });
    }
    throw err;
  }
}
