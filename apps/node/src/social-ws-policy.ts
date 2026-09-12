/**
 * Social WebSocket policy — the parts of the host that are EnvoyMesh product
 * behaviour, not transport.
 *
 * ## Why this module exists
 *
 * `@envoymesh/host-connect` provides the WebSocket host every client connects to
 * (it lived in `apps/node/src/ws-server.ts` when this policy was extracted, and
 * has since moved into that package).
 * It used to contain this routing policy inline, which meant the transport knew
 * what a *family profile*, a *family room* and an *AI-bot thread key* are —
 * so any product reusing the host would inherit all of it
 * (`docs/envoymesh-refactoring-plan.md` §2.5, §6.1 H3).
 *
 * Moving the policy here is H3 of the host split: the host keeps the mechanism
 * (route an event to a set of profiles) and this module owns the *decision*
 * (which profiles, and why).
 *
 * This module is `product-bound`: it names family profiles, AI-bot and bridge
 * thread keys. That is correct and intended — it is the product's policy.
 */

import {
  isEnvoyAiThreadKey,
  parseAiBotThreadKey,
  parseBridgeThreadKey,
  parseEnvoyAiProfileId,
  parseFamilyThreadKey,
  OWNER_FAMILY_PROFILE_ID,
} from "@envoymesh/api";
import type { RpcCallerContext } from "./rpc-caller-context.js";
import { sessionCallerFromToken } from "./rpc-caller-context.js";
import type {
  EventDisposition,
  HostSession,
  SessionIdentityResolver,
} from "@envoymesh/host-connect";

/**
 * Phase 51 — which family profile(s) should receive a live `chat:message`.
 * Empty → treat as owner-only (mesh / unknown).
 */
export function resolveChatMessageTargetProfiles(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const msg = data as {
    sender?: { ownerId?: string };
    recipient?: { ownerId?: string };
  };
  const candidates = [msg.sender?.ownerId, msg.recipient?.ownerId]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  const profiles = new Set<string>();
  for (const key of candidates) {
    const family = parseFamilyThreadKey(key);
    if (family) {
      profiles.add(family.profileIdA);
      profiles.add(family.profileIdB);
      continue;
    }
    const bot = parseAiBotThreadKey(key);
    if (bot?.profileId) {
      profiles.add(bot.profileId);
      continue;
    }
    const bridge = parseBridgeThreadKey(key);
    if (bridge) {
      profiles.add(bridge.profileId);
      continue;
    }
    const envoyAi = parseEnvoyAiProfileId(key);
    if (envoyAi) {
      profiles.add(envoyAi);
      continue;
    }
    if (isEnvoyAiThreadKey(key) && key === "__envoy_ai__") {
      profiles.add(OWNER_FAMILY_PROFILE_ID);
    }
  }
  return [...profiles];
}


/**
 * Dispositions for the product's events — H1 of the host split.
 *
 * These were 20 hand-wired `on(…)` call sites inside the transport. Bringing
 * them here means `ws-server.ts` no longer needs `OWNER_FAMILY_PROFILE_ID` for
 * routing, and no longer knows what a family room is.
 *
 * **Owner-only is expressed as `byProfile`.** The host contract deliberately has
 * no `ownerOnly` case — "only the owner profile" names the family-profile model,
 * which the transport must not know about. The concept lives here instead, in
 * the policy that owns it.
 */
export const SOCIAL_EVENT_DISPOSITIONS: Readonly<Record<string, EventDisposition>> =
  Object.freeze({
    // Greetings and agent share proposals are mesh-wide.
    "hello:request": { kind: "broadcast" },
    "hello:response": { kind: "broadcast" },
    "share:agent-proposed": { kind: "broadcast" },
    "bond:established": { kind: "broadcast" },
    "bond:revoked": { kind: "broadcast" },
    "profile:updated": { kind: "broadcast" },
    "agent:awareness": { kind: "broadcast" },
    "chat:delivered": { kind: "broadcast" },
    "chat:auto-reply-paused": { kind: "broadcast" },
    "home:bonds-updated": { kind: "broadcast" },
    "home:agent-cards-updated": { kind: "broadcast" },

    // A chat message goes to the profiles the thread keys name; no match means
    // owner-only (mesh / unknown).
    "chat:message": {
      kind: "byProfile",
      resolve: (data) => {
        const targets = resolveChatMessageTargetProfiles(data);
        return targets.length > 0 ? targets : [OWNER_FAMILY_PROFILE_ID];
      },
    },

    // Mesh rooms are owner-only — never broadcast to family-member sessions.
    "chat:room-updated": ownerOnly(),
    "chat:room-removed": ownerOnly(),
    "chat:room-message": ownerOnly(),
    "chat:draft": ownerOnly(),
    "agent:activity": ownerOnly(),

    // Family rooms are profile-scoped AND remapped onto the mesh-room event
    // names/shapes, so the EnvoyGo/Social handlers stay shared.
    "chat:family-room-updated": {
      kind: "custom",
      handle: (delivery, data) => {
        const row = data as { targetProfileId?: string; room?: unknown };
        const profileId = row?.targetProfileId?.trim();
        if (!profileId || row.room == null) return;
        delivery.toProfile(profileId, "chat:room-updated", row.room);
      },
    },
    "chat:family-room-message": {
      kind: "custom",
      handle: (delivery, data) => {
        const row = data as { targetProfileId?: string; roomId?: string; message?: unknown };
        const profileId = row?.targetProfileId?.trim();
        if (!profileId) return;
        delivery.toProfile(profileId, "chat:room-message", {
          roomId: row.roomId,
          message: row.message,
          kind: "family",
        });
      },
    },

    // Home config carries per-profile bot lists, so the host needs its
    // bookkeeping to mask what each caller may see.
    "home:config-updated": { kind: "hostHandled", handler: "home:config-updated" },
  });

/** Owner-only, expressed without teaching the host what "owner" means. */
function ownerOnly(): EventDisposition {
  return { kind: "byProfile", resolve: () => [OWNER_FAMILY_PROFILE_ID] };
}


// ─── H2 — the product's session identity ────────────────────────────────────

/**
 * The members of the node service this resolver needs.
 *
 * Declared structurally rather than as `NodeServiceImpl` so the resolver does
 * not depend on the 18k-line implementation — the casts are the thing H2 is
 * removing (`as any` for the first two, `as NodeServiceImpl` for the other two).
 */
export interface SocialSessionHost {
  lookupSessionToken?(token: string): Promise<SessionTokenRecordLike | undefined>;
  listFamilyProfiles?(): Promise<{ profiles?: Array<{ id: string; isOwner?: boolean }> }>;
  healSessionProfileFromBinding?(
    record: SessionTokenRecordLike,
    profileId: string,
  ): Promise<unknown>;
  touchFamilyProfileLastSeen?(profileId: string): Promise<unknown> | unknown;
}

/** The subset of a session-token record this policy reads. */
export interface SessionTokenRecordLike {
  ownerId: string;
  deviceId?: string;
  profileId?: string;
  boundFamilyProfileId?: string;
}

/**
 * The product's session-identity resolver — H2.
 *
 * This is the family-profile logic that used to live inside the transport's auth
 * path: look the token up, resolve which profile it is bound to (`preferring
 * `boundFamilyProfileId` when `profileId` was corrupted to owner`), **repair**
 * that binding so later reconnects and pushes keep using it, and report presence.
 *
 * The host now asks only *"resolve this token"*, and does not know that family
 * profiles, healing or presence exist.
 */
export function createSocialSessionIdentityResolver(
  host: SocialSessionHost,
): SessionIdentityResolver<RpcCallerContext> {
  return {
    localScopeKey: OWNER_FAMILY_PROFILE_ID,

    async resolveSession(token: string): Promise<HostSession<RpcCallerContext> | null> {
      const record = await host.lookupSessionToken?.(token);
      if (!record?.ownerId) return null;

      // Prefer boundFamilyProfileId when profileId was corrupted to owner.
      let caller = sessionCallerFromToken(record);
      try {
        const profiles = await host.listFamilyProfiles?.();
        const match = profiles?.profiles?.find((p) => p.id === caller.profileId);
        if (match) {
          caller = sessionCallerFromToken({
            ...record,
            profileId: caller.profileId,
            isOwnerProfile: match.isOwner === true,
          });
        }
      } catch {
        /* keep the heuristic */
      }

      // Persist the heal so later reconnects / push keep using Mom/Dad.
      if (
        caller.profileId !== OWNER_FAMILY_PROFILE_ID &&
        (record.profileId?.trim() ?? OWNER_FAMILY_PROFILE_ID) === OWNER_FAMILY_PROFILE_ID
      ) {
        void Promise.resolve(host.healSessionProfileFromBinding?.(record, caller.profileId)).catch(
          () => {
            /* best-effort; this WS already uses the healed profile */
          },
        );
      }

      return {
        scopeKey: caller.profileId,
        ownerId: record.ownerId,
        isOwnerScope: caller.isOwnerProfile,
        deviceId: caller.deviceId,
        caller,
      };
    },

    noteSessionActivity(session: HostSession<RpcCallerContext>): void {
      // Presence is best-effort and must NEVER reach the RPC path. The `try` is
      // load-bearing, not defensive noise: a *synchronous* throw from the hook
      // escapes `Promise.resolve(...).catch(...)` entirely, which is exactly the
      // bug the H2 test caught.
      try {
        void Promise.resolve(host.touchFamilyProfileLastSeen?.(session.scopeKey)).catch(() => {
          /* async failure — also best-effort */
        });
      } catch {
        /* sync failure — swallowed on purpose */
      }
    },
  };
}
