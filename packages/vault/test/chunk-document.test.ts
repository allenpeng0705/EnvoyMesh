import { describe, expect, it } from "vitest";
import { chunkDocument } from "../src/chunk-document.js";
import type { VaultDocumentMetadata } from "../src/index.js";

const metadata: VaultDocumentMetadata = {
  documentId: "doc-test",
  relativePath: "notes/guide.md",
  extension: ".md",
  title: "guide",
  byteLength: 100,
  contentHash: "hash",
  updatedAt: "2026-05-25T00:00:00.000Z",
};

describe("chunkDocument", () => {
  it("splits long text with overlap between chunks", () => {
    const paragraph = "Sentence one about mesh networking. Sentence two about relays. Sentence three about vault search.";
    const content = Array.from({ length: 12 }, () => paragraph).join(" ");
    const chunks = chunkDocument(metadata, content, { maxChunkChars: 120, overlapChars: 30 });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.text.length).toBeLessThanOrEqual(120);
    expect(chunks[1]?.text.startsWith(chunks[0]?.text.slice(-20) ?? "")).toBe(false);
    const joined = chunks.map((chunk) => chunk.text).join(" ");
    expect(joined).toContain("mesh networking");
    expect(joined).toContain("vault search");
  });

  it("prefers sentence boundaries over hard cuts", () => {
    const content = "Alpha beta gamma. Delta epsilon zeta. Eta theta iota.";
    const chunks = chunkDocument(metadata, content, { maxChunkChars: 40, overlapChars: 0 });
    expect(chunks.every((chunk) => !chunk.text.endsWith("Delt"))).toBe(true);
  });
});
