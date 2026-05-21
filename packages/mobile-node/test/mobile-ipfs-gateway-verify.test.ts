/**
 * @vitest-environment jsdom
 * E2E: mobile IPFS gateway verify — fetch allowlisted gateway, compare vault hash.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMobileVault } from "@envoymesh/mobile-vault";
import * as gateway from "../src/mobile-ipfs-gateway.js";
import { verifyMobileLibraryDocumentIpfsGateway } from "../src/mobile-ipfs-gateway-verify.js";
import { recordMobilePublishedExternalExport } from "../src/mobile-published-external.js";
import {
  mobileVaultExtension,
  mobileVaultLibraryFingerprint,
  mobileVaultRelativePath,
} from "../src/mobile-vault-fingerprint.js";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("E2E mobile IPFS gateway verify", () => {
  it("verifyMobileLibraryDocumentIpfsGateway matches fetched bytes to vault contentHash", async () => {
    const vault = createMobileVault();
    const profileDir = "/gateway-verify-e2e";
    const content = new TextEncoder().encode("gateway verify fixture\n");
    await vault.writeFile("/verify-me.txt", content);

    const absPath = (await vault.listFiles("/"))[0]!;
    const entry = await vault.readFile(absPath);
    const ext = mobileVaultExtension(absPath);
    const rel = mobileVaultRelativePath(absPath);
    const fp = await mobileVaultLibraryFingerprint(rel, entry.content, ext);

    await recordMobilePublishedExternalExport(profileDir, fp.documentId, {
      cid: "bafyverifye2e",
      ipfsInteropRecipe: "helia-unixfs-export-v1",
      kuboVersion: "",
      contentHash: fp.contentHash,
      heliaVersion: "1.0.0",
    });

    vi.spyOn(gateway, "fetchIpfsGatewayBytes").mockResolvedValue(content);

    const result = await verifyMobileLibraryDocumentIpfsGateway({
      vault,
      profileDir,
      documentId: fp.documentId,
      allowIpfs: true,
      gatewayAllowlist: ["https://ipfs.io"],
    });

    expect(result.contentHashMatches).toBe(true);
    expect(result.expectedContentHash).toBe(fp.contentHash);
    expect(result.fetchedBytes).toBe(content.byteLength);
    expect(result.gatewayUrl).toMatch(/^https:\/\/ipfs\.io\/ipfs\/bafyverifye2e/);
  });

  it("rejects verify when gateway bytes do not match vault hash", async () => {
    const vault = createMobileVault();
    const profileDir = "/gateway-verify-mismatch";
    const content = new TextEncoder().encode("original bytes");
    await vault.writeFile("/mismatch.bin", content);

    const absPath = (await vault.listFiles("/"))[0]!;
    const entry = await vault.readFile(absPath);
    const ext = mobileVaultExtension(absPath);
    const rel = mobileVaultRelativePath(absPath);
    const fp = await mobileVaultLibraryFingerprint(rel, entry.content, ext);

    await recordMobilePublishedExternalExport(profileDir, fp.documentId, {
      cid: "bafymismatch",
      ipfsInteropRecipe: "helia-unixfs-export-v1",
      kuboVersion: "",
      contentHash: fp.contentHash,
    });

    vi.spyOn(gateway, "fetchIpfsGatewayBytes").mockResolvedValue(new TextEncoder().encode("tampered"));

    await expect(
      verifyMobileLibraryDocumentIpfsGateway({
        vault,
        profileDir,
        documentId: fp.documentId,
        allowIpfs: true,
        gatewayAllowlist: ["https://dweb.link"],
      }),
    ).rejects.toThrow(/do not match vault contentHash/i);
  });
});
