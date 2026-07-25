/**
 * Phase 48D — A2A v1.0 Artifact ↔ Part Mapping.
 *
 * Translates EnvoyMesh's 4-kind `Artifact` discriminated union to the
 * A2A v1.0 unified `Part` model (text / file / data). Composite
 * artifacts expand to N Parts; each Part carries worker attribution
 * in `metadata` so the A2A client can reconstruct the bundle.
 *
 * Outbound (EnvoyMesh → A2A) — used to format `task.result` artifacts
 * for A2A clients.
 *
 * Inbound (A2A → EnvoyMesh) — used to seed the `objective` of a freshly
 * minted mandate from an incoming `message/send`. We map text → text,
 * data → structured, file → file with `vaultPath = uri`. Composite
 * isn't valid inbound per A2A spec (Parts are flat) — we map it to a
 * single structured artifact preserving the bundle.
 *
 * Design: docs/a2a-mcp-interop-design.md §6.4.
 */

import type { Artifact } from "@envoymesh/protocol";

// ---------------------------------------------------------------------------
// A2A v1.0 Part / Artifact / Message shapes (subset we produce).
// Kept inline (not in @envoymesh/api) to avoid coupling the protocol
// package to A2A terminology — the bridge module owns the translation.
// ---------------------------------------------------------------------------

export interface A2ATextPart {
  kind: "text";
  text: string;
  metadata?: Record<string, unknown>;
}

export interface A2AFilePart {
  kind: "file";
  file: {
    name?: string;
    mimeType?: string;
    /** Remote URI. Mutually exclusive with `bytes`. */
    uri?: string;
    /** Base64-encoded content. Mutually exclusive with `uri`. */
    bytes?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface A2ADataPart {
  kind: "data";
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export type A2APart = A2ATextPart | A2AFilePart | A2ADataPart;

export interface A2AArtifact {
  artifactId: string;
  name?: string;
  description?: string;
  parts: A2APart[];
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Outbound: EnvoyMesh Artifact → A2A Part(s)
// ---------------------------------------------------------------------------

/**
 * Map one EnvoyMesh Artifact to one A2A Part. Composite artifacts are
 * expanded to N Parts by `artifactsToA2AParts()`; this function maps a
 * single (non-composite) artifact.
 */
export function envoyArtifactToPart(
  artifact: Artifact,
  vaultUrl: string | null,
): A2APart {
  const baseUrl = stripTrailingSlash(vaultUrl ?? "");

  switch (artifact.kind) {
    case "text": {
      const part: A2ATextPart = { kind: "text", text: artifact.content };
      if (artifact.mimeType) {
        part.metadata = { ...(part.metadata ?? {}), mimeType: artifact.mimeType };
      }
      return part;
    }
    case "structured": {
      const part: A2ADataPart = { kind: "data", data: artifact.data };
      part.metadata = { ...(part.metadata ?? {}), schemaRef: artifact.schemaRef };
      return part;
    }
    case "file": {
      const file: A2AFilePart["file"] = {};
      if (artifact.mimeType) file.mimeType = artifact.mimeType;
      if (artifact.displayName) file.name = artifact.displayName;
      // Prefer gateway HTTP URI (`GET /vault/<path>` on the home bridge).
      // Without a vault URL, fall back to an opaque placeholder.
      if (baseUrl) {
        file.uri = `${baseUrl}/vault/${encodeURIComponent(artifact.vaultPath)}?hash=${encodeURIComponent(artifact.contentHash)}`;
      } else {
        file.uri = `envoymesh-vault://${artifact.vaultPath}#${artifact.contentHash}`;
      }
      const part: A2AFilePart = { kind: "file", file };
      part.metadata = {
        ...(part.metadata ?? {}),
        vaultPath: artifact.vaultPath,
        contentHash: artifact.contentHash,
        ...(artifact.sizeBytes != null ? { sizeBytes: artifact.sizeBytes } : {}),
      };
      return part;
    }
    case "composite": {
      // Composite → single structured Part preserving the bundle. The
      // N-Parts expansion is the responsibility of
      // `compositeArtifactToParts()`.
      const bundle = {
        aggregation: artifact.aggregation,
        createdAt: artifact.createdAt,
        parts: artifact.parts.map((p) => ({
          subtaskId: p.subtaskId,
          workerPeerId: p.workerPeerId,
          workerOwnerId: p.workerOwnerId,
          weight: p.weight,
          note: p.note,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          artifact: envoyArtifactToPart(p.artifact as Artifact, vaultUrl),
        })),
      };
      const part: A2ADataPart = { kind: "data", data: { bundle } };
      part.metadata = { ...(part.metadata ?? {}), envoyKind: "composite" };
      return part;
    }
  }
}

/**
 * Expand a CompositeArtifact to N A2A Parts, one per worker
 * contribution. The worker attribution is preserved in `metadata`.
 */
export function compositeArtifactToParts(
  artifact: Extract<Artifact, { kind: "composite" }>,
  vaultUrl: string | null,
): A2APart[] {
  return artifact.parts.flatMap((p) => {
    const part = envoyArtifactToPart(p.artifact as Artifact, vaultUrl);
    part.metadata = {
      ...(part.metadata ?? {}),
      subtaskId: p.subtaskId,
      workerPeerId: p.workerPeerId,
      workerOwnerId: p.workerOwnerId,
      weight: p.weight,
      ...(p.note ? { note: p.note } : {}),
    };
    return [part];
  });
}

/**
 * Map a list of EnvoyMesh Artifacts to a single A2A Artifact. Each
 * Artifact becomes one or more Parts; Parts are flattened into the
 * `parts[]` array. CompositeArtifacts contribute N Parts each.
 */
export function artifactsToA2AParts(
  artifacts: Artifact[],
  vaultUrl: string | null,
): A2APart[] {
  const parts: A2APart[] = [];
  for (const a of artifacts) {
    if (a.kind === "composite") {
      parts.push(...compositeArtifactToParts(a, vaultUrl));
    } else {
      parts.push(envoyArtifactToPart(a, vaultUrl));
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Inbound: A2A Part(s) → EnvoyMesh Artifact(s)
// ---------------------------------------------------------------------------

/**
 * Map one A2A Part to an EnvoyMesh Artifact. Used to seed the
 * `objective` of an inbound mandate from an inbound `message/send`.
 *
 * For `file` Parts we set `vaultPath = uri` and leave `contentHash`
 * empty; the receiving agent is expected to dereference the URI on
 * demand. The "composite" envoyKind metadata marker is recognized and
 * reconstructed as a `CompositeArtifact`.
 */
export function a2aPartToEnvoyArtifact(part: A2APart): Artifact {
  switch (part.kind) {
    case "text": {
      const mimeType = readString(part.metadata, "mimeType");
      return {
        kind: "text",
        content: part.text,
        ...(mimeType ? { mimeType } : {}),
      };
    }
    case "data": {
      // Detect the composite envelope we produce on outbound. Use a
      // strict discriminator on metadata so a third-party data part that
      // happens to have `bundle`+`parts`+`aggregation` shape isn't
      // misinterpreted as EnvoyMesh composite.
      const envoyKind = readString(part.metadata, "envoyKind");
      const bundle = (part.data as Record<string, unknown>)?.bundle;
      if (
        envoyKind === "composite" &&
        bundle && typeof bundle === "object" &&
        Array.isArray((bundle as Record<string, unknown>).parts) &&
        typeof (bundle as Record<string, unknown>).aggregation === "string"
      ) {
        return reconstructCompositeArtifact(bundle as CompositeEnvelope, part);
      }
      const schemaRef = readString(part.metadata, "schemaRef") ?? "a2a:data";
      return {
        kind: "structured",
        schemaRef,
        data: part.data,
      };
    }
    case "file": {
      const vaultPath = part.file.uri ?? part.file.name ?? "unknown";
      const mimeType = part.file.mimeType;
      const displayName = part.file.name;
      return {
        kind: "file",
        vaultPath,
        contentHash: readString(part.metadata, "contentHash") ?? "",
        ...(mimeType ? { mimeType } : {}),
        ...(displayName ? { displayName } : {}),
      };
    }
  }
}

/**
 * Map a list of A2A Parts to a flat list of EnvoyMesh Artifacts.
 * Each Part contributes one Artifact. Composite envelopes are
 * reconstructed if present.
 */
export function partsToEnvoyArtifacts(parts: A2APart[]): Artifact[] {
  return parts.map(a2aPartToEnvoyArtifact);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CompositeEnvelope {
  aggregation: string;
  createdAt: string;
  parts: Array<{
    subtaskId: string;
    workerPeerId: string;
    workerOwnerId: string;
    weight: number;
    note?: string;
    artifact: A2APart;
  }>;
}

function reconstructCompositeArtifact(
  bundle: CompositeEnvelope,
  parent: A2ADataPart,
): Artifact {
  // Validate aggregation enum; default to "owner_review" if missing/unknown.
  const validAggregation = ["concatenate", "weighted_concat", "merge_structured", "owner_review"];
  const aggregation = validAggregation.includes(bundle.aggregation)
    ? (bundle.aggregation as "concatenate" | "weighted_concat" | "merge_structured" | "owner_review")
    : "owner_review";

  // We need to import lazily to avoid pulling agent-network.ts into
  // top-of-file. Type assertion is safe because we validate the
  // shape above; the parse layer will catch drift on production data.
  const parts = bundle.parts.map((p) => ({
    subtaskId: p.subtaskId,
    workerPeerId: p.workerPeerId,
    workerOwnerId: p.workerOwnerId,
    weight: p.weight,
    ...(p.note ? { note: p.note } : {}),
    artifact: a2aPartToEnvoyArtifact(p.artifact),
  }));
  void parent; // parent kept for future expansion (e.g. metadata pass-through)
  return {
    kind: "composite",
    parts,
    aggregation,
    createdAt: bundle.createdAt,
  } as unknown as Artifact;
}

function stripTrailingSlash(url: string): string {
  if (!url) return "";
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function readString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!metadata) return undefined;
  const v = metadata[key];
  return typeof v === "string" ? v : undefined;
}