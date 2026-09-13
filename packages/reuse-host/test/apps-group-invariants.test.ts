/**
 * The EnvoyMesh apps-group invariants, asserted rather than assumed.
 *
 * Three products on one machine are only one *group* if they agree on three things:
 * the relay network they join, the QR format they scan, and the URI scheme they
 * connect by. All three were already true — the pairing contract lives in
 * `@envoymesh/protocol`, the parser and codec in `@envoymesh/api/core`, the relay
 * roster in `default-bootstrap.ts` — but "already true" is how it was described, not
 * how it was kept. A fourth product can add its own builder or hardcode a relay
 * address in an afternoon, and nothing would fail.
 *
 * So these tests are the group's membership rules, checked against the tree:
 *
 *   1. exactly one module constructs an `envoy://pair` URI;
 *   2. exactly one module parses one;
 *   3. the relay roster is declared in exactly one module, and surfaced where a
 *      product can reach it;
 *   4. the shared surface a product depends on (`@envoymesh/reuse-host`) actually
 *      exports the roster and the QR helpers — a product must not have to know the
 *      internal layout of the core to join the group.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
  buildPairingUri,
  parsePairingUri,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

/** Every first-party TypeScript source outside build output. */
function sourceFiles(): string[] {
  const roots = ["apps", "packages"];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "target") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
      // Tests may legitimately contain example URIs.
      if (full.includes("/test/") || full.endsWith(".test.ts") || full.endsWith(".test.tsx")) continue;
      out.push(full);
    }
  };
  for (const root of roots) walk(path.join(repoRoot, root));
  return out;
}

function filesMatching(pattern: RegExp): string[] {
  return sourceFiles()
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => path.relative(repoRoot, file))
    .sort();
}

describe("the EnvoyMesh apps group", () => {
  it("has exactly one implementation of the pairing URI format", () => {
    // Both directions live together in `envoy-pair-uri.ts`. The builder used to be a
    // second copy in `reuse-host` — working, tested, and still a format fork waiting
    // to happen.
    const builders = filesMatching(/`envoy:\/\/pair\?\$\{|"envoy:\/\/pair\?"|'envoy:\/\/pair\?'/);
    expect(builders).toEqual(["packages/api/src/envoy-pair-uri.ts"]);

    // The parser reads the scheme it writes, and is defined once.
    const parserDefinitions = filesMatching(/export function parseEnvoyPairUri/);
    expect(parserDefinitions).toEqual(["packages/api/src/envoy-pair-uri.ts"]);

    // Deliberately **not** asserted: `startsWith("envoy://pair")`. Two modules do
    // that — the SPA's contact-code scanner and the URI parser — and the first only
    // *classifies* a scanned code, passing it through unchanged. Banning it would ban
    // a UI from recognising its own QR codes. The invariant that matters is that
    // reading the payload happens once, and the round-trip test proves the two agree.
  });

  it("declares the relay roster in exactly one module", () => {
    const declarations = filesMatching(/export const DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR\s*=/);
    expect(declarations).toEqual(["packages/api/src/default-bootstrap.ts"]);
    const usRelay = filesMatching(/export const DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR\s*=/);
    expect(usRelay).toEqual(["packages/api/src/default-bootstrap.ts"]);
  });

  it("surfaces the roster and the QR helpers on the product-facing package", () => {
    // A product depends on `@envoymesh/reuse-host`; needing to know that the roster
    // lives in `api/core` and the codec in `protocol` is how products drift apart.
    expect(DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR).toMatch(/^\/ip4\/.*\/p2p\//);
    expect(DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR).toMatch(/^\/ip4\/.*\/p2p\//);

    const source = readFileSync(path.join(here, "../src/index.ts"), "utf8");
    for (const symbol of [
      "buildEnvoyPairUri",
      "parseEnvoyPairUri",
      "encodePairingToken",
      "decodePairingToken",
      "DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR",
      "DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS",
    ]) {
      expect(source, `${symbol} must be exported for a product to join the group`).toContain(symbol);
    }
  });

  it("round-trips through the one shared implementation", () => {
    // The interop claim, in one line: what this package builds, this package's
    // parser — and therefore EnvoyMesh's own — reads back identically.
    const params = {
      wsUrl: "ws://192.168.1.20:3030/ws",
      token: "pair-token",
      ownerPublicKey: "-----BEGIN PUBLIC KEY-----",
      ownerId: "envoy:owner:alice",
      homeNodePeerId: "12D3KooWHome",
      // Which app minted the code travels with it: that is what lets a phone app
      // refuse another product's QR instead of pairing with the wrong desktop app.
      app: "EnvoyCoder",
    };
    const uri = buildPairingUri(params);
    expect(uri.startsWith("envoy://pair?")).toBe(true);
    expect(parsePairingUri(uri)).toEqual(params);
  });

  it("carries the relay identity in the pairing payload", () => {
    // Two apps only meet through the same relay if the QR code says which relay to
    // use; the field exists in the shared contract for exactly that reason.
    const uri = buildPairingUri({
      wsUrl: "ws://x/ws",
      token: "t",
      ownerPublicKey: "k",
      ownerId: "o",
      relayPeerId: "12D3KooWRelay",
    });
    expect(parsePairingUri(uri)?.relayPeerId).toBe("12D3KooWRelay");
  });
});
