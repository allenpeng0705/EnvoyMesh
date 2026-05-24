/**
 * E2E: importToLibrary → listLibraryItems round-trip on NodeServiceImpl.
 */
import { readFile } from "node:fs/promises";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-import-e2e-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function createService(): NodeServiceImpl {
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  return new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir, undefined, vaultDir);
}

describe("E2E library import", () => {
  it("importToLibrary writes bytes and listLibraryItems returns indexed document", async () => {
    const svc = createService();
    const body = "imported via RPC e2e\n";
    const contentBase64 = Buffer.from(body, "utf8").toString("base64");

    const result = await svc.importToLibrary({
      relativePath: "imports/report.txt",
      contentBase64,
      mimeType: "text/plain",
    });

    expect(result.relativePath).toBe("imports/report.txt");
    expect(result.sizeBytes).toBe(body.length);

    const onDisk = await readFile(join(vaultDir, "imports/report.txt"), "utf8");
    expect(onDisk).toBe(body);

    const items = await svc.listLibraryItems();
    expect(items.some((i) => i.documentId === result.documentId)).toBe(true);

    const index = await buildVaultIndex({ rootDir: vaultDir });
    expect(index.documents.some((d) => d.documentId === result.documentId)).toBe(true);
  });

  it("rejects path traversal in importToLibrary", async () => {
    const svc = createService();
    await expect(
      svc.importToLibrary({
        relativePath: "../escape.txt",
        contentBase64: Buffer.from("nope").toString("base64"),
      }),
    ).rejects.toThrow(/Invalid vault path|outside the shared vault/i);
  });

  it("imported file can be marked published for discovery", async () => {
    const svc = createService();
    const { documentId } = await svc.importToLibrary({
      relativePath: "imports/publish-me.md",
      contentBase64: Buffer.from("# Publish me\n", "utf8").toString("base64"),
    });

    await svc.setLibraryItemPublished(documentId, true);
    const items = await svc.listLibraryItems({ query: "publish" });
    expect(items).toHaveLength(1);
    expect(items[0].published).toBe(true);
  });
});
