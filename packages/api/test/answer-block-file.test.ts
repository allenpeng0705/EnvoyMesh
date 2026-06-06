import { describe, expect, it } from "vitest";

import { inferFileFromStructuredCard, parseStructuredCardFile } from "../src/answer-block-file.js";

describe("answer-block-file", () => {
  it("parses explicit file ref on card blocks", () => {
    const file = parseStructuredCardFile({
      source: "vault",
      relativePath: "docs/readme.md",
      documentId: "doc-1",
    });
    expect(file).toEqual({
      source: "vault",
      relativePath: "docs/readme.md",
      documentId: "doc-1",
    });
  });

  it("infers file from card.file", () => {
    const params = inferFileFromStructuredCard({
      type: "card",
      title: "readme.md",
      file: { source: "vault", relativePath: "docs/readme.md" },
      cta: { label: "Open", action: "openLocalFile" },
    });
    expect(params).toEqual({ source: "vault", relativePath: "docs/readme.md" });
  });

  it("infers file from meta path line when cta is openLocalFile", () => {
    const params = inferFileFromStructuredCard({
      type: "card",
      title: "Quarterly Report",
      meta: ["path: reports/q1.pdf", "Updated: yesterday"],
      cta: { label: "Open", action: "openLocalFile" },
    });
    expect(params).toEqual({ source: "vault", relativePath: "reports/q1.pdf" });
  });

  it("parses JSON cta action payloads", () => {
    const params = inferFileFromStructuredCard({
      type: "card",
      title: "notes.md",
      cta: {
        label: "Open",
        action: JSON.stringify({
          type: "openLocalFile",
          source: "workspace",
          relativePath: "notes/todo.md",
        }),
      },
    });
    expect(params).toEqual({ source: "workspace", relativePath: "notes/todo.md" });
  });
});
