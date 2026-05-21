import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExternalPublishConfig } from "@envoymesh/api";
import { createAuditEvent, type AuditEvent } from "@envoymesh/local-store";
import { assertPathInsideVault, buildVaultIndex } from "@envoymesh/vault";
import {
  addFileViaHeliaExportEngine,
  addFileViaPrimaryIpfsExportEngine,
  ensurePrimaryIpfsExportEngineReady,
  isHeliaShadowSelection,
  resolveIpfsExportEngineSelection,
} from "./ipfs-export-router.js";
import {
  createPublishedExternalStore,
  type PublishedExternalExportFields,
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
  externalPublish?: Pick<ExternalPublishConfig, "ipfsExportEngine">;
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

  const engineSelection = resolveIpfsExportEngineSelection({
    externalPublish: input.externalPublish,
  });

  const correlationId = randomUUID();
  const startedAt = Date.now();

  await input.appendAudit(
    createAuditEvent({
      type: "vault.ipfs_export.started",
      correlationId,
      direction: "local",
      outcome: "record",
      summary: `IPFS export started documentId=${input.documentId} path=${doc.relativePath} engine=${engineSelection}`,
    }),
  );

  await ensurePrimaryIpfsExportEngineReady({
    profileDir: input.profileDir,
    selection: engineSelection,
  });

  const outcome = await addFileViaPrimaryIpfsExportEngine({
    absFilePath,
    profileDir: input.profileDir,
    selection: engineSelection,
  });

  if (!outcome.ok || !outcome.cid) {
    const hint = outcome.errorHint ?? "ipfs add failed";
    await input.appendAudit(
      createAuditEvent({
        type: "vault.ipfs_export.failed",
        correlationId,
        direction: "local",
        outcome: "deny",
        latencyMs: Date.now() - startedAt,
        summary: `IPFS export failed documentId=${input.documentId} engine=${outcome.engineId} engineVersion=${outcome.engineVersion} recipe=${outcome.ipfsInteropRecipe} error=${hint}`,
      }),
    );
    throw new Error(hint);
  }

  const exportFields: PublishedExternalExportFields = {
    cid: outcome.cid,
    ipfsInteropRecipe: outcome.ipfsInteropRecipe,
    kuboVersion: outcome.engineId === "kubo" ? outcome.engineVersion : "",
    contentHash: doc.contentHash,
    ...(outcome.engineId === "helia" && { heliaVersion: outcome.engineVersion }),
  };

  if (isHeliaShadowSelection(engineSelection)) {
    await input.appendAudit(
      createAuditEvent({
        type: "vault.ipfs_export.helia_shadow.started",
        correlationId,
        direction: "local",
        outcome: "record",
        summary: `Helia shadow export started documentId=${input.documentId} kuboCid=${outcome.cid}`,
      }),
    );

    const heliaOutcome = await addFileViaHeliaExportEngine({
      absFilePath,
      profileDir: input.profileDir,
    });

    if (heliaOutcome.ok && heliaOutcome.cid) {
      exportFields.cidHelia = heliaOutcome.cid;
      exportFields.heliaVersion = heliaOutcome.engineVersion;

      const parityMatched = heliaOutcome.cid === outcome.cid;
      await input.appendAudit(
        createAuditEvent({
          type: parityMatched
            ? "vault.ipfs_export.helia_parity.matched"
            : "vault.ipfs_export.helia_parity.mismatched",
          correlationId,
          direction: "local",
          outcome: "record",
          summary: parityMatched
            ? `Helia shadow parity matched documentId=${input.documentId} cid=${outcome.cid}`
            : `Helia shadow parity mismatched documentId=${input.documentId} kuboCid=${outcome.cid} heliaCid=${heliaOutcome.cid}`,
        }),
      );
    } else {
      await input.appendAudit(
        createAuditEvent({
          type: "vault.ipfs_export.helia_parity.mismatched",
          correlationId,
          direction: "local",
          outcome: "record",
          summary: `Helia shadow export failed documentId=${input.documentId} kuboCid=${outcome.cid} error=${heliaOutcome.errorHint ?? "unknown"}`,
        }),
      );
    }
  }

  const record = await createPublishedExternalStore(input.profileDir).recordExport(
    input.documentId,
    exportFields,
  );

  await input.appendAudit(
    createAuditEvent({
      type: "vault.ipfs_export.completed",
      correlationId,
      direction: "local",
      outcome: "record",
      latencyMs: Date.now() - startedAt,
      summary: `IPFS export completed documentId=${input.documentId} cid=${outcome.cid} engine=${outcome.engineId} engineVersion=${outcome.engineVersion} recipe=${outcome.ipfsInteropRecipe} revision=${record.exportRevision}${record.cidHelia ? ` cidHelia=${record.cidHelia}` : ""}`,
    }),
  );

  return {
    documentId: input.documentId,
    relativePath: doc.relativePath,
    ...record,
  };
}
