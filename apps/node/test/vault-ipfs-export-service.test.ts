import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as kubo from "../src/kubo-ipfs-export.js";
import * as heliaRouter from "../src/ipfs-export-router.js";
import { exportVaultDocumentToIpfs } from "../src/vault-ipfs-export-service.js";
import { createPublishedExternalStore } from "../src/published-external-store.js";

vi.mock("../src/kubo-ipfs-engine.js", () => ({
  ensureKuboIpfsReady: vi.fn().mockResolvedValue(undefined),
}));

let root: string;
let vaultDir: string;
let profileDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "envoymesh-vault-ipfs-export-"));
  vaultDir = join(root, "shared_vault");
  profileDir = join(root, "profile");
  await mkdir(vaultDir, { recursive: true });
  await mkdir(profileDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("exportVaultDocumentToIpfs", () => {
  it("rejects when IPFS export policy is disabled", async () => {
    await writeFile(join(vaultDir, "notes.md"), "policy gate test");
    const audits: string[] = [];

    await expect(
      exportVaultDocumentToIpfs({
        vaultDir,
        profileDir,
        documentId: "will-not-match",
        allowIpfs: false,
        appendAudit: async (event) => {
          audits.push(event.type);
        },
      }),
    ).rejects.toThrow(/disabled/i);

    expect(audits).toEqual([]);
  });

  it("persists export metadata and audit rows when Kubo succeeds", async () => {
    await writeFile(join(vaultDir, "export-me.txt"), "kubo parity export");

    const addSpy = vi.spyOn(kubo, "kuboIpfsAddFileInteropRecipeV1").mockReturnValue({
      ok: true,
      cid: "bafytestcid123",
      kuboVersion: "0.24.0",
      stderr: "",
    });

    const audits: string[] = [];
    const index = await import("@envoymesh/vault").then((m) => m.buildVaultIndex({ rootDir: vaultDir }));
    const doc = index.documents.find((d) => d.relativePath === "export-me.txt");
    expect(doc).toBeDefined();

    const result = await exportVaultDocumentToIpfs({
      vaultDir,
      profileDir,
      documentId: doc!.documentId,
      allowIpfs: true,
      appendAudit: async (event) => {
        audits.push(event.type);
      },
    });

    expect(addSpy).toHaveBeenCalledOnce();
    expect(result.cid).toBe("bafytestcid123");
    expect(result.exportRevision).toBe(1);
    expect(audits).toEqual([
      "vault.ipfs_export.started",
      "vault.ipfs_export.completed",
    ]);

    const stored = await createPublishedExternalStore(profileDir).get(doc!.documentId);
    expect(stored?.cid).toBe("bafytestcid123");
  });

  it("records failed audit when Kubo add fails", async () => {
    await writeFile(join(vaultDir, "fail.txt"), "will fail");
    vi.spyOn(kubo, "kuboIpfsAddFileInteropRecipeV1").mockReturnValue({
      ok: false,
      kuboVersion: "0.24.0",
      stderr: "connection refused",
      errorHint: "daemon not running",
    });

    const index = await import("@envoymesh/vault").then((m) => m.buildVaultIndex({ rootDir: vaultDir }));
    const doc = index.documents[0]!;
    const audits: string[] = [];

    await expect(
      exportVaultDocumentToIpfs({
        vaultDir,
        profileDir,
        documentId: doc.documentId,
        allowIpfs: true,
        appendAudit: async (event) => {
          audits.push(event.type);
        },
      }),
    ).rejects.toThrow(/daemon not running/);

    expect(audits).toEqual(["vault.ipfs_export.started", "vault.ipfs_export.failed"]);
    expect(await createPublishedExternalStore(profileDir).get(doc.documentId)).toBeUndefined();
  });

  it("increments exportRevision on re-export", async () => {
    await writeFile(join(vaultDir, "rev.txt"), "revision bump");
    const addSpy = vi
      .spyOn(kubo, "kuboIpfsAddFileInteropRecipeV1")
      .mockReturnValueOnce({
        ok: true,
        cid: "bafyfirst",
        kuboVersion: "0.24.0",
        stderr: "",
      })
      .mockReturnValueOnce({
        ok: true,
        cid: "bafysecond",
        kuboVersion: "0.24.0",
        stderr: "",
      });

    const index = await import("@envoymesh/vault").then((m) => m.buildVaultIndex({ rootDir: vaultDir }));
    const doc = index.documents[0]!;

    const first = await exportVaultDocumentToIpfs({
      vaultDir,
      profileDir,
      documentId: doc.documentId,
      allowIpfs: true,
      appendAudit: async () => {},
    });
    const second = await exportVaultDocumentToIpfs({
      vaultDir,
      profileDir,
      documentId: doc.documentId,
      allowIpfs: true,
      appendAudit: async () => {},
    });

    expect(addSpy).toHaveBeenCalledTimes(2);
    expect(first.exportRevision).toBe(1);
    expect(second.exportRevision).toBe(2);
    expect(second.cid).toBe("bafysecond");
  });

  it("throws when documentId is unknown", async () => {
    await expect(
      exportVaultDocumentToIpfs({
        vaultDir,
        profileDir,
        documentId: "missing-doc-id",
        allowIpfs: true,
        appendAudit: async () => {},
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("persists Helia export metadata when helia-only engine is selected", async () => {
    await writeFile(join(vaultDir, "helia-primary.txt"), "helia canonical");
    const helia = await import("../src/ipfs-export-engine-helia.js");
    vi.spyOn(helia.heliaExportEngine, "addFile").mockResolvedValue({
      ok: true,
      cid: "bafyhelia",
      engineId: "helia",
      engineVersion: "6.1.4",
      ipfsInteropRecipe: "helia-unixfs-export-v1",
    });

    const index = await import("@envoymesh/vault").then((m) => m.buildVaultIndex({ rootDir: vaultDir }));
    const doc = index.documents[0]!;
    const audits: string[] = [];

    const result = await exportVaultDocumentToIpfs({
      vaultDir,
      profileDir,
      documentId: doc.documentId,
      allowIpfs: true,
      externalPublish: { ipfsExportEngine: "helia" },
      appendAudit: async (event) => {
        audits.push(event.type);
      },
    });

    expect(result.cid).toBe("bafyhelia");
    expect(result.kuboVersion).toBe("");
    expect(result.heliaVersion).toBe("6.1.4");
    expect(audits).toEqual(["vault.ipfs_export.started", "vault.ipfs_export.completed"]);
  });

  it("shadow mode persists Kubo cid and records Helia parity when matched", async () => {
    await writeFile(join(vaultDir, "shadow.txt"), "helia shadow parity");
    vi.spyOn(kubo, "kuboIpfsAddFileInteropRecipeV1").mockReturnValue({
      ok: true,
      cid: "bafykubo",
      kuboVersion: "0.32.1",
      stderr: "",
    });
    vi.spyOn(heliaRouter, "addFileViaHeliaExportEngine").mockResolvedValue({
      ok: true,
      cid: "bafykubo",
      engineId: "helia",
      engineVersion: "6.1.4",
      ipfsInteropRecipe: "helia-unixfs-export-v1",
    });

    const index = await import("@envoymesh/vault").then((m) => m.buildVaultIndex({ rootDir: vaultDir }));
    const doc = index.documents[0]!;
    const audits: string[] = [];

    const result = await exportVaultDocumentToIpfs({
      vaultDir,
      profileDir,
      documentId: doc.documentId,
      allowIpfs: true,
      externalPublish: { ipfsExportEngine: "kubo-with-helia-shadow" },
      appendAudit: async (event) => {
        audits.push(event.type);
      },
    });

    expect(result.cid).toBe("bafykubo");
    expect(result.cidHelia).toBe("bafykubo");
    expect(result.heliaVersion).toBe("6.1.4");
    expect(audits).toContain("vault.ipfs_export.helia_shadow.started");
    expect(audits).toContain("vault.ipfs_export.helia_parity.matched");
  });

  it("shadow mode audits mismatch without changing canonical cid", async () => {
    await writeFile(join(vaultDir, "mismatch.txt"), "helia shadow mismatch");
    vi.spyOn(kubo, "kuboIpfsAddFileInteropRecipeV1").mockReturnValue({
      ok: true,
      cid: "bafykubo",
      kuboVersion: "0.32.1",
      stderr: "",
    });
    vi.spyOn(heliaRouter, "addFileViaHeliaExportEngine").mockResolvedValue({
      ok: true,
      cid: "bafyhelia",
      engineId: "helia",
      engineVersion: "6.1.4",
      ipfsInteropRecipe: "helia-unixfs-export-v1",
    });

    const index = await import("@envoymesh/vault").then((m) => m.buildVaultIndex({ rootDir: vaultDir }));
    const doc = index.documents[0]!;
    const audits: string[] = [];

    const result = await exportVaultDocumentToIpfs({
      vaultDir,
      profileDir,
      documentId: doc.documentId,
      allowIpfs: true,
      externalPublish: { ipfsExportEngine: "kubo-with-helia-shadow" },
      appendAudit: async (event) => {
        audits.push(event.type);
      },
    });

    expect(result.cid).toBe("bafykubo");
    expect(result.cidHelia).toBe("bafyhelia");
    expect(audits).toContain("vault.ipfs_export.helia_parity.mismatched");
  });
});
