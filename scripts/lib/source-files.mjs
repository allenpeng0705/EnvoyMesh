/**
 * Shared file predicates for the repo's gate scripts.
 *
 * **Why this module exists.** Two gates walk `src` trees and both must answer
 * the same question — *is this file a source module?* — and one of them answered
 * it wrongly: `classify-modules.mjs` used `name.endsWith(".ts")`, which is also
 * true of `.d.ts`. That is not a hypothetical: after the `@envoymesh/host-connect`
 * extraction a stray `tsc` emission put `*.d.ts` files **inside `src/`**, and the
 * classifier counted them as **modules** — the manifest grew by five phantom
 * entries (810 instead of 805) with no compile error anywhere. The gate's
 * artifact was wrong by a number the CI gate then compared against.
 *
 * Two scripts with two copies of that predicate would drift the same way, so
 * there is one copy, and `scripts/test/gates.test.mjs` pins its edges.
 */

/** Suffixes that are compiler *output*, never a module a human wrote. */
export const EMITTED_ARTIFACT_SUFFIXES = [
  // Declarations (and their maps) — never hand-written when a sibling source
  // exists, and never importable in any case.
  ".d.ts",
  ".d.ts.map",
  ".d.mts",
  ".d.cts",
  // Compiled JS. `.mts`/`.cts` are deliberately **not** here: those are source
  // extensions. The first draft of this list had them, and the predicate then
  // called a hand-written `index.mts` compiler output.
  ".js",
  ".js.map",
  ".cjs",
  ".mjs",
  ".tsbuildinfo",
];

/** True when `name` is build output rather than a hand-written source file. */
export function isEmittedArtifact(name) {
  return EMITTED_ARTIFACT_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * True when `name` is a TypeScript *source* file — a `.ts`/`.mts`/`.cts` module
 * that a human wrote, excluding declarations and every other build artifact.
 *
 * Note the order: declaration files are checked first, because `foo.d.ts` also
 * ends in `.ts` and that collision is exactly the bug this helper exists to
 * prevent.
 */
export function isTsSourceFile(name) {
  if (isEmittedArtifact(name)) return false;
  return name.endsWith(".ts") || name.endsWith(".mts") || name.endsWith(".cts");
}

/**
 * Remove comments, **keeping string literals**.
 *
 * The two halves are both load-bearing, and confusing them has broken this
 * repo's gates **six times** — every one a variant of "a thing that is not code
 * was read as code":
 *
 * | # | Where | What was misread |
 * |---|---|---|
 * | 1 | `classify-modules.mjs` concept matching | a concept named in a comment (tainted 7 files) |
 * | 2 | `classify-modules.mjs` directive extraction | an import documented in a doc comment, read as a real edge |
 * | 3 | `reuse_test.dart` self-scan | a social import written in prose |
 * | 4 | the §6.1 acceptance grep | this refactor's own explanatory comments |
 * | 5 | the H5 static symbol check | `HostNodeService` matching a substring test for `NodeService` |
 * | 6 | `check-workspace-wiring.mjs` (first run) | `{@link import("@envoymesh/api")}` in a **doc comment** read as a real dependency — 20 of its first 26 findings |
 *
 * So there is one implementation, and callers pick the variant they need:
 *
 * - `stripComments` — keep strings. Use for **directives** (`import … from "x"`),
 *   because the specifier *is* a string literal.
 * - `stripCommentsAndStrings` — blank strings too. Use for **concept/identifier**
 *   scanning, where a name appearing inside a string is not a reference.
 *
 * ## Why this is a character scanner and not three regexes
 *
 * It was three regexes, and they were wrong in a way that mattered: `//` inside a
 * string is not a comment, and `"` inside a comment does not open a string. The
 * regex version deleted from a URL or a `/* … *​/`-looking literal to the end of
 * the line, and worse, could delete a *span*: an `envoy://` template literal lost
 * its closing backtick, which made the template-matching regex that ran next
 * blank out thousands of characters — including the identifier
 * `boundFamilyProfileId` in a real concept scan. Measured on this repo before the
 * fix: 109 files ended with a dangling backtick, 114 lost more than three code
 * identifiers, and the *only* reason no verdict was wrong is that the affected
 * file is `product-bound` anyway. That is luck, not correctness, and this helper
 * is the primitive both boundary gates trust.
 *
 * Known limit, deliberately not fixed here: this does not attempt to detect
 * **regex literals**, because distinguishing `/` as division, as a regex start,
 * and as a comment start needs a parser. A regex containing `//` (e.g.
 * `/https?:\/\//` written as `/https?:///`) can therefore still be mis-read — no
 * such literal exists in this repo today, and the divergence would show up as a
 * *changed manifest*, which is what `classify-modules.mjs --check` compares.
 */
export function stripComments(code) {
  let out = "";
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i];
    const next = code[i + 1];
    if (ch === "/" && next === "/") {
      while (i < n && code[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < n && !(code[i] === "*" && code[i + 1] === "/")) i += 1;
      i += 2;
      // A block comment can separate tokens (`a/* */b`); keep them separate.
      out += " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = code[i];
        out += c;
        if (c === "\\") {
          if (i + 1 < n) out += code[i + 1];
          i += 2;
          continue;
        }
        i += 1;
        if (c === quote) break;
        if (c === "\n" && quote !== "`") break; // unterminated — do not run away
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Remove comments *and* blank out string/template literals. See `stripComments`. */
export function stripCommentsAndStrings(code) {
  return stripComments(code)
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}
