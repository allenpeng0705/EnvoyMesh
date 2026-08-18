/**
 * Inbound `adapter.manifest` handler (Sprint 3, first cut).
 *
 * Receives a peer's owner-signed `SignedCapabilityManifest` broadcast,
 * validates it (schema + identity binding + owner signature when the owner
 * public key is known), and stores it in the local manifest store
 * (`ChainSideState.remoteManifests`) so the worker pool can prefer wire
 * manifests over card-synthesized ones.
 *
 * Security (design §4.1): the manifest is signed with the owner's Ed25519
 * key. The receiver verifies against the owner public key from the contact
 * key store (populated by profile.sync / social.intro). When the owner key
 * is not known yet, the manifest is dropped — never trusted unverified.
 *
 * Design doc: `docs/improving-agent-network.en.md` §3.1, §4.1.
 */

import {
  SignedCapabilityManifestSchema,
  type EnvoyEnvelope,
  type SignedCapabilityManifest,
} from "@envoymesh/protocol";
import { verifyCanonicalPayload } from "@envoymesh/identity";

/** A manifest whose `issuedAt + ttlSeconds` has not elapsed. */
export function isManifestFresh(
  manifest: SignedCapabilityManifest,
  now: Date = new Date(),
): boolean {
  const issuedAt = Date.parse(manifest.issuedAt);
  if (Number.isNaN(issuedAt)) return false;
  return now.getTime() - issuedAt < manifest.ttlSeconds * 1000;
}

export interface HandleInboundCapabilityManifestInput {
  envelope: EnvoyEnvelope;
  /** Manifest store keyed by the sender's agent peerId. */
  store: Map<string, SignedCapabilityManifest>;
  /** Resolve a peer's owner public key PEM from its ownerId. */
  getOwnerPublicKey: (ownerId: string) => Promise<string | undefined>;
  now?: () => Date;
}

export type HandleInboundCapabilityManifestResult =
  | { handled: true }
  | { handled: false; reason: string };

export async function handleInboundCapabilityManifest(
  input: HandleInboundCapabilityManifestInput,
): Promise<HandleInboundCapabilityManifestResult> {
  if (input.envelope.intent !== "adapter.manifest") {
    return { handled: false, reason: "intent mismatch" };
  }

  let manifest: SignedCapabilityManifest;
  try {
    manifest = SignedCapabilityManifestSchema.parse(input.envelope.payload);
  } catch {
    return { handled: false, reason: "invalid manifest schema" };
  }

  // Identity binding: the manifest's peerId must match the envelope sender.
  if (manifest.peerId !== input.envelope.senderPeerId) {
    return { handled: false, reason: "manifest peerId does not match envelope sender" };
  }

  const ownerPublicKeyPem = await input.getOwnerPublicKey(manifest.ownerId);
  if (!ownerPublicKeyPem) {
    return { handled: false, reason: "owner public key unknown — cannot verify" };
  }
  const { signature: _signature, ...unsigned } = manifest;
  if (!verifyCanonicalPayload(unsigned, manifest.signature, ownerPublicKeyPem)) {
    return { handled: false, reason: "manifest signature verification failed" };
  }

  if (!isManifestFresh(manifest, (input.now ?? (() => new Date()))())) {
    return { handled: false, reason: "manifest expired" };
  }

  input.store.set(manifest.peerId, manifest);
  return { handled: true };
}
