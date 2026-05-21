import { describe, expect, it } from "vitest";
import { createMobileVault } from "@envoymesh/mobile-vault";
import { MobileNode } from "../src/index.js";
import { exportMobileLibraryDocumentToIpfs } from "../src/mobile-ipfs-export.js";

describe("mobile Helia IPFS export", () => {
  it("exportMobileLibraryDocumentToIpfs fingerprints vault bytes via Helia", async () => {
    const vault = createMobileVault();
    const content = new TextEncoder().encode("mobile helia export fixture\n");
    await vault.writeFile("/notes.md", content);

    const node = new MobileNode({
      profileDir: "/test-profile",
      relayUrls: ["ws://relay.example.com:9000"],
      vault,
    });
    await node.initStandalone("/test-profile");

    const items = await node.listLibraryItems();
    expect(items).toHaveLength(1);

    const result = await exportMobileLibraryDocumentToIpfs({
      vault,
      profileDir: "/test-profile",
      documentId: items[0]!.documentId,
      allowIpfs: true,
      ipfsExportEngine: "helia",
    });

    expect(result.documentId).toBe(items[0]!.documentId);
    expect(result.cid).toMatch(/^baf/i);
    expect(result.ipfsInteropRecipe).toBe("helia-unixfs-export-v1");
    expect(result.heliaVersion).toMatch(/^\d+\.\d+\.\d+|unknown$/);
  });
});
