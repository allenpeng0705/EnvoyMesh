import { writeFile, mkdir, rm, mkdtemp } from "node:fs/promises";
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

describe("NodeServiceImpl listLibraryItems (FS-A)", () => {
  let profileDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-lib-"));
    vaultDir = await mkdtemp(join(tmpdir(), "envoy-vault-"));
    await mkdir(join(vaultDir, "notes"), { recursive: true });
    await writeFile(join(vaultDir, "notes", "hello.md"), "# Hello\n", "utf8");
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("returns empty list when vault root is missing", async () => {
    const missingVault = join(profileDir, "no-such-vault");
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir, undefined, [], missingVault);
    const items = await svc.listLibraryItems();
    expect(items).toEqual([]);
  });

  it("lists supported vault files with metadata aligned to buildVaultIndex", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir, undefined, [], vaultDir);

    const index = await buildVaultIndex({ rootDir: vaultDir });
    expect(index.documents).toHaveLength(1);

    const items = await svc.listLibraryItems();
    expect(items).toHaveLength(1);
    expect(items[0].relativePath).toBe("notes/hello.md");
    expect(items[0].title).toBe("hello");
    expect(items[0].documentId).toBe(index.documents[0].documentId);
    expect(items[0].contentHash).toBe(index.documents[0].contentHash);
    expect(items[0].published).toBe(false);

    const filtered = await svc.listLibraryItems({ query: "nope" });
    expect(filtered).toHaveLength(0);

    const hello = await svc.listLibraryItems({ query: "hello" });
    expect(hello).toHaveLength(1);
  });

  it("reflects publish manifest via setLibraryItemPublished (FS-D)", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir, undefined, [], vaultDir);

    const items = await svc.listLibraryItems();
    expect(items).toHaveLength(1);
    expect(items[0].published).toBe(false);

    await svc.setLibraryItemPublished(items[0].documentId, true);
    const after = await svc.listLibraryItems();
    expect(after[0].published).toBe(true);

    await svc.setLibraryItemPublished(items[0].documentId, false);
    const cleared = await svc.listLibraryItems();
    expect(cleared[0].published).toBe(false);
  });
});
