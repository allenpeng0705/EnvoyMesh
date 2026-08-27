/**
 * pathValidation — fifth of the 6 bash validators.
 *
 * **Rule:** in workspace-write mode, every path-like token in
 * `argv` must resolve to a path under one of the `writable_roots`
 * (or the cwd if no roots are configured).
 *
 * **Why per-argument and not command-string scan?** the argv is
 * already tokenized (the bash tool passes a real tokenizer's
 * output; tests pass explicit argv). Scanning the command string
 * for paths is brittle (paths can be inside quotes, behind
 * variables, escaped). Tokenized argv is what the shell will
 * actually pass to the command.
 *
 * **Why relative paths are checked too (not just `/` and `~`)?**
 * `../sibling` and `..` escape the workspace without starting
 * with `/`. v0 only checked absolute/`~` tokens, which let
 * `rm -rf ../secret` and `echo hi > ../outside.txt` through.
 * The design §2.5 itself flags this as the classic
 * `pathValidation` failure mode ("lets `../` escape cwd").
 * A token is treated as a path when it starts with `/`, `~`,
 * or `.`, or contains a `/`. Plain filenames (`file.txt`) are
 * resolved against cwd and are inside the roots by definition.
 *
 * **What is skipped:** flag-like tokens starting with `-` (e.g.
 * `-name`, `-m`) and shell operators (`>`, `&&`, `|`, `;`).
 *
 * **Why `path.resolve`?** `argv` paths may be relative. We resolve
 * them against `cwd` so a relative `../foo` is checked against the
 * roots correctly.
 *
 * **Why boundary-aware root matching?** `expanded.startsWith(root)`
 * would accept `/home/foo2` when the root is `/home/foo`. We compare
 * against `root + path.sep` so a sibling directory is rejected.
 *
 * **Design doc:** §6.2 of `docs/design.md`.
 */
import type { BashValidator } from "../../types.js";
export declare const pathValidation: BashValidator;
//# sourceMappingURL=path.d.ts.map