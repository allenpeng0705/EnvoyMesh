import { signUnsignedEnvelope } from "@envoymesh/identity";
import {
  createProfileRequestPayload,
  createProfileSyncPayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type HumanProfilePayload,
} from "@envoymesh/protocol";
import type { NodeProfile } from "@envoymesh/api";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  ENVOY_MESSAGE_PROTOCOL,
  hasDirectTcpDialHints,
  isRelayReservationDialError,
} from "@envoymesh/network";
import { derivePeerId } from "@envoymesh/identity";
import { shouldPreferCircuitDialHints } from "./outbound-dial-hints.js";
import { loadProfileThumbnailInline } from "./profile-thumbnail-inline.js";

const PROFILE_SYNC_MAX_ATTEMPTS = 3;
const PROFILE_SYNC_RETRY_BASE_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildSignedProfilePayloadEnvelope(input: {
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  intent: "profile.sync" | "profile.response";
  recipientPeerId?: string;
}): Promise<EnvoyEnvelope> {
  const publicThumbnailInline = await loadProfileThumbnailInline(input.vaultDir, input.humanProfile);
  const payload = createProfileSyncPayload(
    input.humanProfile,
    publicThumbnailInline,
    input.profile.owner.publicKeyPem,
  );
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.recipientPeerId,
    recipientRole: "human",
    intent: input.intent,
    payload,
  });
  return signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
}

/** libp2p peer ids start with `12D3KooW` (base58btc); envelope ids use `envoy_`. */
export function isLibp2pPeerId(peerId: string): boolean {
  const id = peerId.trim();
  return id.length > 0 && !id.startsWith("envoy_") && !id.startsWith("envoy:");
}

type ProfileSyncMesh = Pick<
  EnvoyMesh,
  "send" | "closeConnectionsToPeer" | "ensurePeerReachable" | "mergePeerStoreDialHints"
>;

async function sendProfileSyncWithReachability(input: {
  mesh: ProfileSyncMesh;
  ownerId: string;
  peerId: string;
  envelope: EnvoyEnvelope;
  dialHints: string[];
  listenAddrs?: string[];
  protocol?: string;
  rebuildDialHints?: () => Promise<string[]>;
}): Promise<void> {
  const protocol = input.protocol ?? ENVOY_MESSAGE_PROTOCOL;
  const preferCircuits = shouldPreferCircuitDialHints(
    input.listenAddrs,
    input.dialHints,
    input.peerId,
  );
  let dialHints = input.dialHints;
  let lastErr: unknown;

  for (let attempt = 0; attempt < PROFILE_SYNC_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(PROFILE_SYNC_RETRY_BASE_MS * attempt);
      if (input.rebuildDialHints) {
        try {
          dialHints = await input.rebuildDialHints();
        } catch {
          /* keep previous hints */
        }
      }
      try {
        const closed = await input.mesh.closeConnectionsToPeer?.(input.peerId);
        if (closed && closed > 0) {
          console.log(
            `[profile.sync] closed ${closed} stale connection(s) to ${input.peerId.slice(0, 12)}… before retry ${attempt + 1}`,
          );
        }
      } catch {
        /* ignore */
      }
    }

    const forceFreshDial = attempt > 0;

    try {
      if (typeof input.mesh.ensurePeerReachable === "function") {
        await input.mesh.ensurePeerReachable(input.peerId, protocol, {
          dialHints,
          preferCircuitHints: preferCircuits,
          forceFreshDial,
        });
      }
      await input.mesh.send(input.peerId, input.envelope, {
        dialHints,
        preferCircuitHints: preferCircuits,
        forceFreshDial,
      });
      if (attempt > 0) {
        console.log(
          `[profile.sync] delivered to ${input.ownerId.slice(0, 16)}… on attempt ${attempt + 1}/${PROFILE_SYNC_MAX_ATTEMPTS}`,
        );
      }
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < PROFILE_SYNC_MAX_ATTEMPTS - 1) {
        console.warn(
          `[profile.sync] send to ${input.ownerId.slice(0, 16)}… failed, retrying:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  const directCount = dialHints.filter(
    (h) => h.includes("/tcp/") && !h.includes("/p2p-circuit/"),
  ).length;
  const circuitCount = dialHints.filter((h) => h.includes("/p2p-circuit/")).length;
  const hintSummary = `direct=${directCount} circuit=${circuitCount}`;
  const reservationMiss = isRelayReservationDialError(lastErr);
  const reachabilityHint =
    !preferCircuits && hasDirectTcpDialHints(dialHints)
      ? "direct LAN path failed — check Windows firewall on libp2p TCP port"
      : reservationMiss
        ? "stale relay reservation — ask contact to send you a chat message once (learns LAN route)"
        : "peer unreachable";
  console.warn(
    `[profile.sync] send to ${input.ownerId.slice(0, 16)}… failed after retry (${hintSummary}; ${reachabilityHint}):`,
    lastErr,
  );
}

export async function sendProfileSyncToBonds(input: {
  mesh: ProfileSyncMesh;
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  bondOwnerIds: string[];
  resolveLibp2pPeer: (
    ownerId: string,
  ) => Promise<{ peerId: string; listenAddrs?: string[] } | undefined>;
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
  if (!input.humanProfile.publicThumbnail) return;
  const envelope = await buildSignedProfilePayloadEnvelope({
    profile: input.profile,
    humanProfile: input.humanProfile,
    vaultDir: input.vaultDir,
    intent: "profile.sync",
  });
  for (const ownerId of input.bondOwnerIds) {
    try {
      const resolved = await input.resolveLibp2pPeer(ownerId);
      if (!resolved?.peerId || !isLibp2pPeerId(resolved.peerId)) {
        console.warn(`[profile.sync] skip bond ${ownerId.slice(0, 20)}…: no libp2p peer id`);
        continue;
      }

      let dialHints: string[];
      try {
        dialHints = await input.dialHintsFor(resolved.peerId, resolved.listenAddrs);
      } catch (hintErr) {
        console.warn(
          `[profile.sync] dial hints failed for ${ownerId.slice(0, 16)}…:`,
          hintErr instanceof Error ? hintErr.message : hintErr,
        );
        continue;
      }

      if (typeof input.mesh.mergePeerStoreDialHints === "function") {
        void Promise.resolve(
          input.mesh.mergePeerStoreDialHints(resolved.peerId, dialHints),
        ).catch((err) => console.warn(`[profile.sync] mergePeerStoreDialHints failed:`, err));
      }

      await sendProfileSyncWithReachability({
        mesh: input.mesh,
        ownerId,
        peerId: resolved.peerId,
        envelope,
        dialHints,
        listenAddrs: resolved.listenAddrs,
        rebuildDialHints: () => input.dialHintsFor(resolved.peerId, resolved.listenAddrs),
      });
    } catch (bondErr) {
      console.warn(
        `[profile.sync] bond ${ownerId.slice(0, 20)}… failed:`,
        bondErr instanceof Error ? bondErr.message : bondErr,
      );
    }
  }
}

export async function sendProfileRequest(input: {
  mesh: Pick<EnvoyMesh, "send" | "sendExpectReply">;
  profile: NodeProfile;
  /** libp2p peer id used for mesh dial */
  transportPeerId: string;
  /** Envelope routing id (typically `envoy_*` from the contact device key) */
  envelopeRecipientPeerId: string;
  listenAddrs?: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
  timeoutMs?: number;
}): Promise<EnvoyEnvelope> {
  if (!isLibp2pPeerId(input.transportPeerId)) {
    throw new Error("profile.request requires a libp2p transport peer id");
  }
  const payload = createProfileRequestPayload(input.profile.owner.ownerId);
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.profile.device.publicKeyPem),
    senderPublicKey: input.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: input.envelopeRecipientPeerId,
    recipientRole: "human",
    intent: "profile.request",
    payload,
  });
  const envelope = signUnsignedEnvelope(unsigned, input.profile.device.privateKeyPem);
  const dialHints = await input.dialHintsFor(input.transportPeerId, input.listenAddrs);
  const preferCircuits = shouldPreferCircuitDialHints(input.listenAddrs, dialHints, input.transportPeerId);
  const timeoutMs = input.timeoutMs ?? 30_000;
  if (typeof input.mesh.sendExpectReply !== "function") {
    await input.mesh.send(input.transportPeerId, envelope, { dialHints, preferCircuitHints: preferCircuits });
    throw new Error("profile.request requires sendExpectReply on mesh");
  }
  const reply = await input.mesh.sendExpectReply(input.transportPeerId, envelope, {
    timeoutMs,
    dialHints,
    preferCircuitHints: preferCircuits,
  });
  if (reply.intent !== "profile.response") {
    throw new Error(`profile.request: expected profile.response, got ${reply.intent}`);
  }
  return reply;
}

export async function sendProfileResponse(input: {
  mesh: EnvoyMesh;
  profile: NodeProfile;
  humanProfile: HumanProfilePayload;
  vaultDir: string;
  /** Envelope `recipientPeerId` (requester's `envoy_*` sender id) */
  envelopeRecipientPeerId: string;
  /** libp2p peer id from the inbound connection (mesh dial target) */
  transportPeerId: string;
  listenAddrs?: string[];
  dialHintsFor: (peerId: string, listenAddrs?: string[]) => Promise<string[]>;
}): Promise<void> {
  if (!isLibp2pPeerId(input.transportPeerId)) {
    throw new Error("profile.response requires a libp2p transport peer id");
  }
  const envelope = await buildSignedProfilePayloadEnvelope({
    profile: input.profile,
    humanProfile: input.humanProfile,
    vaultDir: input.vaultDir,
    intent: "profile.response",
    recipientPeerId: input.envelopeRecipientPeerId,
  });
  const dialHints = await input.dialHintsFor(input.transportPeerId, input.listenAddrs);
  const preferCircuits = shouldPreferCircuitDialHints(input.listenAddrs, dialHints, input.transportPeerId);
  await input.mesh.send(input.transportPeerId, envelope, { dialHints, preferCircuitHints: preferCircuits });
}
