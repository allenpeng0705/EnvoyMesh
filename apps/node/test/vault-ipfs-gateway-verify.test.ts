import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildVaultIndex } from "@envoymesh/vault";
import * as gateway from "../src/ipfs-gateway.js";
import { createPublishedExternalStore } from "../src/published-external-store.js";
import { verifyVaultDocumentIpfsGateway } from "../src/vault-ipfs-gateway-verify.js";

let root: string;
let vaultDir: string;
let profileDir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "envoymesh-ipfs-gateway-verify-"));
  vaultDir = join(root, "shared_vault");
  profileDir = join(root, "profile");
  await mkdir(vaultDir, { recursive: true });
  await mkdir(profileDir, { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe("verifyVaultDocumentIpfsGateway", () => {
  it("rejects when IPFS policy is disabled", async () => {
    await expect(
      verifyVaultDocumentIpfsGateway({
        vaultDir,
        profileDir,
        documentId: "any",
        allowIpfs: false,
        gatewayAllowlist: ["https://ipfs.io"],
        appendAudit: async () => {},
      }),
    ).rejects.toThrow(/disabled/i);
  });

  it("rejects when gateway allowlist is empty", async () => {
    await writeFile(join(vaultDir, "x.txt"), "hello gateway");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    await createPublishedExternalStore(profileDir).recordExport(doc.documentId, {
      cid: "bafytest",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });

    await expect(
      verifyVaultDocumentIpfsGateway({
        vaultDir,
        profileDir,
        documentId: doc.documentId,
        allowIpfs: true,
        gatewayAllowlist: [],
        appendAudit: async () => {},
      }),
    ).rejects.toThrow(/allowlist/i);
  });

  it("rejects explicit gatewayUrl not in allowlist", async () => {
    await writeFile(join(vaultDir, "x.txt"), "gateway pick");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    await createPublishedExternalStore(profileDir).recordExport(doc.documentId, {
      cid: "bafytest",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });

    await expect(
      verifyVaultDocumentIpfsGateway({
        vaultDir,
        profileDir,
        documentId: doc.documentId,
        allowIpfs: true,
        gatewayAllowlist: ["https://ipfs.io"],
        gatewayUrl: "https://evil.example",
        appendAudit: async () => {},
      }),
    ).rejects.toThrow(/allowlist/i);
  });

  it("rejects stale export when vault contentHash changed", async () => {
    await writeFile(join(vaultDir, "x.txt"), "original bytes");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    await createPublishedExternalStore(profileDir).recordExport(doc.documentId, {
      cid: "bafystale",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: "stale-hash-not-matching-vault",
    });

    await expect(
      verifyVaultDocumentIpfsGateway({
        vaultDir,
        profileDir,
        documentId: doc.documentId,
        allowIpfs: true,
        gatewayAllowlist: ["https://ipfs.io"],
        appendAudit: async () => {},
      }),
    ).rejects.toThrow(/no current IPFS export/i);
  });

  it("verifies matching bytes from allowlisted gateway", async () => {
    const content = "gateway parity bytes";
    await writeFile(join(vaultDir, "x.txt"), content);
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    const cid = "bafyverify";
    await createPublishedExternalStore(profileDir).recordExport(doc.documentId, {
      cid,
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });

    vi.spyOn(gateway, "fetchIpfsGatewayBytes").mockResolvedValue(Buffer.from(content));

    const audits: string[] = [];
    const result = await verifyVaultDocumentIpfsGateway({
      vaultDir,
      profileDir,
      documentId: doc.documentId,
      allowIpfs: true,
      gatewayAllowlist: ["https://ipfs.io"],
      appendAudit: async (event) => {
        audits.push(event.type);
      },
    });

    expect(result.contentHashMatches).toBe(true);
    expect(result.fetchedBytes).toBe(content.length);
    expect(audits).toContain("vault.ipfs_gateway_verify.started");
    expect(audits).toContain("vault.ipfs_gateway_verify.completed");
  });

  it("fails when gateway bytes hash mismatch", async () => {
    await writeFile(join(vaultDir, "x.txt"), "local truth");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    await createPublishedExternalStore(profileDir).recordExport(doc.documentId, {
      cid: "bafymismatch",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });

    vi.spyOn(gateway, "fetchIpfsGatewayBytes").mockResolvedValue(Buffer.from("wrong bytes"));

    await expect(
      verifyVaultDocumentIpfsGateway({
        vaultDir,
        profileDir,
        documentId: doc.documentId,
        allowIpfs: true,
        gatewayAllowlist: ["https://ipfs.io"],
        appendAudit: async () => {},
      }),
    ).rejects.toThrow(/hash mismatch|untrusted/i);
  });

  it("rejects when document has no current IPFS export", async () => {
    await writeFile(join(vaultDir, "x.txt"), "never exported");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;

    await expect(
      verifyVaultDocumentIpfsGateway({
        vaultDir,
        profileDir,
        documentId: doc.documentId,
        allowIpfs: true,
        gatewayAllowlist: ["https://ipfs.io"],
        appendAudit: async () => {},
      }),
    ).rejects.toThrow(/no current IPFS export/i);
  });

  it("audits failure when gateway fetch throws", async () => {
    await writeFile(join(vaultDir, "x.txt"), "fetch err");
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    await createPublishedExternalStore(profileDir).recordExport(doc.documentId, {
      cid: "bafyfetcherr",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });

    vi.spyOn(gateway, "fetchIpfsGatewayBytes").mockRejectedValue(new Error("network down"));

    const audits: string[] = [];
    await expect(
      verifyVaultDocumentIpfsGateway({
        vaultDir,
        profileDir,
        documentId: doc.documentId,
        allowIpfs: true,
        gatewayAllowlist: ["https://ipfs.io"],
        appendAudit: async (event) => {
          audits.push(event.type);
        },
      }),
    ).rejects.toThrow(/network down/);

    expect(audits).toContain("vault.ipfs_gateway_verify.started");
    expect(audits).toContain("vault.ipfs_gateway_verify.failed");
  });
});
