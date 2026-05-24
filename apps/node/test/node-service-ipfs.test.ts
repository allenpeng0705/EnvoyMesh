import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { buildVaultIndex } from "@envoymesh/vault";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as gateway from "../src/ipfs-gateway.js";
import * as kubo from "../src/kubo-ipfs-export.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { createPublishedExternalStore } from "../src/published-external-store.js";

vi.mock("../src/kubo-ipfs-engine.js", () => ({
  ensureKuboIpfsReady: vi.fn().mockResolvedValue(undefined),
  getKuboIpfsEngineStatus: vi.fn().mockReturnValue({
    available: true,
    running: false,
    managed: false,
  }),
  shutdownKuboIpfsEngine: vi.fn().mockResolvedValue(undefined),
}));

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoy-node-ipfs-"));
  vaultDir = await mkdtemp(join(tmpdir(), "envoy-vault-ipfs-"));
  await mkdir(vaultDir, { recursive: true });
  await writeFile(join(vaultDir, "export-me.txt"), "node service ipfs export", "utf8");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(profileDir, { recursive: true, force: true });
  await rm(vaultDir, { recursive: true, force: true });
});

function createService(): NodeServiceImpl {
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir, undefined, vaultDir);
  svc.bindCliTaskStore(createLocalTaskStore(profileDir));
  return svc;
}

describe("NodeServiceImpl IPFS RPC", () => {
  it("exportLibraryItemToIpfs requires task store", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const svc = new NodeServiceImpl(undefined, trustStore, peerDirectory, human, profileDir, undefined, vaultDir);

    await expect(svc.exportLibraryItemToIpfs("doc-1")).rejects.toThrow(/Task store not initialized/i);
  });

  it("exportLibraryItemToIpfs respects allowIpfs policy from node config", async () => {
    const svc = createService();
    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;

    await expect(svc.exportLibraryItemToIpfs(doc.documentId)).rejects.toThrow(/disabled/i);
  });

  it("exportLibraryItemToIpfs persists export when policy enabled and Kubo succeeds", async () => {
    const svc = createService();
    await svc.updateNodeConfig({
      externalPublish: { allowIpfs: true, gatewayAllowlist: [] },
    });

    vi.spyOn(kubo, "kuboIpfsAddFileInteropRecipeV1").mockReturnValue({
      ok: true,
      cid: "bafynodeservice",
      kuboVersion: "0.24.0",
      stderr: "",
    });

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    const result = await svc.exportLibraryItemToIpfs(doc.documentId);

    expect(result.cid).toBe("bafynodeservice");
    expect(result.exportRevision).toBe(1);

    const stored = await createPublishedExternalStore(profileDir).get(doc.documentId);
    expect(stored?.cid).toBe("bafynodeservice");
  });

  it("verifyLibraryItemIpfsGateway delegates to gateway verify with allowlist config", async () => {
    const svc = createService();
    await svc.updateNodeConfig({
      externalPublish: { allowIpfs: true, gatewayAllowlist: ["https://ipfs.io"] },
    });

    const index = await buildVaultIndex({ rootDir: vaultDir });
    const doc = index.documents[0]!;
    await createPublishedExternalStore(profileDir).recordExport(doc.documentId, {
      cid: "bafyverifyrpc",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      kuboVersion: "0.24.0",
      contentHash: doc.contentHash,
    });

    vi.spyOn(gateway, "fetchIpfsGatewayBytes").mockResolvedValue(Buffer.from("node service ipfs export"));

    const result = await svc.verifyLibraryItemIpfsGateway({ documentId: doc.documentId });
    expect(result.contentHashMatches).toBe(true);
    expect(result.cid).toBe("bafyverifyrpc");
  });
});
