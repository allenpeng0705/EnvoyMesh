/**
 * The **static** half of the §6.1 two-layer acceptance.
 *
 * `docs/envoymesh-refactoring-plan.md` §6.1 requires that a product's own
 * desktop app can host QR + host:port **without inheriting any social concept**.
 * That is asserted two ways: behaviourally (`ws-event-dispositions.test.ts`,
 * `ws-session-identity.test.ts`, `kernel-composability-probe.test.ts`) and
 * statically — here.
 *
 * ## Why this test exists rather than a documented grep
 *
 * The acceptance was originally written as a list of symbols that "must be
 * unreachable from `ws-server.ts`". Run by hand that is a grep, and a grep over
 * the file counts **comments** — it flagged this very refactor's explanatory
 * prose four separate times (see §2.7's correction notes). So the check is
 * mechanised, comment-stripped, and runs in CI: the same lesson the classifier
 * had to learn, applied to the acceptance criterion itself.
 *
 * ## What "unreachable" means here
 *
 * Not "the string does not appear" but:
 *   1. no such **import** in `ws-server.ts`, and
 *   2. no such **identifier** in its comment-stripped code, and
 *   3. no cast to the concrete implementation class.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripCommentsAndStrings } from "../../../scripts/lib/source-files.mjs";

const WS_SERVER = new URL("../../../packages/host-connect/src/ws-server.ts", import.meta.url);

/** Comments removed and string literals blanked — the *shared* scanner from
 * `scripts/lib/source-files.mjs`, not a local regex copy. The regex version
 * deleted real code here: a comment marker inside a log string opened a bogus
 * block comment and swallowed text up to the next terminator, so this scan was
 * reading a file with parts missing — caught by a guard asserting that an
 * identifier survives stripping. */
const codeOf = stripCommentsAndStrings;

/**
 * The social concepts and implementation details the transport must not reach.
 * Every one of these was present before the host split.
 */
const FORBIDDEN = [
  // The family-profile model
  "OWNER_FAMILY_PROFILE_ID",
  "listFamilyProfiles",
  "healSessionProfileFromBinding",
  "touchFamilyProfileLastSeen",
  // Social thread-key parsing (moved out in H3)
  "parseFamilyThreadKey",
  "parseAiBotThreadKey",
  "parseBridgeThreadKey",
  "parseEnvoyAiProfileId",
  "isEnvoyAiThreadKey",
  // The concrete implementation class and its impl-only field (H4)
  "NodeServiceImpl",
  "callManager",
] as const;

describe("§6.1 static acceptance — the host reaches no social concept", () => {
  const source = readFileSync(WS_SERVER, "utf8");
  const code = codeOf(source);

  it("the scan is not vacuous", () => {
    // Guard the guard: if comment-stripping emptied the file, every assertion
    // below would pass for the wrong reason.
    //
    // This was a *character* ratio (>30% of the raw file). It broke for a
    // legitimate reason — the extraction added a lot of port documentation, and
    // the file carries long log strings that `codeOf` blanks, so the stripped
    // text fell to 25% of the raw length while nothing was wrong — and a line
    // ratio is no better, because removing block comments also removes lines.
    // Any ratio is a proxy for "the scan produced something"; assert that
    // directly instead, in both directions: real code survives, a comment does
    // not.
    expect(code.length).toBeGreaterThan(4000);
    for (const marker of ["emitEventToProfile", "class WsServer", "handleMessage"]) {
      expect(code, `${marker} must survive comment stripping`).toContain(marker);
    }
    // A phrase that exists **only** in a doc comment in this file: if the
    // stripper stopped removing comments, the FORBIDDEN scan below would start
    // reading prose, which is the failure that has bitten this repo six times.
    expect(code).not.toContain("denies one socket, not the whole fan-out");
  });

  for (const symbol of FORBIDDEN) {
    it(`does not reference \`${symbol}\``, () => {
      const word = new RegExp(`\\b${symbol}\\b`);
      expect(code, `\`${symbol}\` is reachable from ws-server.ts`).not.toMatch(word);
    });
  }

  it("imports nothing from the social policy or the concrete implementation", () => {
    const imports = [...source.matchAll(/^import[^;]*from "([^"]+)";/gm)].map((m) => m[1]);
    expect(imports).not.toContain("./social-ws-policy.js");
    expect(imports).not.toContain("./node-service-impl.js");
    // A social symbol must not arrive through any other module either.
    const socialImports = imports.filter((i) => /social|family|persona/i.test(i));
    expect(socialImports, `unexpected social import: ${socialImports.join(", ")}`).toEqual([]);
  });

  it("casts to no concrete service implementation", () => {
    const serviceCasts = [...code.matchAll(/as\s+(?:any|unknown\s+as\s+)?\w*NodeService\w*/g)].map(
      (m) => m[0],
    );
    expect(serviceCasts).toEqual([]);
  });

  it("its extension points come from the reusable host contract", () => {
    // The positive side of the claim: what the host DOES depend on is the
    // contract, which the manifest classifies `reusable`.
    expect(source).toContain('from "./ws-host-contract.js"');
  });
});
