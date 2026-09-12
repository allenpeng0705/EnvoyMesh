/**
 * H2 acceptance — the session-identity port.
 *
 * `docs/envoymesh-refactoring-plan.md` §6.1 H2. The host used to resolve a token
 * itself: look it up, query the **family profile store** to decide
 * `isOwnerProfile`, **repair** a corrupted binding, and track presence — all via
 * `as any` / `as NodeServiceImpl` casts. It could not answer "who is this?"
 * without the product's profile model.
 *
 * After H2 the host asks one question — *resolve this token* — and the product
 * answers. These tests pin both halves:
 *
 * 1. the port contract itself (a resolver with no profile model is valid);
 * 2. the product's implementation, including that the healing and presence
 *    behaviour it used to perform inline in the transport is preserved.
 */

import { describe, expect, it, vi } from "vitest";
import {
  createSocialSessionIdentityResolver,
  type SessionTokenRecordLike,
  type SocialSessionHost,
} from "../src/social-ws-policy.js";
import type { HostSession, SessionIdentityResolver } from "@envoymesh/host-connect";

const OWNER_SCOPE = "owner";

describe("H2 — a resolver needs no profile model", () => {
  it("a concept-free resolver satisfies the port", async () => {
    // The point of a port: a product with no family profiles supplies a resolver
    // that has none, and the host is satisfied.
    const minimal: SessionIdentityResolver<{ tag: string }> = {
      localScopeKey: "local",
      async resolveSession(token) {
        if (token !== "good") return null;
        return {
          scopeKey: "local",
          ownerId: "acct-1",
          isOwnerScope: true,
          caller: { tag: token },
        };
      },
    };

    expect(await minimal.resolveSession("bad")).toBeNull();
    const session = await minimal.resolveSession("good");
    expect(session?.scopeKey).toBe("local");
    // `caller` is carried opaquely — the host never inspects it.
    expect(session?.caller).toEqual({ tag: "good" });
  });
});

describe("H2 — the product's resolver preserves the behaviour it inherited", () => {
  it("returns null for an unknown token and for a record with no owner", async () => {
    const host: SocialSessionHost = { lookupSessionToken: async () => undefined };
    const resolver = createSocialSessionIdentityResolver(host);
    expect(await resolver.resolveSession("nope")).toBeNull();

    const noOwner = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({ ownerId: "" }) as SessionTokenRecordLike,
    });
    expect(await noOwner.resolveSession("t")).toBeNull();
  });

  it("resolves a legacy token (no profile binding) to the owner scope", async () => {
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({ ownerId: "envoy:owner:abc", deviceId: "dev-1" }),
    });
    const session = await resolver.resolveSession("t");
    expect(session?.ownerId).toBe("envoy:owner:abc");
    expect(session?.scopeKey).toBe(OWNER_SCOPE);
    expect(session?.isOwnerScope).toBe(true);
    expect(session?.deviceId).toBe("dev-1");
  });

  it("uses the family-profile store to decide isOwnerScope", async () => {
    // The lookup that used to happen inline in the transport, now behind the port.
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({ ownerId: "envoy:owner:abc", profileId: "mom" }),
      listFamilyProfiles: async () => ({ profiles: [{ id: "mom", isOwner: false }] }),
    });
    const session = await resolver.resolveSession("t");
    expect(session?.scopeKey).toBe("mom");
    expect(session?.isOwnerScope).toBe(false);
  });

  it("falls back to the heuristic when the profile store throws", async () => {
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({ ownerId: "envoy:owner:abc", profileId: "mom" }),
      listFamilyProfiles: async () => {
        throw new Error("store unavailable");
      },
    });
    const session = await resolver.resolveSession("t");
    // Still authenticates; the profile id is kept, owner-ness falls back.
    expect(session?.scopeKey).toBe("mom");
    expect(session?.isOwnerScope).toBe(false);
  });

  it("prefers boundFamilyProfileId when profileId was corrupted to owner", async () => {
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({
        ownerId: "envoy:owner:abc",
        profileId: OWNER_SCOPE,
        boundFamilyProfileId: "dad",
      }),
    });
    expect((await resolver.resolveSession("t"))?.scopeKey).toBe("dad");
  });

  it("heals a corrupted binding so later reconnects keep using it", async () => {
    const heal = vi.fn(async () => undefined);
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({
        ownerId: "envoy:owner:abc",
        profileId: OWNER_SCOPE,
        boundFamilyProfileId: "dad",
      }),
      healSessionProfileFromBinding: heal,
    });
    const session = await resolver.resolveSession("t");
    expect(session?.scopeKey).toBe("dad");
    // Best-effort: fired, not awaited into the auth result.
    expect(heal).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: "envoy:owner:abc" }),
      "dad",
    );
  });

  it("does NOT heal when the token legitimately belongs to the owner", async () => {
    const heal = vi.fn(async () => undefined);
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({ ownerId: "envoy:owner:abc", profileId: OWNER_SCOPE }),
      healSessionProfileFromBinding: heal,
    });
    await resolver.resolveSession("t");
    expect(heal).not.toHaveBeenCalled();
  });

  it("presence bookkeeping is keyed by the session's scope and never throws", async () => {
    const touch = vi.fn(() => {
      throw new Error("disk gone");
    });
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => ({ ownerId: "envoy:owner:abc", profileId: "mom" }),
      touchFamilyProfileLastSeen: touch,
    });
    const session = (await resolver.resolveSession("t")) as HostSession<unknown>;
    // A throwing presence hook must not escape into the RPC path.
    expect(() => resolver.noteSessionActivity?.(session)).not.toThrow();
    expect(touch).toHaveBeenCalledWith("mom");
  });

  it("the local scope key is the one the product defines", () => {
    const resolver = createSocialSessionIdentityResolver({
      lookupSessionToken: async () => undefined,
    });
    // The host uses this value to route untokened loopback clients without
    // knowing what the value means.
    expect(resolver.localScopeKey).toBe(OWNER_SCOPE);
  });
});
