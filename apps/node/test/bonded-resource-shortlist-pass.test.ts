import { describe, expect, it } from "vitest";
import { runBondedResourceShortlistPass } from "../src/bonded-resource-shortlist-pass.js";

describe("runBondedResourceShortlistPass", () => {
  it("returns [] when owner has no interests", async () => {
    const hits = await runBondedResourceShortlistPass({
      getOwnerInterestTopics: async () => [],
      discoverPublishedLibrary: async () => {
        throw new Error("should not discover");
      },
    });
    expect(hits).toEqual([]);
  });

  it("ranks bonded library hits by topic match", async () => {
    const hits = await runBondedResourceShortlistPass({
      getOwnerInterestTopics: async () => ["wasm", "rust"],
      discoverPublishedLibrary: async ({ fileTitleQuery }) => [
        {
          peerOwnerId: "envoy:owner:alice",
          displayName: "Alice",
          libp2pPeerId: "12D3KooWtest",
          bondLevel: "direct",
          bondRank: 1,
          latencyMs: 10,
          files: [
            {
              documentId: "doc-1",
              title: `Intro to ${fileTitleQuery}`,
              relativePath: `shared/${fileTitleQuery}.md`,
              contentHash: "abc",
            },
          ],
        },
      ],
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.matchedTopic).toMatch(/wasm|rust/);
    expect(hits[0]?.title).toMatch(/wasm|rust/i);
  });
});
