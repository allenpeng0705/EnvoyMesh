import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createAuditEvent, type AuditEvent } from "@envoymesh/local-store";
import { assertPathInsideVault, buildVaultIndex } from "@envoymesh/vault";
import {
  IPFSInteropRecipeV1Id,
  kuboIpfsAddFileInteropRecipeV1,
} from "./kubo-ipfs-export.js";
import { ensureKuboIpfsReady } from "./kubo-ipfs-engine.js";
import {
  createPublishedExternalStore,
  type PublishedExternalRecord,
} from "./published-external-store.js";

export interface ExportVaultDocumentToIpfsResult extends PublishedExternalRecord {
  documentId: string;
  relativePath: string;
}

export async function exportVaultDocumentToIpfs(input: {
  vaultDir: string;
  profileDir: string;
  documentId: string;
  allowIpfs: boolean;
  appendAudit: (event: AuditEvent) => Promise<void>;
}): Promise<ExportVaultDocumentToIpfsResult> {
  if (!input.allowIpfs) {
    throw new Error("IPFS export is disabled (enable externalPublish.allowIpfs in node settings)");
  }

  const vaultRoot = resolve(input.vaultDir);
  const index = await buildVaultIndex({ rootDir: vaultRoot });
  const doc = index.documents.find((d) => d.documentId === input.documentId);
  if (!doc) {
    throw new Error(`Library document not found: ${input.documentId}`);
  }

  const absFilePath = resolve(vaultRoot, doc.relativePath);
  assertPathInsideVault(vaultRoot, absFilePath);

  const st = await stat(absFilePath);
  if (!st.isFile()) {
    throw new Error(`Expected a regular file: ${doc.relativePath}`);
  }

  const correlationId = randomUUID();
  const startedAt = Date.now();

  await input.appendAudit(
    createAuditEvent({
      type: "vault.ipfs_export.started",
      correlationId,
      direction: "local",
      outcome: "record",
      summary: `IPFS export started documentId=${input.documentId} path=${doc.relativePath} recipe=${IPFSInteropRecipeV1Id}`,
    }),
  );

  await ensureKuboIpfsReady({ profileDir: input.profileDir });

  const outcome = kuboIpfsAddFileInteropRecipeV1(absFilePath, input.profileDir);

  if (!outcome.ok || !outcome.cid) {
    const hint = outcome.errorHint ?? "ipfs add failed";
    await input.appendAudit(
      createAuditEvent({
        type: "vault.ipfs_export.failed",
        correlationId,
        direction: "local",
        outcome: "deny",
        latencyMs: Date.now() - startedAt,
        summary: `IPFS export failed documentId=${input.documentId} kuboVersion=${outcome.kuboVersion} recipe=${IPFSInteropRecipeV1Id} error=${hint}`,
      }),
    );
    throw new Error(hint);
  }

  const record = await createPublishedExternalStore(input.profileDir).recordExport(input.documentId, {
    cid: outcome.cid,
    ipfsInteropRecipe: IPFSInteropRecipeV1Id,
    kuboVersion: outcome.kuboVersion,
    contentHash: doc.contentHash,
  });

  await input.appendAudit(
    createAuditEvent({
      type: "vault.ipfs_export.completed",
      correlationId,
      direction: "local",
      outcome: "record",
      latencyMs: Date.now() - startedAt,
      summary: `IPFS export completed documentId=${input.documentId} cid=${outcome.cid} kuboVersion=${outcome.kuboVersion} recipe=${IPFSInteropRecipeV1Id} revision=${record.exportRevision}`,
    }),
  );

  return {
    documentId: input.documentId,
    relativePath: doc.relativePath,
    ...record,
  };
}
