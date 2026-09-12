/**
 * The product's per-session delivery policy — moved out of the transport, so it
 * is pinned here.
 *
 * `home:config-updated` stamping and `bridge:status` masking used to be written
 * **inside** `ws-server.ts`. They are the product's rules, and they are the
 * reason the transport could not be packaged without the product. Moving them
 * behind `transformForSession` is only safe if the behaviour is identical, so
 * every branch the old inline code had is asserted below.
 */

import { describe, expect, it, vi } from "vitest";
import { OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api";
import {
  createSocialSessionDelivery,
  nodeMayUseExtAgent,
} from "../src/social-session-delivery.js";
import { localOwnerCaller, sessionCallerFromToken } from "../src/rpc-caller-context.js";
import type { HostSession } from "@envoymesh/host-connect";

type Caller = ReturnType<typeof localOwnerCaller>;

function ownerSession(): HostSession<Caller> {
  return {
    scopeKey: OWNER_FAMILY_PROFILE_ID,
    ownerId: "",
    isOwnerScope: true,
    caller: localOwnerCaller(""),
  };
}

function memberSession(profileId = "mom"): HostSession<Caller> {
  return {
    scopeKey: profileId,
    ownerId: "",
    isOwnerScope: false,
    caller: sessionCallerFromToken({ ownerId: "", profileId }),
  };
}

const allow = () => Promise.resolve(true);
const deny = () => Promise.resolve(false);

describe("home:config-updated — the config is stamped for the receiving session", () => {
  it("stamps the caller's profile id and owner flag onto the config", async () => {
    const transform = createSocialSessionDelivery(deny);
    const result = (await transform(
      "home:config-updated",
      { config: { theme: "dark" } },
      ownerSession(),
    )) as { config: Record<string, unknown> };

    // The emitter's identity must never travel unchanged to a member session —
    // that is the bug this stamping exists to prevent (EnvoyGo devices flipping
    // to Owner).
    expect(result.config.callerFamilyProfileId).toBe(OWNER_FAMILY_PROFILE_ID);
    expect(result.config.callerIsOwnerProfile).toBe(true);
    expect(result.config.theme).toBe("dark");
  });

  it("withholds other profiles' AI bots from a member session", async () => {
    const transform = createSocialSessionDelivery(deny);
    const result = (await transform(
      "home:config-updated",
      {
        config: {
          aiBots: [{ id: "owner-bot" }],
          familyProfiles: [
            { id: "owner", aiBots: [{ id: "owner-bot" }] },
            { id: "mom", aiBots: [{ id: "mom-bot" }] },
          ],
        },
      },
      memberSession("mom"),
    )) as { config: Record<string, unknown> };

    expect(result.config.aiBots).toEqual([]);
    const profiles = result.config.familyProfiles as Array<Record<string, unknown>>;
    // The member keeps their own bots and loses everyone else's.
    expect(profiles.find((p) => p.id === "mom")?.aiBots).toEqual([{ id: "mom-bot" }]);
    expect(profiles.find((p) => p.id === "owner")?.aiBots).toBeUndefined();
  });

  it("passes a payload with no config through unchanged", async () => {
    const transform = createSocialSessionDelivery(deny);
    const data = { note: "no config here" };
    expect(await transform("home:config-updated", data, ownerSession())).toBe(data);
    expect(await transform("home:config-updated", null, ownerSession())).toBeNull();
  });
});

describe("bridge:status — the capability advertisement is masked, failing closed", () => {
  const enabled = { enabled: true, detail: "ok" };

  it("leaves a non-enabled advertisement alone", async () => {
    const gate = vi.fn(deny);
    const transform = createSocialSessionDelivery(gate);
    const data = { enabled: false };
    // No gate call at all — nothing is being advertised, so nothing to mask.
    expect(await transform("bridge:status", data, memberSession())).toBe(data);
    expect(gate).not.toHaveBeenCalled();
  });

  it("passes an enabled advertisement through unchanged", async () => {
    const transform = createSocialSessionDelivery(allow);
    expect(await transform("bridge:status", enabled, memberSession())).toEqual(enabled);
  });

  it("masks it when the profile has not been granted the capability", async () => {
    const transform = createSocialSessionDelivery(deny);
    expect(await transform("bridge:status", enabled, memberSession())).toEqual({
      enabled: false,
      detail: "ok",
    });
  });

  it("masks it when the gate throws — an unanswerable check denies", async () => {
    const transform = createSocialSessionDelivery(() => {
      throw new Error("profile store unavailable");
    });
    expect(await transform("bridge:status", enabled, memberSession())).toEqual({
      enabled: false,
      detail: "ok",
    });
  });

  it("does not consult the gate for the owner's own session", async () => {
    const gate = vi.fn(deny);
    const transform = createSocialSessionDelivery(gate);
    expect(await transform("bridge:status", enabled, ownerSession())).toEqual(enabled);
    expect(gate).not.toHaveBeenCalled();
  });
});

describe("anything else is delivered as emitted", () => {
  it("returns unknown events untouched", async () => {
    const transform = createSocialSessionDelivery(allow);
    const data = { whatever: true };
    expect(await transform("eh:turn_token", data, memberSession())).toBe(data);
  });
});

describe("the node gate fails closed", () => {
  it("denies when the node is not the product's implementation", async () => {
    // A node without the family-profile model cannot answer the question, and
    // the answer must be denial — `?? true` here would have been fail-open.
    const foreignNode = {} as Parameters<typeof nodeMayUseExtAgent>[0];
    expect(await nodeMayUseExtAgent(foreignNode, memberSession())).toBe(false);
    expect(await nodeMayUseExtAgent(foreignNode, ownerSession())).toBe(false);
  });
});
