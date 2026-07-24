/**
 * Phase 48D — A2A Artifact Map tests.
 *
 * Pins the EnvoyMesh Artifact ↔ A2A Part mapping for all 4 Artifact
 * kinds. Verifies mimeType / metadata pass-through, CompositeArtifact
 * expansion with worker attribution, and FileArtifact URI shape.
 */

import { describe, expect, it } from "vitest";
import type { Artifact } from "@envoymesh/protocol";
import {
  a2aPartToEnvoyArtifact,
  artifactsToA2AParts,
  compositeArtifactToParts,
  envoyArtifactToPart,
  partsToEnvoyArtifacts,
} from "../src/a2a-artifact-map.js";

const VAULT_URL = "https://relay.example.com";

describe("a2a-artifact-map: TextArtifact → TextPart", () => {
  it("maps content to text", () => {
    const part = envoyArtifactToPart(
      { kind: "text", content: "hello world" },
      null,
    );
    expect(part.kind).toBe("text");
    if (part.kind === "text") {
      expect(part.text).toBe("hello world");
    }
  });

  it("carries mimeType in metadata", () => {
    const part = envoyArtifactToPart(
      { kind: "text", content: "# Title", mimeType: "text/markdown" },
      null,
    );
    if (part.kind === "text") {
      expect(part.metadata?.mimeType).toBe("text/markdown");
    }
  });

  it("no metadata when mimeType absent", () => {
    const part = envoyArtifactToPart(
      { kind: "text", content: "no mime" },
      null,
    );
    if (part.kind === "text") {
      expect(part.metadata?.mimeType).toBeUndefined();
    }
  });
});

describe("a2a-artifact-map: StructuredArtifact → DataPart", () => {
  it("maps data and schemaRef", () => {
    const part = envoyArtifactToPart(
      { kind: "structured", schemaRef: "my:schema", data: { a: 1, b: "x" } },
      null,
    );
    expect(part.kind).toBe("data");
    if (part.kind === "data") {
      expect(part.data).toEqual({ a: 1, b: "x" });
      expect(part.metadata?.schemaRef).toBe("my:schema");
    }
  });
});

describe("a2a-artifact-map: FileArtifact → FilePart (URI form)", () => {
  it("builds gateway URL with vault path + content hash", () => {
    const part = envoyArtifactToPart(
      {
        kind: "file",
        vaultPath: "notes/hello.txt",
        contentHash: "sha256:abc123",
        mimeType: "text/plain",
        displayName: "hello.txt",
      },
      VAULT_URL,
    );
    expect(part.kind).toBe("file");
    if (part.kind === "file") {
      expect(part.file.uri).toBe(
        `${VAULT_URL}/vault/${encodeURIComponent("notes/hello.txt")}?hash=sha256%3Aabc123`,
      );
      expect(part.file.mimeType).toBe("text/plain");
      expect(part.file.name).toBe("hello.txt");
      expect(part.metadata?.vaultPath).toBe("notes/hello.txt");
      expect(part.metadata?.contentHash).toBe("sha256:abc123");
    }
  });

  it("falls back to envoymesh-vault:// URI when no vaultUrl", () => {
    const part = envoyArtifactToPart(
      { kind: "file", vaultPath: "x.txt", contentHash: "h1" },
      null,
    );
    if (part.kind === "file") {
      expect(part.file.uri).toBe("envoymesh-vault://x.txt#h1");
    }
  });

  it("strips trailing slash from vaultUrl", () => {
    const part = envoyArtifactToPart(
      { kind: "file", vaultPath: "x.txt", contentHash: "h1" },
      `${VAULT_URL}/`,
    );
    if (part.kind === "file") {
      expect(part.file.uri).toBe(`${VAULT_URL}/vault/x.txt?hash=h1`);
    }
  });
});

describe("a2a-artifact-map: CompositeArtifact → N Parts", () => {
  const composite: Artifact = {
    kind: "composite",
    aggregation: "weighted_concat",
    createdAt: "2026-07-18T00:00:00Z",
    parts: [
      {
        subtaskId: "sub-1",
        workerPeerId: "envoy_peer_a",
        workerOwnerId: "envoy:owner:a",
        weight: 0.6,
        artifact: { kind: "text", content: "draft from A" },
      },
      {
        subtaskId: "sub-2",
        workerPeerId: "envoy_peer_b",
        workerOwnerId: "envoy:owner:b",
        weight: 0.4,
        note: "verified against source",
        artifact: { kind: "structured", schemaRef: "x", data: { b: 1 } },
      },
    ],
  };

  it("compositeArtifactToParts expands to N Parts", () => {
    const parts = compositeArtifactToParts(
      composite as Extract<Artifact, { kind: "composite" }>,
      null,
    );
    expect(parts.length).toBe(2);
    expect(parts[0]?.kind).toBe("text");
    expect(parts[1]?.kind).toBe("data");
  });

  it("preserves worker attribution in Part.metadata", () => {
    const parts = compositeArtifactToParts(
      composite as Extract<Artifact, { kind: "composite" }>,
      null,
    );
    expect(parts[0]?.metadata?.subtaskId).toBe("sub-1");
    expect(parts[0]?.metadata?.workerPeerId).toBe("envoy_peer_a");
    expect(parts[0]?.metadata?.workerOwnerId).toBe("envoy:owner:a");
    expect(parts[0]?.metadata?.weight).toBe(0.6);
    expect(parts[1]?.metadata?.note).toBe("verified against source");
  });

  it("artifactsToA2AParts flattens composites from a mixed list", () => {
    const list: Artifact[] = [
      { kind: "text", content: "intro" },
      composite as Artifact,
    ];
    const parts = artifactsToA2AParts(list, null);
    expect(parts.length).toBe(3);
    expect(parts[0]?.kind).toBe("text");
    expect(parts[1]?.kind).toBe("text");
    expect(parts[2]?.kind).toBe("data");
  });
});

describe("a2a-artifact-map: inbound (A2A Part → EnvoyMesh Artifact)", () => {
  it("TextPart → TextArtifact", () => {
    const artifact = a2aPartToEnvoyArtifact({
      kind: "text",
      text: "hello",
      metadata: { mimeType: "text/plain" },
    });
    expect(artifact.kind).toBe("text");
    if (artifact.kind === "text") {
      expect(artifact.content).toBe("hello");
      expect(artifact.mimeType).toBe("text/plain");
    }
  });

  it("DataPart → StructuredArtifact with default schemaRef", () => {
    const artifact = a2aPartToEnvoyArtifact({
      kind: "data",
      data: { foo: "bar" },
    });
    expect(artifact.kind).toBe("structured");
    if (artifact.kind === "structured") {
      expect(artifact.schemaRef).toBe("a2a:data");
      expect(artifact.data).toEqual({ foo: "bar" });
    }
  });

  it("DataPart with schemaRef metadata preserves schemaRef", () => {
    const artifact = a2aPartToEnvoyArtifact({
      kind: "data",
      data: { foo: "bar" },
      metadata: { schemaRef: "my:custom" },
    });
    if (artifact.kind === "structured") {
      expect(artifact.schemaRef).toBe("my:custom");
    }
  });

  it("FilePart (uri) → FileArtifact with vaultPath=uri", () => {
    const artifact = a2aPartToEnvoyArtifact({
      kind: "file",
      file: {
        uri: "https://other.example.com/x.pdf",
        mimeType: "application/pdf",
        name: "x.pdf",
      },
    });
    expect(artifact.kind).toBe("file");
    if (artifact.kind === "file") {
      expect(artifact.vaultPath).toBe("https://other.example.com/x.pdf");
      expect(artifact.mimeType).toBe("application/pdf");
      expect(artifact.displayName).toBe("x.pdf");
    }
  });
});

describe("a2a-artifact-map: composite round-trip (outbound → inbound)", () => {
  it("a composite Artifact survives a round-trip via the bundle envelope", () => {
    const original: Artifact = {
      kind: "composite",
      aggregation: "concatenate",
      createdAt: "2026-07-18T12:00:00Z",
      parts: [
        {
          subtaskId: "s1",
          workerPeerId: "p1",
          workerOwnerId: "o1",
          weight: 1,
          artifact: { kind: "text", content: "x" },
        },
      ],
    };

    // outbound — single DataPart with bundle envelope
    const outbound = envoyArtifactToPart(original, null);
    expect(outbound.kind).toBe("data");

    // inbound — should reconstruct the composite
    const inbound = a2aPartToEnvoyArtifact(outbound);
    expect(inbound.kind).toBe("composite");
    if (inbound.kind === "composite") {
      expect(inbound.aggregation).toBe("concatenate");
      expect(inbound.parts.length).toBe(1);
      expect(inbound.parts[0]?.subtaskId).toBe("s1");
      expect(inbound.parts[0]?.artifact.kind).toBe("text");
    }
  });
});

describe("a2a-artifact-map: partsToEnvoyArtifacts", () => {
  it("maps a flat Part[] to Artifacts[]", () => {
    const artifacts = partsToEnvoyArtifacts([
      { kind: "text", text: "hi" },
      { kind: "data", data: { x: 1 } },
    ]);
    expect(artifacts.length).toBe(2);
    expect(artifacts[0]?.kind).toBe("text");
    expect(artifacts[1]?.kind).toBe("structured");
  });
});