/**
 * Hand-written types for `scripts/lib/source-files.mjs`, which ships as plain
 * JavaScript and is imported directly by node tests.
 *
 * Why a sibling `.d.mts` rather than a test-side ambient declaration: the
 * module is **tracked** (`git ls-files scripts/lib/source-files.mjs` lists it),
 * so a declaration next to it persists in the repo and is found by every
 * importer — the four tests today, and any future TS consumer of the gates'
 * shared predicates. TypeScript resolves `./source-files.mjs` to a sibling
 * `source-files.d.mts` under `NodeNext` without needing `allowJs`, which would
 * otherwise drag the whole `.mjs` into the program and start type-checking a
 * gate script under test settings.
 *
 * The shapes below mirror the runtime exactly. `EMITTED_ARTIFACT_SUFFIXES` is a
 * mutable array at runtime, so it is declared mutable here: a `readonly` view
 * would be a stricter contract than the module actually offers.
 */

/** Suffixes that are compiler *output*, never a module a human wrote. */
export declare const EMITTED_ARTIFACT_SUFFIXES: string[];

/** True when `name` is build output rather than a hand-written source file. */
export declare function isEmittedArtifact(name: string): boolean;

/** True when `name` is a TypeScript *source* file (`foo.d.ts` is not). */
export declare function isTsSourceFile(name: string): boolean;

/** Remove comments, keeping string literals. */
export declare function stripComments(code: string): string;

/** Remove comments *and* blank out string/template literals. */
export declare function stripCommentsAndStrings(code: string): string;
