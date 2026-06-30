/**
 * Step 13b tests — library import / IPFS / share / RAG / discovery routes.
 */
import type { FileShareContext } from "../src/node-service-fileshare.js";
import type { RagIndexStatus } from "@envoymesh/api";
import { describe, expect, it, vi } from "vitest";

function makeContext(overrides: Partial<FileShareContext> = {}): FileShareContext {
  return {
    getVaultDir: () => "/vault",
    getProfileDir: () => "/profile",
    getNodeConfig: async () => ({}),
    getTaskStore: () => ({}),
    getRagService: async () => null,
    recordOwnerActivity: () => {},
    emit: () => {},
    ...overrides,
  };
}
void ({} as unknown as RagIndexStatus);

describe("resolveLibraryItemPathViaRuntime", () => {
  it("throws when vault dir is missing", async () => {
    const { resolveLibraryItemPathViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    await expect(
      resolveLibraryItemPathViaRuntime(
        makeContext({ getVaultDir: () => null }),
        "x.md",
      ),
    ).rejects.toThrow(/Vault dir/);
  });

  it("throws 'File not found in vault' for an unindexed path", async () => {
    const { resolveLibraryItemPathViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    await expect(
      resolveLibraryItemPathViaRuntime(makeContext(), "no-such-file.md"),
    ).rejects.toThrow(/File not found in vault/);
  });
});

describe("listAgentShareProposalsViaRuntime + dismissAgentShareProposalViaRuntime", () => {
  it("listAgentShareProposals returns [] when profile dir is missing", async () => {
    const { listAgentShareProposalsViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    const items = await listAgentShareProposalsViaRuntime(
      makeContext({ getProfileDir: () => null }),
    );
    expect(items).toEqual([]);
  });

  it("dismissAgentShareProposal no-ops silently when profile dir is missing", async () => {
    const { dismissAgentShareProposalViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    await expect(
      dismissAgentShareProposalViaRuntime(
        makeContext({ getProfileDir: () => null }),
        "x",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("getRagIndexStatusViaRuntime", () => {
  it("returns the DEFAULT shape when the RAG service is unavailable", async () => {
    const { getRagIndexStatusViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    const out = await getRagIndexStatusViaRuntime({
      ...makeContext(),
      getRagService: async () => null,
    });
    expect(typeof out.isIndexing).toBe("boolean");
    expect(typeof out.progress).toBe("object");
    expect(out.progress.phase).toBeDefined();
  });

  it("returns the RAG service's status when wired", async () => {
    const { getRagIndexStatusViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    const out = await getRagIndexStatusViaRuntime({
      ...makeContext(),
      getRagService: async () => ({
        getIndexStatus: () => ({
          isIndexing: false,
          progress: {
            phase: "done",
            processed: 5,
            total: 5,
            indexed: 5,
            skipped: 0,
            removed: 0,
            updatedAt: new Date().toISOString(),
          },
          trackedDocuments: 5,
        }),
      }),
    });
    expect(out.progress.phase).toBe("done");
    expect(out.trackedDocuments).toBe(5);
  });
});

describe("getIpfsEngineStatusViaRuntime", () => {
  it("returns a status shape even when profile dir is missing", async () => {
    const { getIpfsEngineStatusViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    const out = await getIpfsEngineStatusViaRuntime(
      makeContext({ getProfileDir: () => null }),
    );
    expect(out.available).toBe(false);
    expect(out.running).toBe(false);
    expect(out.managed).toBe(false);
  });
});

describe("exportLibraryItemToIpfsViaRuntime", () => {
  it("throws Task-store-not-initialised when both vault and audit are missing", async () => {
    const { exportLibraryItemToIpfsViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    await expect(
      exportLibraryItemToIpfsViaRuntime(
        makeContext({
          getVaultDir: () => null,
          getProfileDir: () => null,
          getTaskStore: () => undefined,
        }),
        "doc-1",
      ),
    ).rejects.toThrow(/Task store not initialized/);
  });
});

describe("verifyLibraryItemIpfsGatewayViaRuntime", () => {
  it("throws Task-store-not-initialised when audit context is missing", async () => {
    const { verifyLibraryItemIpfsGatewayViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    await expect(
      verifyLibraryItemIpfsGatewayViaRuntime(
        makeContext({
          getVaultDir: () => null,
          getProfileDir: () => null,
          getTaskStore: () => undefined,
        }),
        { documentId: "doc-1", gatewayUrl: "https://example.com" },
      ),
    ).rejects.toThrow(/Task store not initialized/);
  });
});

describe("pinLibraryItemExternalViaRuntime", () => {
  it("returns ok:false when IPFS export is disabled", async () => {
    const { pinLibraryItemExternalViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    const out = await pinLibraryItemExternalViaRuntime(
      makeContext({ getNodeConfig: async () => ({}) }),
      "doc-1",
    );
    expect(out).toEqual({ ok: false, error: "IPFS export is disabled" });
  });

  it("returns ok:false when external pinning is disabled", async () => {
    const { pinLibraryItemExternalViaRuntime } = await import(
      "../src/node-service-fileshare.js"
    );
    const out = await pinLibraryItemExternalViaRuntime(
      makeContext({
        getNodeConfig: async () => ({
          externalPublish: { allowIpfs: true, pinningEnabled: false },
        }),
      }),
      "doc-1",
    );
    expect(out).toEqual({ ok: false, error: "External pinning is disabled in node settings" });
  });
});