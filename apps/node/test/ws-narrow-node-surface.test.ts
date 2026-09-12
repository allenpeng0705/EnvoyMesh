/**
 * Enabling change 3 of the host extraction: the **narrow host node surface**, and
 * the classification it exists to earn.
 *
 * The host used to take a `NodeService` — the product's whole ~423-method RPC
 * surface — plus six inline `if (method === "homeClawCoreWs…")` blocks that
 * proxied two product sockets through it. Three consequences, all asserted here:
 *
 * 1. the host depended on `@envoymesh/api` for types and on
 *    `@envoymesh/node-core` for two constants, so it could not be packaged
 *    without the product;
 * 2. it read product **settings**, and knew product **method names**;
 * 3. therefore the Axis-1 classifier — the plan's own extraction gate — marked
 *    `ws-server.ts` `product-bound`, and it could not be moved into a
 *    host/connect package.
 *
 * What replaced all of it: `HostNodeService` (five members), the
 * `transformForSession` and `socketMethods` ports, and a `preAuthMethods` list.
 * The static half is checked on comment-stripped source (the lesson from
 * `ws-host-boundary.test.ts`: a grep over raw text counts comments, and this
 * refactor's own prose tripped that four times).
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CORE_EVENT_DISPOSITIONS,
  HOST_WS_BIND_HOST,
  type HostNodeService,
} from "@envoymesh/host-connect";
import { WsServer } from "@envoymesh/host-connect";
import { SOCIAL_WS_BIND_HOST } from "@envoymesh/node-core";
import { stripCommentsAndStrings } from "../../../scripts/lib/source-files.mjs";

const WS_SERVER = new URL("../../../packages/host-connect/src/ws-server.ts", import.meta.url);
const MANIFEST = new URL("../../../scripts/module-boundary.json", import.meta.url);

/** Comments removed and string literals blanked — the *shared* scanner from
 * `scripts/lib/source-files.mjs`, not a local regex copy. The regex version
 * deleted real code here: a comment marker inside a log string opened a bogus
 * block comment and swallowed text up to the next terminator, so this scan was
 * reading a file with parts missing — caught by a guard asserting that an
 * identifier survives stripping. */
const codeOf = stripCommentsAndStrings;

describe("the host's node dependency is a declared five-member surface", () => {
  it("a node with only those members satisfies the port", async () => {
    // The narrow surface, written out longhand. Nothing here is a product
    // concept, and no RPC method is reachable — which is the whole point.
    const calls: string[] = [];
    const minimal: HostNodeService = {
      on: () => calls.push("on"),
      onCallEvent: () => {
        calls.push("onCallEvent");
        return () => undefined;
      },
      getNodeStatus: () => "running",
      getConnectionStatus: () => ({ peerId: "peer-1", multiaddrs: [] }),
      noteClientActivity: () => calls.push("noteClientActivity"),
    };

    expect(minimal.getNodeStatus()).toBe("running");
    expect(minimal.getConnectionStatus().peerId).toBe("peer-1");
    // No `getNodeConfig`, no `mayFamilyProfileUseExtAgent` — both are gone.
    //
    // The count is pinned here deliberately: this surface has been described as
    // "six" and "seven" members in comments after `getNodeConfig` was removed,
    // because the number was written by hand in four places while the interface
    // changed in one. The list below *is* the count.
    expect(Object.keys(minimal)).toHaveLength(5);
    expect(Object.keys(minimal).sort()).toEqual([
      "getConnectionStatus",
      "getNodeStatus",
      "noteClientActivity",
      "on",
      "onCallEvent",
    ]);
  });

  it("ws-server.ts imports nothing from @envoymesh/api or @envoymesh/node-core", () => {
    const source = readFileSync(WS_SERVER, "utf8");
    const imports = [...source.matchAll(/^import[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    const envoyPackages = imports.filter((i) => i.startsWith("@envoymesh/"));
    // `protocol` is in the declared core set; anything else would re-taint the
    // module through a package (`@envoymesh/node-core` is product-bound because
    // it re-exports `home-fs`, which depends on `@envoymesh/api`).
    expect(envoyPackages).toEqual(["@envoymesh/protocol"]);
  });

  it("ws-server.ts names no host implementation, caller policy or product method", () => {
    const code = codeOf(readFileSync(WS_SERVER, "utf8"));
    // Whole-identifier matching, not `String.includes`. `HostNodeService`
    // contains `NodeService`, and a substring test flagged it — the same
    // substring-collision mistake this refactor made in a patch script once
    // already, so the check is written to be immune to it.
    for (const symbol of [
      "NodeService",
      "NodeServiceImpl",
      "RpcCallerContext",
      "stampConfigCallerForSession",
      "maskBridgeEnabledForExtAgentAccess",
      "mayFamilyProfileUseExtAgent",
      "recordOwnerActivity",
      "getNodeConfig",
      "SOCIAL_WS_BIND_HOST",
      "TERMINAL_WS_PORT",
      "previewFamilyInvite",
      "pairThinClient",
      "closeHomeClawCoreWsForCompanion",
      "closeHomeTerminalWsForCompanion",
    ]) {
      expect(code, `${symbol} must not appear as an identifier`).not.toMatch(
        new RegExp(`\\b${symbol}\\b`),
      );
    }
    // Method-family prefixes: these are allowed to be *part of* a longer name in
    // prose, but the transport must not branch on them at all.
    for (const family of ["homeClawCoreWs", "homeTerminalWs"]) {
      expect(code, `${family}* must not appear`).not.toContain(family);
    }
  });

  it("the classifier marks the transport reusable — the gate this work exists to pass", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
      reusable: Array<{ path: string }>;
    };
    const paths = new Set(manifest.reusable.map((entry) => entry.path));
    expect(paths.has("packages/host-connect/src/ws-server.ts")).toBe(true);
  });

  it("the host owns its bind address, and it agrees with node-core's", () => {
    // Two names for one value is a drift risk, so the equality is asserted
    // rather than assumed. The host declares it to avoid importing a
    // product-bound package for a string.
    expect(HOST_WS_BIND_HOST).toBe(SOCIAL_WS_BIND_HOST);
  });
});

describe("the ports replace what the transport used to do inline", () => {
  it("a host with no product ports still starts and delivers core events", () => {
    // No `transformForSession`, no `socketMethods`, no dispositions: a product
    // with none of these must still work, which is what "reusable" has to mean.
    const server = new WsServer<unknown>(0);
    const delivered: string[] = [];
    const node: HostNodeService = {
      on: (event) => delivered.push(event),
      onCallEvent: () => () => undefined,
      getNodeStatus: () => "running",
      getConnectionStatus: () => ({ peerId: "peer-1", multiaddrs: [] }),
      noteClientActivity: () => undefined,
    };

    expect(() =>
      server.start(node, {
        sessionIdentity: { localScopeKey: "local", async resolveSession() { return null; } },
        dispatch: async () => ({ ok: true }),
      }),
    ).not.toThrow();

    // The host's own vocabulary is what it subscribes to, with no product table.
    expect(delivered.sort()).toEqual(Object.keys(CORE_EVENT_DISPOSITIONS).sort());
    server.stop();
  });

  it("a host with no identity resolver refuses to start", () => {
    // Unchanged fail-loud behaviour (H2): a missing resolver is a wiring bug,
    // not a runtime condition.
    const server = new WsServer<unknown>(0);
    const node = {
      on: () => undefined,
      onCallEvent: () => () => undefined,
      getNodeStatus: () => "running" as const,
      getConnectionStatus: () => ({ peerId: "", multiaddrs: [] }),
      noteClientActivity: () => undefined,
    };
    expect(() =>
      server.start(node, {
        // @ts-expect-error — deliberately omitting the required port.
        dispatch: async () => null,
      }),
    ).toThrow(/sessionIdentity/);
  });
});
