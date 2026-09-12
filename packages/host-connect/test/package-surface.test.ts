/**
 * The extraction's acceptance: **this package is self-sufficient**.
 *
 * `docs/envoymesh-refactoring-plan.md` §8.8 asks that a separate app can host
 * QR + host:port without importing a `product-bound` module. That claim has two
 * halves, and only one of them is about behaviour:
 *
 * 1. **behavioural** — a host built from this package alone starts and serves
 *    calls (`apps/node/test/ws-narrow-node-surface.test.ts`,
 *    `apps/node/test/ws-host-wiring.test.ts`);
 * 2. **structural** — nothing *inside* this package depends on the product, so
 *    the claim cannot quietly stop being true.
 *
 * This file is (2). It lives with the package rather than with the app because
 * the package is what has to stay clean: an app-side test would still pass if
 * someone later added a product import here.
 *
 * The check is done against the generated manifest as well as the sources,
 * because the manifest is what the CI gate (and the plan's extraction rule) is
 * expressed in — asserting on the same artifact CI does avoids a test that is
 * true for a different reason than the gate.
 */

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SRC = new URL("../src/", import.meta.url);
const PACKAGE_JSON = new URL("../package.json", import.meta.url);
const MANIFEST = new URL("../../../scripts/module-boundary.json", import.meta.url);

function sourceFiles(): string[] {
  return readdirSync(SRC).filter((name) => name.endsWith(".ts") && !name.endsWith(".d.ts"));
}

function read(name: string): string {
  return readFileSync(new URL(name, SRC), "utf8");
}

/** Import specifiers of one module, in source order. */
function importsOf(source: string): string[] {
  return [...source.matchAll(/^import[\s\S]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
}

describe("the package depends on nothing from the product", () => {
  it("declares exactly two runtime dependencies, both product-neutral", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual(["@envoymesh/protocol", "ws"]);
  });

  it("no module imports @envoymesh/api — the package that exports the 436-method product surface", () => {
    // Importing `@envoymesh/api` is what kept `ws-server.ts` product-bound even
    // after its concepts were gone (E9); the wire types moved to `protocol`
    // instead, which is why this assertion can exist at all.
    for (const file of sourceFiles()) {
      expect(importsOf(read(file)), file).not.toContain("@envoymesh/api");
    }
  });

  it("no module imports @envoymesh/node-core — the other package that re-exports a product dep", () => {
    // `node-core` is product-bound *through* `home-fs` → `@envoymesh/api`, so
    // importing it for two constants re-tainted the transport one level removed.
    for (const file of sourceFiles()) {
      expect(importsOf(read(file)), file).not.toContain("@envoymesh/node-core");
    }
  });

  it("every module's imports are node builtins, the two deps, or a sibling in this package", () => {
    for (const file of sourceFiles()) {
      for (const spec of importsOf(read(file))) {
        const ok =
          spec.startsWith("node:") ||
          spec === "ws" ||
          spec === "@envoymesh/protocol" ||
          /^\.\/[a-z0-9-]+\.js$/.test(spec);
        expect(ok, `${file} imports "${spec}"`).toBe(true);
      }
    }
  });

  it("the manifest agrees: every module here is classified reusable", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
      reusable: Array<{ path: string }>;
      productBound: Array<{ path: string }>;
    };
    const reusable = new Set(manifest.reusable.map((entry) => entry.path));
    const productBound = new Set(manifest.productBound.map((entry) => entry.path));
    for (const file of sourceFiles()) {
      const path = `packages/host-connect/src/${file}`;
      expect(productBound.has(path), `${path} must not be product-bound`).toBe(false);
      expect(reusable.has(path), `${path} must be reusable`).toBe(true);
    }
  });
});

describe("the package's public surface is what a product needs", () => {
  it("exports the host, its ports, and the core vocabulary", async () => {
    const mod = await import("../src/index.js");
    for (const name of [
      // the host itself
      "WsServer",
      // the ports and data a product supplies
      "CORE_EVENT_DISPOSITIONS",
      "CORE_EVENT_NAMES",
      "dispatchEvent",
      "mergeEventDispositions",
      "maskEnabledField",
      // mechanism the product composes
      "createCallerContextStore",
      "rpcErrorCode",
      "HOST_WS_BIND_HOST",
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name], name).not.toBe("undefined");
    }
  });

  it("does not export the dead `createWsServer` factory", async () => {
    // A factory that cannot supply the required `WsServerOptions` invites a
    // call that cannot type-check; `new WsServer(port, path)` is the whole of it.
    const mod = (await import("../src/index.js")) as Record<string, unknown>;
    expect(mod["createWsServer"]).toBeUndefined();
  });

  it("does not export the product's caller model", async () => {
    // `RpcCallerContext`, `localOwnerCaller`, `stampConfigCallerForSession` and
    // the owner/family rules are policy and stayed with the product. If one of
    // them ever appears here, the boundary has been reversed.
    const mod = (await import("../src/index.js")) as Record<string, unknown>;
    for (const name of [
      "RpcCallerContext",
      "localOwnerCaller",
      "anonymousPairingCaller",
      "sessionCallerFromToken",
      "requireOwnerProfile",
      "stampConfigCallerForSession",
      "redactNodeConfigForCaller",
    ]) {
      expect(mod[name], `${name} must not be exported from the host package`).toBeUndefined();
    }
  });
});
