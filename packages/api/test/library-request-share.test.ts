import { describe, expect, it, vi } from "vitest";
import { runLibraryRequestShare } from "../src/library-request-share.js";
import type { BondRecord, DiscoverPublishedLibraryPeerResult } from "../src/node-service.js";

const bonds: BondRecord[] = [
  { peerOwnerId: "envoy:owner:sam", level: "direct", displayName: "Sam" },
];

describe("runLibraryRequestShare", () => {
  it("sends chat after scoped discovery", async () => {
    const sendChat = vi.fn(async () => {});
    const discoverPublishedLibrary = vi.fn(async (): Promise<DiscoverPublishedLibraryPeerResult[]> => [
      {
        peerOwnerId: "envoy:owner:sam",
        displayName: "Sam",
        bondLevel: "direct",
        files: [
          {
            title: "kubo-parity.md",
            relativePath: "docs/kubo-parity.md",
            contentHash: "deadbeef1234567890",
            byteLength: 100,
            documentId: "doc-x",
          },
        ],
      },
    ]);

    const outcome = await runLibraryRequestShare(
      {
        getBonds: async () => bonds,
        discoverPublishedLibrary,
        sendChat,
      },
      { targetOwnerHint: "Sam", fileTitleQuery: "kubo parity" },
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.matches).toHaveLength(1);
    expect(discoverPublishedLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        fileTitleQuery: "kubo parity",
        targetOwnerIds: ["envoy:owner:sam"],
      }),
    );
    expect(sendChat).toHaveBeenCalledWith("envoy:owner:sam", expect.stringContaining("[Envoy AI]"));
    expect(sendChat.mock.calls[0]![1]).toContain("kubo-parity.md");
  });

  it("returns error when contact is unknown", async () => {
    const outcome = await runLibraryRequestShare(
      {
        getBonds: async () => bonds,
        discoverPublishedLibrary: async () => [],
        sendChat: async () => {},
      },
      { targetOwnerHint: "Unknown Person", fileTitleQuery: "x" },
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toContain("Unknown Person");
  });
});
