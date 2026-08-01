/**
 * Company invite runtime — Phase 35A (Fleet Onboarding A: Company invite link).
 *
 * Mints long-lived invite tokens a joiner can paste into their Social UI to
 * complete a `pairDevice` handshake. The same `validatePairingToken` path
 * that already accepts QR-pairing tokens can accept these — we just
 * persist them in `LocalCompanyInviteStore` and add a lookup step.
 *
 * Lifecycle:
 *   created → (used|revoked|expired)
 * `usedAt` and `revokedAt` are set once and never cleared; consuming a
 * consumed invite is a no-op success.
 */

import { randomBytes, randomUUID } from "node:crypto";
import type { LocalTaskStore } from "@envoymesh/local-store";
import type {
  CompanyInviteRecord,
  CreateCompanyInviteParams,
  CreateCompanyInviteResult,
  ListCompanyInvitesResult,
  RevokeCompanyInviteResult,
} from "@envoymesh/api";
import { getPairingUriForInvite } from "./envoy-invite-uri.js";

const DEFAULT_EXPIRES_HOURS = 24 * 7; // 7 days
const MAX_EXPIRES_HOURS = 24 * 365; // 1 year
const TOKEN_BYTES = 32;

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function clampExpiryHours(hours: number | undefined): number {
  if (!hours || !Number.isFinite(hours) || hours <= 0) return DEFAULT_EXPIRES_HOURS;
  return Math.min(Math.floor(hours), MAX_EXPIRES_HOURS);
}

export interface CreateCompanyInviteDeps {
  taskStore: LocalTaskStore;
  /** Owner identity fingerprint (for `ownerId` field of the record). */
  ownerId: string;
  /** Public-key PEM (matches `getPairingPayload.ownerPublicKeyPem`). */
  ownerPublicKey?: string;
  /** Agent identity fields, copied from `getPairingPayload`. */
  agentPeerId?: string;
  agentName?: string;
  wsUrl: string;
  lanWsUrl?: string;
  relayWsUrl?: string;
  homeNodePeerId?: string;
  now?: () => Date;
}

/**
 * Runtime-only extensions (not part of the public RPC params surface).
 * `fixedToken` / `clearUsed` are for store-review family invites.
 */
export type CreateCompanyInviteRuntimeParams = CreateCompanyInviteParams & {
  /** Use this bearer token instead of generating one. */
  fixedToken?: string;
  /** When upserting by fixedToken, clear usedAt so the invite stays multi-device. */
  clearUsed?: boolean;
};

export async function createCompanyInviteViaRuntime(
  deps: CreateCompanyInviteDeps,
  params?: CreateCompanyInviteRuntimeParams,
): Promise<CreateCompanyInviteResult> {
  const now = deps.now ? deps.now() : new Date();
  const hours = clampExpiryHours(params?.expiresInHours);
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  const kind: CompanyInviteRecord["kind"] =
    params?.kind === "family" ? "family" : "company";
  const note = params?.note?.trim() || undefined;
  const fixedToken = params?.fixedToken?.trim() || "";

  if (fixedToken) {
    const existing = await deps.taskStore.findCompanyInviteByToken(fixedToken);
    if (existing) {
      const updated: CompanyInviteRecord = {
        ...existing,
        ownerId: deps.ownerId,
        ownerPublicKey: deps.ownerPublicKey ?? existing.ownerPublicKey,
        agentPeerId: deps.agentPeerId ?? existing.agentPeerId,
        agentName: deps.agentName ?? existing.agentName,
        wsUrl: deps.wsUrl,
        lanWsUrl: deps.lanWsUrl ?? existing.lanWsUrl,
        relayWsUrl: deps.relayWsUrl ?? existing.relayWsUrl,
        homeNodePeerId: deps.homeNodePeerId ?? existing.homeNodePeerId,
        kind,
        expiresAt,
        note: note ?? existing.note,
      };
      if (params?.clearUsed) {
        delete updated.usedAt;
        delete updated.usedByDeviceId;
      }
      await deps.taskStore.saveCompanyInvite(updated);
      return { invite: updated, uri: getPairingUriForInvite(updated) };
    }
  }

  const record: CompanyInviteRecord = {
    inviteId: randomUUID(),
    token: fixedToken || generateToken(),
    ownerId: deps.ownerId,
    ownerPublicKey: deps.ownerPublicKey,
    agentPeerId: deps.agentPeerId,
    agentName: deps.agentName,
    wsUrl: deps.wsUrl,
    lanWsUrl: deps.lanWsUrl,
    relayWsUrl: deps.relayWsUrl,
    homeNodePeerId: deps.homeNodePeerId,
    kind,
    createdAt: now.toISOString(),
    expiresAt,
    note,
  };

  await deps.taskStore.saveCompanyInvite(record);
  const uri = getPairingUriForInvite(record);
  return { invite: record, uri };
}

export async function listCompanyInvitesViaRuntime(
  taskStore: LocalTaskStore,
): Promise<ListCompanyInvitesResult> {
  const invites = await taskStore.listCompanyInvites();
  return { invites };
}

export async function revokeCompanyInviteViaRuntime(
  taskStore: LocalTaskStore,
  inviteId: string,
  now: () => Date = () => new Date(),
): Promise<RevokeCompanyInviteResult> {
  const existing = await taskStore.getCompanyInvite(inviteId);
  if (!existing) {
    throw new Error(`Company invite not found: ${inviteId}`);
  }
  if (existing.revokedAt) {
    return { ok: true, invite: existing };
  }
  const updated: CompanyInviteRecord = {
    ...existing,
    revokedAt: now().toISOString(),
  };
  await taskStore.saveCompanyInvite(updated);
  return { ok: true, invite: updated };
}

/**
 * Mark an invite as consumed. Returns the updated record, or `undefined`
 * when the token is unknown / expired / revoked / already used.
 *
 * Idempotency: if the invite is already consumed by the same device, returns
 * the existing record. If consumed by a *different* device, treats the second
 * call as a rejection (returns undefined) so the joiner gets a clear error.
 */
export async function consumeCompanyInviteViaRuntime(
  taskStore: LocalTaskStore,
  token: string,
  deviceId: string,
  now: () => Date = () => new Date(),
): Promise<CompanyInviteRecord | undefined> {
  const trimmed = token.trim();
  if (!trimmed) return undefined;
  const record = await taskStore.findCompanyInviteByToken(trimmed);
  if (!record) return undefined;
  if (record.revokedAt) return undefined;
  if (record.expiresAt && Date.parse(record.expiresAt) <= now().getTime()) {
    return undefined;
  }
  if (record.usedAt) {
    if (record.usedByDeviceId && record.usedByDeviceId === deviceId) {
      return record;
    }
    return undefined;
  }
  const updated: CompanyInviteRecord = {
    ...record,
    usedAt: now().toISOString(),
    usedByDeviceId: deviceId,
  };
  await taskStore.saveCompanyInvite(updated);
  return updated;
}
