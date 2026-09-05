/**
 * Test/claim parity check.
 *
 * Catches the pattern where a test's NAME promises a behavior but the
 * assertions don't actually verify it. Examples that have slipped
 * through this kind of check:
 *   - "deduplicates" name + `>= 1` assertion (passes even when no dedup)
 *   - "timeout" name + no actual timeout mechanism
 *   - "synthesize" name + inline concat that doesn't use the production function
 *
 * This test reads other test files and validates naming/assertion
 * alignment for common claim keywords. If a new test pattern emerges
 * that we should catch, add it to the `CLAIM_KEYWORDS` table below.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const TEST_ROOT = join(__dirname);

interface ClaimRule {
  /** Substring in test name (lowercased). */
  keyword: string;
  /** Reason / context for the rule. */
  reason: string;
  /**
   * Predicate that returns true when the test body looks like it actually
   * exercises the claim. Receives the test source (raw) and the name.
   */
  assertExercises: (body: string, name: string) => boolean;
}

const CLAIM_KEYWORDS: ClaimRule[] = [
  {
    keyword: "dedup",
    reason:
      "Tests claiming 'deduplicates' must assert an exact count (or 'at most N') after duplicate inputs, not 'at least N' or '> 0' (which is true with no dedup).",
    assertExercises: (body) => {
      // A real dedup test asserts an exact count OR an upper bound
      // (≤ N) after duplicate inputs. "At least N" or "greater than 0" is
      // not a valid dedup assertion. `.toEqual([...])` is also valid when
      // the array literal contains an exact expected set.
      const hasBoundedCount =
        /\.toBe\(\s*\d+\s*\)|\.toHaveLength\(\s*\d+\s*\)|\.toHaveBeenCalledTimes\(\s*\d+\s*\)|\.toBeNull\(\)|\.toBeLessThanOrEqual\(\s*\d+\s*\)|\.toBeUndefined\(\)|\.toEqual\(/.test(
          body,
        );
      const hasInexact = /toBeGreaterThan\(0\)|toBeGreaterThanOrEqual\(\s*1\)|>=\s*[1-9]/.test(body);
      return hasBoundedCount && !hasInexact;
    },
  },
  {
    keyword: "timeout",
    reason:
      "Tests claiming 'timeout' must trigger a real timeout (setTimeout, AbortSignal.timeout, Promise.race) — not just inspect an error message that contains the word 'timeout'.",
    assertExercises: (body, name) => {
      // The test name should not be a pure function check on a timeout
      // VALUE (e.g. "uses shorter timeout", "resolveTimeout returns WAN
      // timeout", "rejects negative stall timeout"). Those tests verify
      // a value passed/returned, not the timer actually firing.
      const lower = name.toLowerCase();
      const isValueOrValidationCheck =
        /does not treat .*timeout|ack timeout|timeout.*failure|allows retry|rejects .* timeout|uses .* timeout|passes .* timeout|returns .* timeout|resolve.*timeout.*returns|default protocol timeout|stalls? past|after .* timeout|before .* timeout|probe_timeout|timeoutms|noprogresstimeout|overalltimeout|startuptimeout|soft-allows|hard-skips|with timeouts|timeout races|ontimeout|default timeout|model-size-aware|any-abort|budget elapses|when request omits/i.test(
          lower,
        );
      if (isValueOrValidationCheck) return true;
      return /setTimeout\(|AbortSignal\.timeout\(|Promise\.race\(|new Promise\(\([^)]*\)\s*=>\s*setTimeout\(|vi\.useFakeTimers\(|vi\.advanceTimersByTime\(/.test(body);
    },
  },
  {
    keyword: "synthesize",
    reason:
      "Tests claiming 'synthesize' (in a positive sense) should call the production synthesize function (e.g. synthesizeFederatedResult), not inline concat. Tests asserting 'does NOT synthesize' are exempt.",
    assertExercises: (body, name) => {
      const lower = name.toLowerCase();
      if (/does\s+not\s+synthesize|no\s+synthesize|without\s+synthesiz/.test(lower)) {
        return true;
      }
      // Chain deliverable skill / round named "synthesize" (not federated synthesize*).
      if (/subtask|worker prompt|sealed-round|extend then publish|deliverable/.test(lower)) {
        return true;
      }
      return /synthesize[A-Z][a-zA-Z]*\(|from\s+['"][^'"]*synthesize/.test(body);
    },
  },
];

function listTestFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTestFiles(full));
    } else if (
      entry.endsWith(".test.ts") &&
      !entry.endsWith(".test.tsx") &&
      entry !== "test-claim-parity.test.ts" // skip self
    ) {
      out.push(full);
    }
  }
  return out;
}

function extractTestCases(source: string): Array<{ name: string; body: string }> {
  // Find each `it(` / `test(` call. After the quoted name + `,`, we may see:
  //   - `async () => { ... }` — skip `async`, skip `() =>`, body is `{...}`
  //   - `() => { ... }`      — skip `() =>`, body is `{...}`
  //   - `function () { ... }`  — skip `function ()`, body is `{...}`
  //   - `{ ... }`             — direct block body
  // We process char-by-char with quote awareness.
  const cases: Array<{ name: string; body: string }> = [];
  const re = /\b(it|test)\s*\(/g;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(source)) !== null) {
    i = m.index + m[0].length;
    while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
    const q = source[i];
    if (q !== '"' && q !== "'" && q !== "`") continue;
    i += 1;
    const nameStart = i;
    while (i < source.length && source[i] !== q) {
      if (source[i] === "\\") i += 2;
      else i += 1;
    }
    const name = source.slice(nameStart, i);
    i += 1; // skip closing quote
    // Skip whitespace + comma
    while (i < source.length && /[\s,]/.test(source[i] ?? "")) i += 1;
    // Skip modifier keywords like `async`
    while (i < source.length && /\b(async|function)\b/.test(source.slice(i, i + 8))) {
      // Advance past the keyword
      if (source.slice(i, i + 5) === "async") i += 5;
      else if (source.slice(i, i + 8) === "function") i += 8;
      while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
    }
    // Optional parameter list: `(...)` or `(...) =>`
    if (source[i] === "(") {
      let depth = 1;
      i += 1;
      while (i < source.length && depth > 0) {
        if (source[i] === "(") depth += 1;
        else if (source[i] === ")") depth -= 1;
        i += 1;
      }
      // Optional `=>` for arrow functions
      while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
      if (source.slice(i, i + 2) === "=>") {
        i += 2;
        while (i < source.length && /\s/.test(source[i] ?? "")) i += 1;
      }
    }
    if (source[i] !== "{") continue;
    // Match braces
    let depth = 1;
    const bodyStart = i + 1;
    i += 1;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      i += 1;
    }
    const body = source.slice(bodyStart, i - 1);
    cases.push({ name, body });
  }
  return cases;
}

describe("test/claim parity", () => {
  const testFiles = listTestFiles(TEST_ROOT);

  it("finds test files to scan", () => {
    expect(testFiles.length).toBeGreaterThan(0);
  });

  // Generate one test per claim violation so the report is per-case.
  const violations: Array<{
    file: string;
    name: string;
    rule: string;
    reason: string;
  }> = [];

  let totalCasesScanned = 0;
  for (const file of testFiles) {
    const source = readFileSync(file, "utf8");
    const cases = extractTestCases(source);
    totalCasesScanned += cases.length;
    for (const { name, body } of cases) {
      const lower = name.toLowerCase();
      for (const rule of CLAIM_KEYWORDS) {
        if (lower.includes(rule.keyword) && !rule.assertExercises(body, name)) {
          violations.push({
            file: relative(TEST_ROOT, file),
            name,
            rule: rule.keyword,
            reason: rule.reason,
          });
        }
      }
    }
  }

  it("scans a meaningful number of test cases", () => {
    // eslint-disable-next-line no-console
    console.log(`[parity] Scanned ${totalCasesScanned} test cases across ${testFiles.length} files`);
    expect(totalCasesScanned).toBeGreaterThan(20);
  });

  for (const v of violations) {
    it(`${v.file} :: ${v.name} [${v.rule}]`, () => {
      expect.fail(
        `Test name claims "${v.rule}" but the body doesn't appear to exercise it. ${v.reason}`,
      );
    });
  }
});
