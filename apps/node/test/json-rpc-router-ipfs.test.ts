import { describe, expect, it, vi } from "vitest";
import type { NodeService } from "@envoymesh/api";
import { routeRpcMethod } from "../src/json-rpc-router.js";

describe("routeRpcMethod — IPFS library RPC", () => {
  it("routes exportLibraryItemToIpfs to NodeService", async () => {
    const exportLibraryItemToIpfs = vi.fn().mockResolvedValue({
      documentId: "doc-1",
      cid: "bafyrpc",
      exportRevision: 1,
    });
    const ns = { exportLibraryItemToIpfs } as unknown as NodeService;

    const result = await routeRpcMethod(ns, "exportLibraryItemToIpfs", { documentId: "doc-1" });

    expect(exportLibraryItemToIpfs).toHaveBeenCalledWith("doc-1");
    expect(result).toMatchObject({ cid: "bafyrpc", exportRevision: 1 });
  });

  it("routes verifyLibraryItemIpfsGateway with optional gatewayUrl", async () => {
    const verifyLibraryItemIpfsGateway = vi.fn().mockResolvedValue({
      documentId: "doc-1",
      contentHashMatches: true,
      gatewayUrl: "https://ipfs.io/ipfs/bafy",
      fetchedBytes: 42,
    });
    const ns = { verifyLibraryItemIpfsGateway } as unknown as NodeService;

    const result = await routeRpcMethod(ns, "verifyLibraryItemIpfsGateway", {
      documentId: "doc-1",
      gatewayUrl: "https://ipfs.io",
    });

    expect(verifyLibraryItemIpfsGateway).toHaveBeenCalledWith({
      documentId: "doc-1",
      gatewayUrl: "https://ipfs.io",
    });
    expect(result).toMatchObject({ fetchedBytes: 42 });
  });
});
