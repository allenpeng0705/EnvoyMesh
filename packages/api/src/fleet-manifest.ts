/**
 * Fleet Manifest — Phase 35B (Fleet Onboarding B: Fleet Manifest Import).
 *
 * A `FleetManifest` is a signed roster of devices the operator wants
 * pre-bonded. The operator uploads the manifest to a node; the node walks the
 * roster and pre-stages `TrustRecord` + `PeerDirectory` entries so the joiners
 * are recognized on first contact.
 *
 * The manifest is signed by the issuer's owner key. The receiver verifies
 * `issuerOwnerId` matches `deriveOwnerId(issuerOwnerPublicKeyPem)` before
 * applying any trust changes.
 */
import type {
  FleetManifest,
  FleetMember,
  UnsignedFleetManifest,
} from "@envoymesh/protocol";

export type {
  FleetManifest,
  FleetMember,
  UnsignedFleetManifest,
} from "@envoymesh/protocol";

/** Persisted form of an imported manifest — stores the signature, label, and a one-line note for the audit log. */
export interface FleetManifestRecord {
  manifestId: string;
  issuerOwnerId: string;
  label?: string;
  /** Fingerprint of the issuer's owner public key (first 16 chars of `sha256(pem)`). Never log the PEM. */
  issuerOwnerFingerprint: string;
  /** First 8 chars of `sha256(manifest.signature)`. Useful for the audit log. */
  signatureFingerprint: string;
  issuedAt: string;
  expiresAt?: string;
  /** ISO timestamp of when this manifest was imported. */
  importedAt: string;
  /** ISO timestamp of the most recent re-import (if any). */
  lastReimportedAt?: string;
  /** ISO timestamp if the operator has marked this manifest as revoked locally. */
  revokedAt?: string;
  memberCount: number;
  /** List of ownerIds for which a trust record was pre-staged. */
  preStagedOwnerIds: string[];
}

export interface ImportFleetManifestParams {
  manifest: FleetManifest;
  /** If true, re-apply trust levels for already-bonded members. Default false (idempotent). */
  force?: boolean;
}

export interface ImportFleetManifestSkipped {
  ownerId: string;
  reason:
    | "already-imported"
    | "expired"
    | "invalid-signature"
    | "issuer-mismatch"
    | "duplicate-owner"
    | "internal-error";
  detail?: string;
}

export interface ImportFleetManifestResult {
  ok: true;
  manifestId: string;
  added: number;
  updated: number;
  skipped: ImportFleetManifestSkipped[];
  /** Resulting record, useful for the UI. */
  record: FleetManifestRecord;
}

export interface ImportFleetManifestFailure {
  ok: false;
  reason:
    | "invalid-signature"
    | "issuer-mismatch"
    | "expired"
    | "malformed"
    | "issuer-not-our-network"
    | "self-bond"
    | "limit-exceeded";
  detail?: string;
}

export type ImportFleetManifestOutcome =
  | ImportFleetManifestResult
  | ImportFleetManifestFailure;

export interface ListFleetManifestsResult {
  manifests: FleetManifestRecord[];
}

export interface RevokeFleetManifestResult {
  ok: true;
  manifestId: string;
  /** How many trust records were dropped. */
  cleared: number;
}

export interface FleetManifestSummary {
  manifestId: string;
  issuerOwnerId: string;
  issuerOwnerFingerprint: string;
  label?: string;
  issuedAt: string;
  expiresAt?: string;
  importedAt: string;
  revokedAt?: string;
  memberCount: number;
  preStagedOwnerIds: string[];
}

/** Inputs for `createFleetManifest` — the operator fills in the unsigned manifest, the runtime signs it. */
export interface CreateFleetManifestInput {
  manifestId?: string;
  label?: string;
  /** ISO ms epoch; default 90 days from now. */
  expiresAt?: string;
  members: FleetMember[];
  /** Owner public key of the issuer. Defaults to the local owner's public key. */
  issuerOwnerPublicKeyPem?: string;
}

export interface CreateFleetManifestResult {
  manifest: FleetManifest;
}
