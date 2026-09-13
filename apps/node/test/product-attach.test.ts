/**
 * `attachLocalProduct` — a second app on this machine gets a session of its own.
 *
 * The transport tests (`packages/host-connect/test/attach-client.test.ts`) cover the
 * gates and the exchange. This covers what the *node* does with the request and what
 * the session it mints can then do — the part that decides whether "product scope"
 * means anything:
 *
 *   * the token is stored against the product, not a family profile;
 *   * it resolves to `product:<Name>` with `isOwnerScope: false`;
 *   * a caller holding it gets `isOwnerProfile: false`, so owner-only RPCs are
 *     refused by `requireOwnerProfile` — least privilege by construction;
 *   * the family-profile healing path is **not** applied to it, because "healing" a
 *     product scope into a family one would hand the product the owner's scope.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPeerDirectoryStore, createLocalTrustStore } from "@envoymesh/local-store";
import { productScopeKey } from "@envoymesh/node-core";
import { afterEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { runWithRpcCaller, sessionCallerFromToken } from "../src/rpc-caller-context.js";
import { routeRpcMethod } from "../src/json-rpc-router.js";
import { createSocialSessionIdentityResolver } from "../src/social-ws-policy.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }).catch(() => undefined)),
  );
});

/**
 * A node with a profile directory, an owner identity and no mesh.
 *
 * `loadOrCreateNodeProfile` on an empty directory creates the owner — which is what
 * the attach needs, since the session it mints has to name an owner.
 */
async function nodeWithProfile(): Promise<NodeServiceImpl> {
  const dir = await mkdtemp(join(tmpdir(), "product-attach-"));
  dirs.push(dir);
  const { loadOrCreateNodeProfile } = await import("@envoymesh/local-store");
  const profile = await loadOrCreateNodeProfile(dir);
  return new NodeServiceImpl(
    undefined,
    createLocalTrustStore(dir),
    createLocalPeerDirectoryStore(dir),
    undefined,
    dir,
    profile,
  );
}

describe("attachLocalProduct", () => {
  it("mints a session scoped to the product, never to the owner", async () => {
    const ns = await nodeWithProfile();
    const grant = await ns.attachLocalProduct({ product: "EnvoyCoder", version: "1.0.0" });

    expect(grant.scopeKey).toBe(productScopeKey("EnvoyCoder"));
    expect(grant.ownerId).toMatch(/^envoy:owner:/);
    expect(grant.token).toMatch(/[0-9a-f-]{36}/);

    const record = await ns.lookupSessionToken(grant.token);
    expect(record?.product).toBe("EnvoyCoder");
    // Not a family profile binding: this must never be "healed" into one.
    expect(record?.profileId).toBeUndefined();
    expect(record?.boundFamilyProfileId).toBeUndefined();
    expect(record?.deviceId).toBe("product:EnvoyCoder");
  });

  it("resolves that token to a non-owner, product-scoped session", async () => {
    const ns = await nodeWithProfile();
    const grant = await ns.attachLocalProduct({ product: "EnvoyCoder" });
    const resolver = createSocialSessionIdentityResolver(ns);

    const session = await resolver.resolveSession(grant.token);
    expect(session?.scopeKey).toBe("product:EnvoyCoder");
    expect(session?.isOwnerScope).toBe(false);
    expect(session?.ownerId).toBe(grant.ownerId);
    expect(session?.caller?.isOwnerProfile).toBe(false);
    expect(session?.caller?.profileId).toBe("product:EnvoyCoder");
  });

  it("gives the caller no owner privileges, so owner-only RPCs stay refused", async () => {
    const ns = await nodeWithProfile();
    const grant = await ns.attachLocalProduct({ product: "EnvoyCoder" });
    const record = await ns.lookupSessionToken(grant.token);
    const caller = sessionCallerFromToken(record!);

    expect(caller.isOwnerProfile).toBe(false);
    // `requireOwnerProfile` reads this context, so an owner-only method throws before
    // the service is even called. `updateNodeConfig` is on the owner-only list and
    // needs nothing from the mesh — the refusal is the first statement of the route.
    await expect(
      runWithRpcCaller(caller, () => routeRpcMethod(ns, "updateNodeConfig", {})),
    ).rejects.toThrow(/Only the node owner/i);
  });

  it("documents what a product scope does **not** block (a known gap, by design of the list)", async () => {
    // Owner-only enforcement is a **deny-list** (`OWNER_ONLY_RPC_METHODS` plus the
    // `terminal*` prefix). A product session is therefore refused everything on that
    // list and *allowed* everything else — which is not the same as least privilege.
    // Pinned here so the next slice has to change this test on purpose rather than
    // discover the gap in production: a product allow-list is the honest follow-up.
    const ns = await nodeWithProfile();
    const grant = await ns.attachLocalProduct({ product: "EnvoyCoder" });
    const caller = sessionCallerFromToken((await ns.lookupSessionToken(grant.token))!);

    const ownerOnly = await runWithRpcCaller(caller, () =>
      routeRpcMethod(ns, "updateNodeConfig", {}).then(
        () => "allowed",
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      ),
    );
    expect(ownerOnly).toMatch(/Only the node owner/i);

    const notListed = await runWithRpcCaller(caller, () =>
      routeRpcMethod(ns, "getNodeStatus", {}).then(
        () => "allowed",
        (err: unknown) => (err instanceof Error ? err.message : String(err)),
      ),
    );
    expect(notListed).toBe("allowed");
  });

  it("replaces the previous token for the same product instead of accumulating", async () => {
    const ns = await nodeWithProfile();
    const first = await ns.attachLocalProduct({ product: "EnvoyCoder" });
    const second = await ns.attachLocalProduct({ product: "EnvoyCoder" });

    expect(second.token).not.toBe(first.token);
    // Upsert by device id: one live token per product, so a stale copy stops working.
    expect(await ns.lookupSessionToken(first.token)).toBeUndefined();
    expect((await ns.lookupSessionToken(second.token))?.product).toBe("EnvoyCoder");
  });

  it("keeps two products in separate scopes", async () => {
    const ns = await nodeWithProfile();
    const coder = await ns.attachLocalProduct({ product: "EnvoyCoder" });
    const agent = await ns.attachLocalProduct({ product: "EnvoyAgent" });
    const resolver = createSocialSessionIdentityResolver(ns);

    expect((await resolver.resolveSession(coder.token))?.scopeKey).toBe("product:EnvoyCoder");
    expect((await resolver.resolveSession(agent.token))?.scopeKey).toBe("product:EnvoyAgent");
  });

  it("refuses a missing or unusable product name", async () => {
    const ns = await nodeWithProfile();
    // The name becomes a stored field, a scope key and a log line, so it is validated
    // rather than trimmed-and-hoped-for.
    await expect(ns.attachLocalProduct({})).rejects.toThrow(/product must be/i);
    await expect(ns.attachLocalProduct({ product: "   " })).rejects.toThrow(/product must be/i);
    await expect(ns.attachLocalProduct({ product: "9bad" })).rejects.toThrow(/product must be/i);
    await expect(ns.attachLocalProduct({ product: "a/b" })).rejects.toThrow(/product must be/i);
  });
});
