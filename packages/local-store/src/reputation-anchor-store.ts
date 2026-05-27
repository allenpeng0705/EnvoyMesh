import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const REPUTATION_ANCHOR_BUNDLE_FILE = "reputation-anchors.json";

export interface ReputationAttestation {
  attestationId: string;
  anchorId: string;
  anchorName: string;
  subjectOwnerId: string;
  claim: string;
  issuedAt: string;
  expiresAt?: string;
  /** Optional URL or cid for anchor public key / policy doc */
  anchorRef?: string;
}

export interface ReputationAnchorBundle {
  version: "0.1";
  updatedAt: string;
  attestations: ReputationAttestation[];
}

export interface ReputationAnchorStore {
  listAttestations(subjectOwnerId?: string): Promise<ReputationAttestation[]>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readBundle(path: string): Promise<ReputationAnchorBundle> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ReputationAnchorBundle;
    if (parsed.version === "0.1" && Array.isArray(parsed.attestations)) {
      return parsed;
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return { version: "0.1", updatedAt: new Date(0).toISOString(), attestations: [] };
}

export function createReputationAnchorStore(profileDir: string): ReputationAnchorStore {
  const path = join(profileDir, REPUTATION_ANCHOR_BUNDLE_FILE);

  return {
    async listAttestations(subjectOwnerId) {
      const bundle = await readBundle(path);
      const needle = subjectOwnerId?.trim();
      if (!needle) return bundle.attestations;
      const now = Date.now();
      return bundle.attestations.filter((row) => {
        if (row.subjectOwnerId !== needle) return false;
        if (row.expiresAt && new Date(row.expiresAt).getTime() < now) return false;
        return true;
      });
    },
  };
}
