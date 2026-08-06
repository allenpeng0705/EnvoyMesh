/**
 * Runtime helpers for Fleet Manifest (Phase 35B).
 *
 * The walker is intentionally side-effect-light: for each member it stages a
 * `TrustRecord` + a `PeerDirectory` row. There is no wire exchange. The
 * joiner will fill in their own `peerId`/`listenAddrs` on first contact.
 *
 * Why pre-stage at all? Because the existing `acceptHello` path (manual
 * approval) requires operator interaction for every `bond.request` from a
 * unknown peer. Pre-staging makes the joiner's first `bond.request` auto-accept
 * to the level the manifest specifies.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  deriveOwnerId,
  derivePeerId,
  signCanonicalPayload,
  verifyCanonicalPayload,
} from "@envoymesh/identity";
import {
  fleetManifestForSigning,
  type FleetManifest,
  type FleetMember,
  type UnsignedFleetManifest,
} from "@envoymesh/protocol";
import type {
  CreateFleetManifestInput,
  CreateFleetManifestResult,
  FleetManifestRecord,
  ImportFleetManifestOutcome,
  ImportFleetManifestParams,
  ImportFleetManifestResult,
  ImportFleetManifestSkipped,
  RevokeFleetManifestResult,
} from "@envoymesh/api";
import type { LocalTrustStore, LocalPeerDirectoryStore } from "@envoymesh/local-store";
import type { BondLevel } from "@envoymesh/bonds";
import type { NodeProfile } from "@envoymesh/api";
import { createAuditEvent } from "@envoymesh/local-store";

const MAX_FLEET_MEMBERS = 1024;
const NOTE_MANIFEST_PREFIX = "fleet-manifest:";
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface FleetManifestRuntimeContext {
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  manifestStore: {
    saveFleetManifest: (record: FleetManifestRecord) => Promise<FleetManifestRecord>;
    getFleetManifest: (manifestId: string) => Promise<FleetManifestRecord | null>;
    listFleetManifests: () => Promise<FleetManifestRecord[]>;
    revokeFleetManifest: (
      manifestId: string,
      at: string,
    ) => Promise<FleetManifestRecord | null>;
  };
  /** Local node profile. */
  profile: NodeProfile | null;
  /** Override the wall clock for tests. */
  now?: () => Date;
  /** Audit appender — receives `bond.pre_staged` events. Optional. */
  appendAudit?: (event: ReturnType<typeof createAuditEvent>) => Promise<void> | void;
  /**
   * Auto-enable `capabilityProviderEnabled` on this node. Called when the
   * manifest has `autoJoinAgentNetwork: true` and the node hasn't already
   * opted in. Optional — if not provided, the auto-join is skipped.
   */
  enableCapabilityProvider?: () => Promise<void>;
}

function fingerprintPem(pem: string): string {
  return createHash("sha256").update(pem).digest("hex").slice(0, 16);
}

function fingerprintSignature(signature: string): string {
  return createHash("sha256").update(signature).digest("hex").slice(0, 16);
}

function toBondLevel(level: FleetMember["trustLevel"]): Exclude<BondLevel, "self"> {
  // FleetMemberTrustLevelSchema only allows direct/referred/public/blocked,
  // and `TrustRecord.level` excludes "self" (the local owner), so this is a
  // safe narrowing.
  return level;
}

function nowIso(now: () => Date): string {
  return now().toISOString();
}

export async function importFleetManifestViaRuntime(
  ctx: FleetManifestRuntimeContext,
  params: ImportFleetManifestParams,
): Promise<ImportFleetManifestOutcome> {
  const now = ctx.now ?? (() => new Date());
  const { manifest } = params;
  const force = params.force === true;

  if (!manifest || typeof manifest !== "object") {
    return { ok: false, reason: "malformed", detail: "manifest missing" };
  }
  if (manifest.version !== "0.1") {
    return { ok: false, reason: "malformed", detail: `unsupported version: ${manifest.version}` };
  }
  if (!Array.isArray(manifest.members) || manifest.members.length === 0) {
    return { ok: false, reason: "malformed", detail: "manifest has no members" };
  }
  if (manifest.members.length > MAX_FLEET_MEMBERS) {
    return {
      ok: false,
      reason: "limit-exceeded",
      detail: `manifest has ${manifest.members.length} members; max is ${MAX_FLEET_MEMBERS}`,
    };
  }
  if (manifest.expiresAt && Date.parse(manifest.expiresAt) <= now().getTime()) {
    return { ok: false, reason: "expired", detail: `manifest expired at ${manifest.expiresAt}` };
  }

  // Verify the signature. We use `fleetManifestForSigning` (rather than an
  // inline destructure) so any future change to the canonical form stays
  // in sync with the signer.
  const { signature } = manifest;
  const forSig = fleetManifestForSigning(manifest);
  const sigOk = verifyCanonicalPayload(forSig, signature, manifest.issuerOwnerPublicKeyPem);
  if (!sigOk) {
    return { ok: false, reason: "invalid-signature", detail: "signature does not verify" };
  }

  // Sanity: deriveOwnerId(issuerOwnerPublicKeyPem) === manifest.issuerOwnerId
  const derivedIssuerId = deriveOwnerIdOrThrow(manifest.issuerOwnerPublicKeyPem);
  if (derivedIssuerId !== manifest.issuerOwnerId) {
    return {
      ok: false,
      reason: "issuer-mismatch",
      detail: `derived ${derivedIssuerId} != claimed ${manifest.issuerOwnerId}`,
    };
  }

  // Reject self-bond attempts (the manifest asking us to trust ourselves).
  // If the local node has no profile at all, refuse the import rather than
  // silently skipping the self-bond check — a half-initialized node should
  // not be silently trusting a roster.
  const localOwnerId = ctx.profile?.owner?.ownerId;
  if (!localOwnerId) {
    return {
      ok: false,
      reason: "malformed",
      detail: "local node has no owner identity; cannot safely import a fleet manifest",
    };
  }
  const selfMembers = manifest.members.filter((m) => m.ownerId === localOwnerId);
  if (selfMembers.length > 0) {
    return {
      ok: false,
      reason: "self-bond",
      detail: `manifest includes local owner ${localOwnerId}`,
    };
  }

  // Idempotency: if this manifest was already imported, report it.
  const existing = await ctx.manifestStore.getFleetManifest(manifest.manifestId);
  if (existing && existing.revokedAt) {
    return {
      ok: false,
      reason: "invalid-signature",
      detail: "manifest has been revoked locally",
    };
  }

  const ownerIdCounts = new Map<string, number>();
  for (const m of manifest.members) {
    ownerIdCounts.set(m.ownerId, (ownerIdCounts.get(m.ownerId) ?? 0) + 1);
  }
  const duplicateOwners = new Set<string>();
  for (const [ownerId, count] of ownerIdCounts.entries()) {
    if (count > 1) duplicateOwners.add(ownerId);
  }

  let added = 0;
  let updated = 0;
  const skipped: ImportFleetManifestSkipped[] = [];
  const preStagedOwnerIds: string[] = [];
  const nowStamp = nowIso(now);

  // Persist the manifest record *before* the walker so a mid-import crash
  // leaves a recoverable record. The operator can then re-import with
  // `force: true` to pick up where it left off; the walker already treats
  // "already imported" rows as no-ops, so the resume is safe.
  const partialRecord: FleetManifestRecord = {
    manifestId: manifest.manifestId,
    issuerOwnerId: manifest.issuerOwnerId,
    label: manifest.label,
    issuerOwnerFingerprint: fingerprintPem(manifest.issuerOwnerPublicKeyPem),
    signatureFingerprint: fingerprintSignature(manifest.signature),
    issuedAt: manifest.issuedAt,
    expiresAt: manifest.expiresAt ?? undefined,
    importedAt: existing?.importedAt ?? nowStamp,
    lastReimportedAt: existing ? nowStamp : undefined,
    memberCount: manifest.members.length,
    preStagedOwnerIds: existing?.preStagedOwnerIds ?? [],
  };
  await ctx.manifestStore.saveFleetManifest(partialRecord);

  const duplicateReported = new Set<string>();
  for (const member of manifest.members) {
    // Resume-friendly: if a previous run already staged this member, skip
    // unless `force` is set.
    if (
      !force &&
      existing?.preStagedOwnerIds?.includes(member.ownerId)
    ) {
      skipped.push({ ownerId: member.ownerId, reason: "already-imported" });
      preStagedOwnerIds.push(member.ownerId);
      continue;
    }
    if (duplicateOwners.has(member.ownerId)) {
      if (!duplicateReported.has(member.ownerId)) {
        skipped.push({
          ownerId: member.ownerId,
          reason: "duplicate-owner",
          detail: `manifest lists ${ownerIdCounts.get(member.ownerId)} devices for the same owner`,
        });
        duplicateReported.add(member.ownerId);
      }
      continue;
    }
    try {
      const existingTrust = await ctx.trustStore.getTrustRecord(member.ownerId);
      const existingFromManifest = existingTrust?.note?.startsWith(NOTE_MANIFEST_PREFIX);
      if (existingFromManifest && !force) {
        skipped.push({ ownerId: member.ownerId, reason: "already-imported" });
        preStagedOwnerIds.push(member.ownerId);
        continue;
      }
      const note = `${NOTE_MANIFEST_PREFIX}${manifest.manifestId}:${member.role}`;
      await ctx.trustStore.setTrustRecord({
        peerOwnerId: member.ownerId,
        level: toBondLevel(member.trustLevel),
        displayName: member.displayName,
        note: member.note ? `${note} — ${member.note}` : note,
        now: nowStamp,
      });
      // Pre-fill a placeholder peer-directory row so `ensurePeerByPeerId` can
      // resolve the device's libp2p id once the joiner is online.
      try {
        const peerId = derivePeerId(member.devicePublicKeyPem);
        await ctx.peerDirectoryStore.ensurePeerFromInboundChat({
          ownerId: member.ownerId,
          peerId,
          listenAddrs: [],
        });
      } catch (err) {
        // Non-fatal: the joiner will fill this in on first contact.
        if (ctx.appendAudit) {
          await ctx.appendAudit(
            createAuditEvent({
              type: "bond.pre_staged_failed",
              intent: "bond.request",
              outcome: "record",
              summary: `fleet-manifest: peer directory pre-fill failed for ${member.ownerId}: ${
                err instanceof Error ? err.message : String(err)
              }`,
              correlationId: manifest.manifestId,
              remotePeerId: member.ownerId,
            }),
          );
        }
      }
      preStagedOwnerIds.push(member.ownerId);
      // Persist progress after every successful stage so a crash mid-walk
      // leaves a record of what landed.
      await ctx.manifestStore.saveFleetManifest({
        ...partialRecord,
        preStagedOwnerIds: [...preStagedOwnerIds],
      });
      if (existingFromManifest) updated += 1;
      else added += 1;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      skipped.push({
        ownerId: member.ownerId,
        reason: "internal-error",
        detail: `role=${member.role}: ${detail}`,
      });
      if (ctx.appendAudit) {
        await ctx.appendAudit(
          createAuditEvent({
            type: "agent.card.auto_fetch_failed",
            intent: "bond.request",
            outcome: "deny",
            summary: `Fleet manifest ${manifest.manifestId}: failed to stage ${member.ownerId} (role=${member.role}) — ${detail}`,
            correlationId: manifest.manifestId,
            remotePeerId: member.ownerId,
          }),
        );
      }
    }
  }

  const record: FleetManifestRecord = {
    ...partialRecord,
    preStagedOwnerIds,
  };
  await ctx.manifestStore.saveFleetManifest(record);

  if (ctx.appendAudit) {
    await ctx.appendAudit(
      createAuditEvent({
        type: "bond.pre_staged",
        intent: "bond.request",
        outcome: "record",
        summary: `Fleet manifest ${manifest.manifestId} applied; +${added} new, ${updated} updated, ${skipped.length} skipped`,
        correlationId: manifest.manifestId,
        remotePeerId: manifest.issuerOwnerId,
      }),
    );
  }

  // Auto-join Agent Network: when the manifest carries `autoJoinAgentNetwork:
  // true`, auto-enable `capabilityProviderEnabled` on this node so it
  // participates as a chain worker without a manual toggle. This is the
  // fleet-onboarding "one-click agent network" signal.
  if (manifest.autoJoinAgentNetwork === true && ctx.enableCapabilityProvider) {
    try {
      await ctx.enableCapabilityProvider();
      if (ctx.appendAudit) {
        await ctx.appendAudit(
          createAuditEvent({
            type: "bond.pre_staged",
            intent: "bond.request",
            outcome: "record",
            summary: `Fleet manifest ${manifest.manifestId}: auto-enabled Agent Network (capabilityProvider).`,
            correlationId: manifest.manifestId,
          }),
        );
      }
    } catch (err) {
      // Non-fatal: the manifest import succeeded; only the auto-join failed.
      if (ctx.appendAudit) {
        await ctx.appendAudit(
          createAuditEvent({
            type: "agent.card.auto_fetch_failed",
            intent: "bond.request",
            outcome: "record",
            summary: `Fleet manifest ${manifest.manifestId}: auto-join Agent Network failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
            correlationId: manifest.manifestId,
          }),
        );
      }
    }
  }

  const result: ImportFleetManifestResult = {
    ok: true,
    manifestId: manifest.manifestId,
    added,
    updated,
    skipped,
    record,
  };
  return result;
}

export async function listFleetManifestsViaRuntime(
  ctx: FleetManifestRuntimeContext,
): Promise<FleetManifestRecord[]> {
  return ctx.manifestStore.listFleetManifests();
}

export async function revokeFleetManifestViaRuntime(
  ctx: FleetManifestRuntimeContext,
  manifestId: string,
): Promise<RevokeFleetManifestResult | { ok: false; reason: string }> {
  const now = ctx.now ?? (() => new Date());
  const stamp = nowIso(now);
  const existing = await ctx.manifestStore.getFleetManifest(manifestId);
  if (!existing) {
    return { ok: false, reason: "not-found" };
  }
  let cleared = 0;
  // Drop the trust records that the manifest pre-staged. We leave any
  // trust records the user upgraded afterwards alone — they may have
  // graduated from "fleet manifest" to "personal bond" by accepting
  // hello or sharing a document.
  for (const ownerId of existing.preStagedOwnerIds) {
    const trust = await ctx.trustStore.getTrustRecord(ownerId);
    if (!trust) continue;
    const isFromManifest = trust.note?.startsWith(`${NOTE_MANIFEST_PREFIX}${manifestId}:`);
    if (!isFromManifest) continue;
    // Reset to a no-bonds-known state by setting level=public, no note.
    await ctx.trustStore.setTrustRecord({
      peerOwnerId: ownerId,
      level: "public",
      displayName: trust.displayName,
      note: `revoked from fleet-manifest ${manifestId}`,
      now: stamp,
    });
    cleared += 1;
  }
  await ctx.manifestStore.revokeFleetManifest(manifestId, stamp);
  if (ctx.appendAudit) {
    await ctx.appendAudit(
      createAuditEvent({
        type: "bond.revoked",
        intent: "bond.request",
        outcome: "record",
        summary: `Fleet manifest ${manifestId} revoked; ${cleared} trust records reset`,
        correlationId: manifestId,
        remotePeerId: existing.issuerOwnerId,
      }),
    );
  }
  return { ok: true, manifestId, cleared };
}

export interface CreateFleetManifestRuntimeContext {
  profile: NodeProfile | null;
  now?: () => Date;
  /** Override `randomUUID` for tests. */
  randomUUID?: () => string;
  /** Default TTL when caller doesn't supply one. */
  defaultTtlMs?: number;
}

export async function createFleetManifestViaRuntime(
  ctx: CreateFleetManifestRuntimeContext,
  input: CreateFleetManifestInput,
): Promise<CreateFleetManifestResult | { ok: false; reason: string; detail?: string }> {
  const now = ctx.now ?? (() => new Date());
  const randUuid = ctx.randomUUID ?? randomUUID;
  const owner = ctx.profile?.owner;
  if (!owner) {
    return { ok: false, reason: "no-owner", detail: "local node has no owner identity" };
  }
  if (!owner.privateKeyPem) {
    return {
      ok: false,
      reason: "no-private-key",
      detail: "local node has no private key (read-only node?)",
    };
  }
  if (input.issuerOwnerPublicKeyPem && input.issuerOwnerPublicKeyPem !== owner.publicKeyPem) {
    return {
      ok: false,
      reason: "issuer-mismatch",
      detail: "issuerOwnerPublicKeyPem does not match the local owner key",
    };
  }
  if (!Array.isArray(input.members) || input.members.length === 0) {
    return { ok: false, reason: "malformed", detail: "no members" };
  }
  if (input.members.length > MAX_FLEET_MEMBERS) {
    return { ok: false, reason: "limit-exceeded", detail: `too many members: ${input.members.length}` };
  }
  const manifestId = input.manifestId ?? randUuid();
  const ttl = ctx.defaultTtlMs ?? DEFAULT_TTL_MS;
  const expiresAt = input.expiresAt ?? new Date(now().getTime() + ttl).toISOString();
  const unsigned: UnsignedFleetManifest = {
    version: "0.1",
    manifestId,
    issuerOwnerId: owner.ownerId,
    issuerOwnerPublicKeyPem: owner.publicKeyPem,
    label: input.label,
    issuedAt: now().toISOString(),
    expiresAt,
    members: input.members,
    autoJoinAgentNetwork: input.autoJoinAgentNetwork === true ? true : undefined,
  };
  const signature = signCanonicalPayload(
    fleetManifestForSigning({ ...unsigned, signature: "" }),
    owner.privateKeyPem,
  );
  const manifest: FleetManifest = { ...unsigned, signature };
  return { manifest };
}

function deriveOwnerIdOrThrow(pem: string): string {
  return deriveOwnerId(pem);
}
