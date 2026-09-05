/**
 * Phase 61D — reliability → ranking feedback UX source-level guard.
 *
 * Pins the 4 moving parts of the 61D claim "Preview/start surfaces
 * `reliabilityFallbackLevel` when reliability store is sparse":
 *
 *   1. `node-service-chain-orchestration.ts` writes the field onto
 *      each ranked worker (so the wire payload carries it).
 *   2. `WorkerReliabilityStore` projects the 5-level
 *      `fallbackLevel: "exact" | "peer_runtime_skill" | ...` so the
 *      downstream UI can branch on it.
 *   3. `apps/social/src/components/ChainStartDialog.tsx` renders the
 *      sparse-data chip when `reliabilityFallbackLevel !== "exact"`.
 *   4. `apps/envoygo/lib/screens/chains/start_chain_screen.dart`
 *      renders the same chip with a per-level translated label.
 *
 * These are full source-level guards (read .ts/.dart source via fs,
 * assert regex presence/absence). The runtime behaviour is a direct
 * consequence of the source structure: removing the chip condition
 * would silently regress the UX with no test catching it. Sanity-broke
 * each test once before checking in to confirm it fails on corruption.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ORCHESTRATION = resolve(
  __dirname,
  "../src/node-service-chain-orchestration.ts",
);
const RELIABILITY = resolve(__dirname, "../src/worker-reliability-store.ts");
const SOCIAL_DIALOG = resolve(
  __dirname,
  "../../social/src/components/ChainStartDialog.tsx",
);
const ENVOYGO_SCREEN = resolve(
  __dirname,
  "../../envoygo/lib/screens/chains/start_chain_screen.dart",
);

function readSrc(path: string): string {
  return readFileSync(path, "utf8");
}

function readSlice(path: string, fromLine: number, toLine: number): string {
  return readSrc(path)
    .split("\n")
    .slice(fromLine - 1, toLine)
    .join("\n");
}

describe("Phase 61D — reliability UX wiring (source-level)", () => {
  it("chain orchestrator writes reliabilityFallbackLevel onto each ranked worker", () => {
    const slice = readSlice(ORCHESTRATION, 2620, 2660);
    expect(
      slice,
      "expected the ranked-worker object built in the orchestrator to "
        + "expose `reliabilityFallbackLevel: reliabilityProj.fallbackLevel`. "
        + "Without this the wire payload has no way to surface sparse data "
        + "to the UI, and the Social/EnvoyGo chip can never light up.",
    ).toMatch(/reliabilityFallbackLevel\s*:\s*reliabilityProj\.fallbackLevel/);
  });

  it("WorkerReliabilityStore projects the 5 fallback levels (exact, peer_runtime_skill, peer_runtime, runtime_skill, prior)", () => {
    const src = readSrc(RELIABILITY);
    // The 5-level union is the source of truth for what the UI can branch on.
    for (const level of [
      '"exact"',
      '"peer_runtime_skill"',
      '"peer_runtime"',
      '"runtime_skill"',
      '"prior"',
    ]) {
      expect(
        src,
        `WorkerReliabilityStore must declare fallbackLevel "${level.replace(/"/g, "")}"`,
      ).toContain(level);
    }
  });

  it(
    "Social ChainStartDialog shows the sparse chip when reliabilityFallbackLevel !== 'exact'",
    () => {
      const slice = readSlice(SOCIAL_DIALOG, 695, 720);
      expect(
        slice,
        "Social dialog must read `suggested.reliabilityFallbackLevel` and "
          + "branch on it: only render the chip when it is set and not "
          + "equal to 'exact'. Without this branch the chip would light up "
          + "for fully-tracked workers too (false-positive sparse data).",
      ).toMatch(/reliabilityFallbackLevel/);
      // The exact-not-equal check pins the inverse logic.
      expect(
        slice,
        "Social dialog must compare reliabilityFallbackLevel against "
          + "the literal 'exact' string. Removing this comparison would "
          + "render the chip on every worker.",
      ).toMatch(/!==\s*["']exact["']/);
    },
  );

  it(
    "Social ChainStartDialog uses a dedicated data-testid for the sparse chip "
      + "(so E2E can target it without coupling to copy)",
    () => {
      const src = readSrc(SOCIAL_DIALOG);
      expect(
        src,
        "sparse chip must carry `data-testid=\"chain-worker-reliability-fallback\"` "
          + "so future E2E / Playwright can target it without coupling to the "
          + "translated copy. Removing the testid would break the contract for "
          + "downstream selection tests.",
      ).toContain('data-testid="chain-worker-reliability-fallback"');
    },
  );

  it(
    "EnvoyGo start_chain_screen has _reliabilityFallbackLevelLabel helper covering all 5 levels",
    () => {
      const src = readSrc(ENVOYGO_SCREEN);
      // The switch helper is the single source of truth for the
      // per-level translated string. Removing a case is a regression.
      expect(
        src,
        "EnvoyGo start screen must declare `_reliabilityFallbackLevelLabel` "
          + "with a switch over the 5 fallback levels.",
      ).toContain("_reliabilityFallbackLevelLabel");
      for (const level of [
        "peer_runtime_skill",
        "peer_runtime",
        "runtime_skill",
        "prior",
      ]) {
        expect(
          src,
          `EnvoyGo helper must handle level "${level}" (case branch).`,
        ).toMatch(new RegExp(`case\\s+['"]${level}['"]`));
      }
    },
  );

  it(
    "EnvoyGo start_chain_screen surfaces the reliabilityFallbackLevel field from wire payload",
    () => {
      const src = readSrc(ENVOYGO_SCREEN);
      expect(
        src,
        "screen must read `w['reliabilityFallbackLevel']` (or equivalent) "
          + "from the ranked-worker payload before calling the helper. "
          + "Without the read the chip never has a value to render.",
      ).toMatch(/reliabilityFallbackLevel/);
    },
  );

  it(
    "i18n: Social en + zh include the 5 reliabilityFallback sub-keys",
    () => {
      for (const rel of [
        "../../social/src/i18n/messages/en-chains.ts",
        "../../social/src/i18n/messages/zh-chains.ts",
      ]) {
        const src = readFileSync(resolve(__dirname, rel), "utf8");
        for (const level of [
          "exact",
          "peer_runtime_skill",
          "peer_runtime",
          "runtime_skill",
          "prior",
        ]) {
          expect(
            src,
            `${rel} must define reliabilityFallback.${level}`,
          ).toMatch(new RegExp(`${level}:`));
        }
      }
    },
  );

  it(
    "i18n: EnvoyGo en + zh include the 5 reliabilityFallback keys + ReliabilityPct + ReliabilitySparse",
    () => {
      for (const rel of ["../../envoygo/lib/l10n/app_en.arb", "../../envoygo/lib/l10n/app_zh.arb"]) {
        const src = readFileSync(resolve(__dirname, rel), "utf8");
        for (const key of [
          "chainsStartReliabilityPct",
          "chainsStartReliabilitySparse",
          "chainsStartReliabilityFallbackExact",
          "chainsStartReliabilityFallbackPeerRuntimeSkill",
          "chainsStartReliabilityFallbackPeerRuntime",
          "chainsStartReliabilityFallbackRuntimeSkill",
          "chainsStartReliabilityFallbackPrior",
        ]) {
          expect(
            src,
            `${rel} must define "${key}" for the reliability chip + label.`,
          ).toContain(`"${key}"`);
        }
      }
    },
  );
});
