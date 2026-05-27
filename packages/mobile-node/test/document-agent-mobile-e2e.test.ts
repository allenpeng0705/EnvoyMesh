/**
 * P4: MobileNode.runDocumentAgentTurn via inline tool adapter.
 */
import { describe, expect, it, vi } from "vitest";
import { createMobileVault } from "@envoymesh/mobile-vault";
import { MobileNode } from "../src/index.js";

describe("MobileNode.runDocumentAgentTurn (P4)", () => {
  it("lists library files through mesh.library_list adapter", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/mobile-doc-agent-list",
      relayUrls: [],
      vault,
    });
    await node.initStandalone("/mobile-doc-agent-list");
    await node.startNode();

    const text = "mobile document agent list e2e";
    await node.importToLibrary({
      relativePath: "docs/mobile-list.txt",
      contentBase64: btoa(text),
      mimeType: "text/plain",
    });

    const turn = await node.runDocumentAgentTurn("list my library files");
    expect(turn.intent).toBe("list_library");
    expect(turn.toolsUsed).toContain("mesh.library_list");
    expect(turn.answer).toContain("mobile-list");
  });

  it("requests share from contact via mesh.library_request_share adapter", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/mobile-doc-agent-request",
      relayUrls: [],
      vault,
    });
    await node.initStandalone("/mobile-doc-agent-request");
    await node.startNode();

    await (node as any)._trustStore.set({
      peerOwnerId: "envoy:owner:peer",
      level: "direct",
      displayName: "Peer",
      createdAt: new Date().toISOString(),
    });

    const sendAgentChat = vi.spyOn(node, "sendAgentChat").mockResolvedValue({ messageId: "msg-1" });
    vi.spyOn(node, "discoverPublishedLibrary").mockResolvedValue([
      {
        peerOwnerId: "envoy:owner:peer",
        displayName: "Peer",
        bondLevel: "direct",
        bondRank: 0,
        files: [
          {
            documentId: "d1",
            title: "notes.md",
            relativePath: "docs/notes.md",
            contentHash: "abc123hash0000",
            byteLength: 50,
          },
        ],
        latencyMs: 2,
      },
    ]);

    const turn = await node.runDocumentAgentTurn("request share from Peer for notes");
    expect(turn.intent).toBe("request_share_from");
    expect(turn.toolsUsed).toContain("mesh.library_request_share");
    expect(sendAgentChat).toHaveBeenCalledWith("envoy:owner:peer", expect.stringContaining("notes"));
    expect(turn.answer).toContain("Peer");
  });

  it("publishes library metadata through mesh.library_publish adapter", async () => {
    const vault = createMobileVault();
    const node = new MobileNode({
      profileDir: "/mobile-doc-agent-publish",
      relayUrls: [],
      vault,
    });
    await node.initStandalone("/mobile-doc-agent-publish");
    await node.startNode();

    await node.importToLibrary({
      relativePath: "docs/mobile-publish.txt",
      contentBase64: btoa("mobile publish e2e"),
      mimeType: "text/plain",
    });

    const setPublished = vi.spyOn(node, "setLibraryItemPublished").mockResolvedValue(undefined);

    const turn = await node.runDocumentAgentTurn('publish "docs/mobile-publish.txt"');
    expect(turn.intent).toBe("publish");
    expect(turn.toolsUsed).toContain("mesh.library_publish");
    expect(setPublished).toHaveBeenCalledWith(expect.any(String), true);
    expect(turn.answer.toLowerCase()).toContain("published");
  });
});
