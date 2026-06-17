/**
 * Phase 33 — Typed Artifact payload tests.
 *
 * Verifies the three-variant discriminated union (text / file / structured), the helpers,
 * the breaking-change guard against old `string[]` artifacts, and the round-trip through
 * `TaskResultPayloadSchema`.
 */

import { describe, expect, it } from "vitest";
import {
  ArtifactSchema,
  FileArtifactSchema,
  StructuredArtifactSchema,
  TextArtifactSchema,
  createFileArtifact,
  createStructuredArtifact,
  createTaskResultPayload,
  createTextArtifact,
  parseArtifact,
  parseFileArtifact,
  parseStructuredArtifact,
  parseTaskResultPayload,
  parseTextArtifact,
  type TaskResultPayload,
} from "../src/index.js";

describe("ArtifactSchema — discriminated union", () => {
  it("accepts a text artifact", () => {
    const a = { kind: "text", content: "hello" };
    expect(() => ArtifactSchema.parse(a)).not.toThrow();
    expect(ArtifactSchema.parse(a)).toEqual(a);
  });

  it("accepts a text artifact with mimeType", () => {
    const a = { kind: "text", content: "# hi", mimeType: "text/markdown" };
    expect(ArtifactSchema.parse(a).mimeType).toBe("text/markdown");
  });

  it("accepts a file artifact", () => {
    const a = { kind: "file", vaultPath: "/shared/foo.pdf", contentHash: "abc123" };
    expect(() => ArtifactSchema.parse(a)).not.toThrow();
    expect(ArtifactSchema.parse(a)).toEqual(a);
  });

  it("accepts a file artifact with mimeType + size + displayName", () => {
    const a = {
      kind: "file",
      vaultPath: "/shared/foo.pdf",
      contentHash: "deadbeef",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      displayName: "Foo.pdf",
    };
    const parsed = ArtifactSchema.parse(a);
    expect(parsed.sizeBytes).toBe(1024);
    expect(parsed.displayName).toBe("Foo.pdf");
  });

  it("accepts a structured artifact", () => {
    const a = { kind: "structured", schemaRef: "x://test/1", data: { hello: "world" } };
    expect(() => ArtifactSchema.parse(a)).not.toThrow();
    expect(ArtifactSchema.parse(a)).toEqual(a);
  });

  it("rejects an artifact with an unknown kind", () => {
    expect(() => ArtifactSchema.parse({ kind: "binary", content: "x" })).toThrow();
  });

  it("rejects a text artifact missing content", () => {
    expect(() => TextArtifactSchema.parse({ kind: "text" })).toThrow();
  });

  it("rejects a file artifact missing contentHash", () => {
    expect(() => FileArtifactSchema.parse({ kind: "file", vaultPath: "/a" })).toThrow();
  });

  it("rejects a structured artifact with non-object data", () => {
    expect(() =>
      StructuredArtifactSchema.parse({ kind: "structured", schemaRef: "x", data: "nope" }),
    ).toThrow();
  });
});

describe("Artifact helpers — create* + parse* round-trip", () => {
  it("createTextArtifact + parseTextArtifact round-trip", () => {
    const a = createTextArtifact({ content: "hi", mimeType: "text/plain" });
    expect(a).toEqual({ kind: "text", content: "hi", mimeType: "text/plain" });
    expect(parseTextArtifact(a)).toEqual(a);
  });

  it("createFileArtifact + parseFileArtifact round-trip", () => {
    const a = createFileArtifact({
      vaultPath: "/p",
      contentHash: "h",
      sizeBytes: 42,
    });
    expect(parseFileArtifact(a)).toEqual(a);
  });

  it("createStructuredArtifact + parseStructuredArtifact round-trip", () => {
    const a = createStructuredArtifact({ schemaRef: "x://1", data: { a: 1, b: [1, 2] } });
    expect(parseStructuredArtifact(a)).toEqual(a);
  });

  it("parseArtifact dispatches on kind", () => {
    const text = createTextArtifact({ content: "x" });
    const file = createFileArtifact({ vaultPath: "/p", contentHash: "h" });
    const structured = createStructuredArtifact({ schemaRef: "x", data: {} });
    expect(parseArtifact(text).kind).toBe("text");
    expect(parseArtifact(file).kind).toBe("file");
    expect(parseArtifact(structured).kind).toBe("structured");
  });
});

describe("TaskResultPayloadSchema — typed artifacts + backward-incompat guard", () => {
  it("accepts a result with mixed-typed artifacts", () => {
    const payload: TaskResultPayload = {
      taskId: "task-1",
      status: "completed",
      summary: "ok",
      artifacts: [
        createTextArtifact({ content: "Here's the answer." }),
        createFileArtifact({ vaultPath: "/docs/foo.pdf", contentHash: "h1" }),
        createStructuredArtifact({
          schemaRef: "https://schemas.envoymesh.org/task-report-1.json",
          data: { confidence: 0.92 },
        }),
      ],
      createdAt: "2026-06-16T00:00:00.000Z",
    };
    const parsed = parseTaskResultPayload(payload);
    expect(parsed.artifacts).toHaveLength(3);
    expect(parsed.artifacts[0]?.kind).toBe("text");
    expect(parsed.artifacts[1]?.kind).toBe("file");
    expect(parsed.artifacts[2]?.kind).toBe("structured");
  });

  it("accepts an empty artifact array (default)", () => {
    const payload = createTaskResultPayload({
      taskId: "task-2",
      status: "completed",
      summary: "no artifacts",
    });
    expect(payload.artifacts).toEqual([]);
  });

  it("REJECTS old string[] artifacts (backward-incompat document)", () => {
    const oldShape = {
      taskId: "task-3",
      status: "completed",
      summary: "old",
      artifacts: ["/shared/foo.pdf", "https://example.com/quote"],
      createdAt: "2026-06-16T00:00:00.000Z",
    };
    expect(() => parseTaskResultPayload(oldShape)).toThrow();
  });
});
