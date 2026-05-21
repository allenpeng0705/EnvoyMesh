/**
 * Mobile vault → IPFS export via in-process Helia (H5).
 */
import {
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  heliaUnixfsAddBytesInteropRecipeV1Browser,
  readHeliaPackageVersionSync,
} from "@envoymesh/ipfs-helia/browser";
import type { ExportLibraryItemToIpfsResult } from "@envoymesh/api";
import type { MobileVault } from "@envoymesh/mobile-vault";
import { appendMobileAuditEvent, createMobileAuditRecord } from "./mobile-audit-log.js";
import { recordMobilePublishedExternalExport } from "./mobile-published-external.js";
import {
  mobileVaultBasename,
  mobileVaultExtension,
  mobileVaultLibraryFingerprint,
  mobileVaultRelativePath,
} from "./mobile-vault-fingerprint.js";

export async function exportMobileLibraryDocumentToIpfs(input: {
  vault: MobileVault;
  profileDir: string;
  documentId: string;
  allowIpfs: boolean;
  ipfsExportEngine?: string;
}): Promise<ExportLibraryItemToIpfsResult> {
  if (!input.allowIpfs) {
    throw new Error("IPFS export is disabled (enable externalPublish.allowIpfs in node settings)");
  }
  if (input.ipfsExportEngine && input.ipfsExportEngine !== "helia") {
    throw new Error("Mobile IPFS export requires the Helia engine");
  }

  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();

  const paths = await input.vault.listFiles("/");
  let relativePath: string | undefined;
  let contentHash: string | undefined;
  let content: Uint8Array | undefined;

  for (const absPath of paths.sort((a, b) => a.localeCompare(b))) {
    if (mobileVaultBasename(absPath).startsWith(".")) continue;
    const ext = mobileVaultExtension(absPath);
    const rel = mobileVaultRelativePath(absPath);
    const entry = await input.vault.readFile(absPath);
    const fp = await mobileVaultLibraryFingerprint(rel, entry.content, ext);
    if (fp.documentId === input.documentId) {
      relativePath = rel;
      contentHash = fp.contentHash;
      content = entry.content;
      break;
    }
  }

  if (!relativePath || !contentHash || !content) {
    throw new Error(`Library document not found: ${input.documentId}`);
  }

  await appendMobileAuditEvent(
    input.profileDir,
    createMobileAuditRecord({
      type: "vault.ipfs_export.started",
      direction: "local",
      outcome: "record",
      correlationId,
      summary: `IPFS export started documentId=${input.documentId} path=${relativePath} engine=helia`,
    }),
  );

  const outcome = await heliaUnixfsAddBytesInteropRecipeV1Browser(content);
  if (!outcome.ok || !outcome.cid) {
    const hint = outcome.errorHint ?? "Helia IPFS export failed";
    await appendMobileAuditEvent(
      input.profileDir,
      createMobileAuditRecord({
        type: "vault.ipfs_export.failed",
        direction: "local",
        outcome: "deny",
        correlationId,
        latencyMs: Date.now() - startedAt,
        summary: `IPFS export failed documentId=${input.documentId} engine=helia heliaVersion=${readHeliaPackageVersionSync()} error=${hint}`,
      }),
    );
    throw new Error(hint);
  }

  const record = await recordMobilePublishedExternalExport(input.profileDir, input.documentId, {
    cid: outcome.cid,
    ipfsInteropRecipe: HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
    kuboVersion: "",
    contentHash,
    heliaVersion: outcome.heliaVersion,
  });

  await appendMobileAuditEvent(
    input.profileDir,
    createMobileAuditRecord({
      type: "vault.ipfs_export.completed",
      direction: "local",
      outcome: "record",
      correlationId,
      latencyMs: Date.now() - startedAt,
      summary: `IPFS export completed documentId=${input.documentId} cid=${outcome.cid} engine=helia heliaVersion=${outcome.heliaVersion} revision=${record.exportRevision}`,
    }),
  );

  return {
    documentId: input.documentId,
    relativePath,
    ...record,
  };
}
