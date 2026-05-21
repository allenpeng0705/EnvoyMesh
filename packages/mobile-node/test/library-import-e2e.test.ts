/**
 * E2E: MobileNode importToLibrary → listLibraryItems.
 */
import { describe, expect, it } from "vitest";
import { createMobileVault } from "@envoymesh/mobile-vault";
import { MobileNode } from "../src/index.js";

describe("E2E mobile library import", () => {
  it("importToLibrary writes to vault and appears in listLibraryItems", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/import-e2e-profile",
      relayUrls: ["ws://relay.example.com:9000"],
      vault,
    });
    await node.initStandalone("/import-e2e-profile");
    await node.startNode();

    const text = "mobile import e2e payload";
    const contentBase64 = btoa(text);

    const result = await node.importToLibrary({
      relativePath: "imports/mobile-note.txt",
      contentBase64,
      mimeType: "text/plain",
    });

    expect(result.relativePath).toBe("imports/mobile-note.txt");
    expect(result.sizeBytes).toBe(text.length);

    const entry = await vault.readFile("/imports/mobile-note.txt");
    expect(new TextDecoder().decode(entry.content)).toBe(text);

    const items = await node.listLibraryItems({ query: "mobile-note" });
    expect(items).toHaveLength(1);
    expect(items[0].documentId).toBe(result.documentId);
  });

  it("rejects unsafe import paths", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/import-e2e-bad-path",
      relayUrls: [],
      vault,
    });
    await node.initStandalone("/import-e2e-bad-path");
    await node.startNode();

    await expect(
      node.importToLibrary({
        relativePath: "../bad.txt",
        contentBase64: btoa("x"),
      }),
    ).rejects.toThrow(/Invalid vault path/i);
  });
});
