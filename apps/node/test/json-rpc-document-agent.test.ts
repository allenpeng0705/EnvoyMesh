import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DocumentAgentTurnResult, NodeService, TransferStatus } from "@envoymesh/api";
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { routeRpcMethod } from "../src/json-rpc-router.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

describe("routeRpcMethod — document agent + transfer RPC (ADB-D)", () => {
  it("routes runDocumentAgentTurn with message param", async () => {
    const turn: DocumentAgentTurnResult = {
      answer: "Found 2 file(s) in your library.",
      intent: "list_library",
      toolsUsed: ["mesh.library_list"],
    };
    const runDocumentAgentTurn = vi.fn().mockResolvedValue(turn);
    const ns = { runDocumentAgentTurn } as unknown as NodeService;

    const result = await routeRpcMethod(ns, "runDocumentAgentTurn", {
      message: "list my library files",
    });

    expect(runDocumentAgentTurn).toHaveBeenCalledWith("list my library files");
    expect(result).toEqual(turn);
  });

  it("routes listActiveTransfers with no params", async () => {
    const transfers: TransferStatus[] = [
      {
        correlationId: "corr-1",
        phase: "negotiating",
        vaultRelativePath: "out/report.txt",
        updatedAt: new Date().toISOString(),
      },
    ];
    const listActiveTransfers = vi.fn().mockResolvedValue(transfers);
    const ns = { listActiveTransfers } as unknown as NodeService;

    const result = await routeRpcMethod(ns, "listActiveTransfers", {});

    expect(listActiveTransfers).toHaveBeenCalledTimes(1);
    expect(result).toEqual(transfers);
  });

  it("routes getTransferStatus with correlationId param", async () => {
    const status: TransferStatus = {
      correlationId: "corr-99",
      phase: "verified",
      vaultRelativePath: "inbox/received.txt",
      bytesTransferred: 128,
      totalBytes: 128,
      updatedAt: new Date().toISOString(),
    };
    const getTransferStatus = vi.fn().mockResolvedValue(status);
    const ns = { getTransferStatus } as unknown as NodeService;

    const result = await routeRpcMethod(ns, "getTransferStatus", { correlationId: "corr-99" });

    expect(getTransferStatus).toHaveBeenCalledWith("corr-99");
    expect(result).toEqual(status);
  });
});

describe("routeRpcMethod — document agent integration", () => {
  let profileDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoymesh-json-rpc-doc-"));
    vaultDir = join(profileDir, "vault");
    await mkdir(join(vaultDir, "docs"), { recursive: true });
    await writeFile(join(vaultDir, "docs/rpc-report.txt"), "rpc-integration", { mode: 0o600 });
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true });
  });

  it("runDocumentAgentTurn reaches NodeServiceImpl through the router", async () => {
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = {
      owner,
      device,
      deviceCertificate: createDeviceCertificate({
        owner,
        device,
        deviceProfile: "primary",
        capabilities: ["mesh.listen", "message.send"],
      }),
    };
    const node = new NodeServiceImpl(
      { peerId: "local-peer" } as any,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
      profile,
      vaultDir,
    );
    node.bindCliTaskStore(createLocalTaskStore(profileDir));

    const result = (await routeRpcMethod(node, "runDocumentAgentTurn", {
      message: "list my library files",
    })) as DocumentAgentTurnResult;

    expect(result.intent).toBe("list_library");
    expect(result.answer).toContain("rpc-report.txt");
  });
});
