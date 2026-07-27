import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CAPABILITY_MANIFEST_FILE = "capability-manifest.json";

/**
 * Visibility level for the capability manifest.
 * - "contacts-only" — respond only to referred/direct trust peers
 * - "public-preview" — respond to public peers with safe preview only (no LLM)
 * - "public-auto-answer" — respond to public peers with auto-answer (requires LLM)
 */
export type ManifestVisibility = "contacts-only" | "public-preview" | "public-auto-answer";

/**
 * Owner-approved capability manifest describing what the node is willing to do
 * for contact-scoped discovery matching.
 */
export interface CapabilityManifest {
  version: "0.1";
  /** Unique identifier for this manifest (changes when manifest is updated). */
  id: string;
  /** Semantic version string. */
  versionTag: string;
  /** Who can receive matches from this manifest. */
  visibility: ManifestVisibility;
  /**
   * Sensitivity ceiling for this manifest.
   * Requests above this ceiling are not answered even if capabilities match.
   */
  sensitivityCeiling: "public" | "friends" | "private";
  /**
   * Freeform keywords describing this node's capabilities.
   * Matched against keyword hashes in discovery requests.
   */
  keywords: string[];
  /**
   * Specific EMP capabilities this node exposes.
   * Overrides the device certificate capabilities for discovery matching.
   */
  capabilities: string[];
  /**
   * Owner-provided description of this node (shown in discovery).
   */
  description?: string;
  /**
   * Timestamp when the owner approved this manifest.
   */
  approvedAt: string;
  /** Timestamp of last update. */
  updatedAt: string;
}

export interface CreateCapabilityManifestInput {
  visibility?: ManifestVisibility;
  sensitivityCeiling?: CapabilityManifest["sensitivityCeiling"];
  keywords?: string[];
  capabilities?: string[];
  description?: string;
}

const DEFAULT_MANIFEST_CAPABILITIES = [
  "mesh.listen",
  "mesh.discovery",
  "message.send",
  "device.sync",
  "knowledge.query",
  "chat.assist",
];

const DEFAULT_KEYWORDS = [
  "messaging",
  "knowledge",
  "assistant",
  "p2p",
  "secure",
];

export interface CapabilityManifestStore {
  loadManifest(): Promise<CapabilityManifest | undefined>;
  saveManifest(manifest: CapabilityManifest): Promise<void>;
  createDefaultManifest(input?: CreateCapabilityManifestInput): Promise<CapabilityManifest>;
}

export function createCapabilityManifestStore(profileDir: string): CapabilityManifestStore {
  const manifestPath = join(profileDir, CAPABILITY_MANIFEST_FILE);

  return {
    async loadManifest(): Promise<CapabilityManifest | undefined> {
      try {
        return JSON.parse(await readFile(manifestPath, "utf8")) as CapabilityManifest;
      } catch (error) {
        if (isMissingFileError(error)) {
          return undefined;
        }
        throw error;
      }
    },

    async saveManifest(manifest: CapabilityManifest): Promise<void> {
      await mkdir(dirname(manifestPath), { recursive: true });
      const content = JSON.stringify(manifest, null, 2) + "\n";
      // Verify it round-trips before writing
      JSON.parse(content);
      const tmpPath = `${manifestPath}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
      await writeFile(tmpPath, content, { mode: 0o600 });
      await rename(tmpPath, manifestPath);
    },

    async createDefaultManifest(
      input: CreateCapabilityManifestInput = {},
    ): Promise<CapabilityManifest> {
      const now = new Date().toISOString();
      const manifest: CapabilityManifest = {
        version: "0.1",
        id: randomUUID(),
        versionTag: "0.2.1",
        visibility: input.visibility ?? "contacts-only",
        sensitivityCeiling: input.sensitivityCeiling ?? "friends",
        keywords: input.keywords ?? DEFAULT_KEYWORDS,
        capabilities: input.capabilities ?? DEFAULT_MANIFEST_CAPABILITIES,
        description: input.description,
        approvedAt: now,
        updatedAt: now,
      };
      await this.saveManifest(manifest);
      return manifest;
    },
  };
}

/**
 * Check if a discovery request's sensitivity level is allowed by the manifest's ceiling.
 */
export function sensitivityAllowed(
  requestedSensitivity: string,
  ceiling: CapabilityManifest["sensitivityCeiling"],
): boolean {
  const level: Record<string, number> = {
    public: 0,
    friends: 1,
    private: 2,
  };
  return (level[requestedSensitivity] ?? 0) <= (level[ceiling] ?? 0);
}

/**
 * Match manifest keywords against a set of requested keyword hashes.
 * Returns true if any requested hash matches a keyword (case-insensitive).
 */
export function keywordsMatch(
  manifestKeywords: string[],
  requestedKeywordHashes: string[],
): boolean {
  if (requestedKeywordHashes.length === 0) {
    return true; // No keyword constraint
  }
  if (manifestKeywords.length === 0) {
    return false;
  }
  // Simple hash: lowercase keyword -> same lowercase hash (for in-memory matching)
  const manifestHashes = new Set(manifestKeywords.map((k) => k.toLowerCase()));
  return requestedKeywordHashes.some((h) => manifestHashes.has(h.toLowerCase()));
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}
