/**
 * readOnlyValidation — first of the 6 bash validators (composition in
 * `../index.ts`).
 *
 * **Rule:** if the policy is read-only and the command writes, block.
 *
 * **Detection (heuristic):**
 * - Any output redirect: `>`, `>>`, `2>`, `&>`, `>|`, `<>`, including
 *   no-space forms like `echo hi>file`. Exceptions: fd duplication
 *   (`2>&1`, `>&2`, `>&-`) and redirects to `/dev/null` / `/dev/tty`
 *   (no persistent write).
 * - Write-intent commands: `tee`, `sed -i`, `mv`, `cp`, `rm`, `touch`,
 *   `mkdir`, `rmdir`, `chmod`, `chown`, `chgrp`, `ln`, `truncate`,
 *   `fallocate`, `mktemp`, `install`, `rsync`, `dd`.
 * - Git commands that mutate the repo or network: `git add/commit/push/
 *   pull/fetch/clone/merge/rebase/cherry-pick/revert/reset/stash/clean/
 *   restore/switch/checkout/tag/init/rm/mv/apply/am/gc/prune/update-ref/
 *   symbolic-ref`. Read-only git (`status`, `log`, `diff`, `show`) stays
 *   allowed. Note: this also blocks `git checkout -b` in read-only mode
 *   (creating a branch writes `.git`), which is a deliberate tightening
 *   of the v0 design example.
 * - Package managers installing packages: `npm/yarn/pnpm/bun
 *   (add|i|install|update|remove|rm)`.
 *
 * **Known limitation:** interpreter-based writes (`python3 -c "open(...,'w')"`)
 * cannot be detected by string heuristics; that class requires an OS-level
 * sandbox (see design §7), which is not yet implemented. This validator
 * closes the deterministic gaps (redirects, write verbs).
 *
 * **This is not a parser. It's a heuristic.** The composition of 6 such
 * heuristics is the security story, not any one of them. A user who
 * truly needs to write in read-only mode should be in workspace-write,
 * not bypassing the heuristic.
 *
 * **Design doc:** §6.2 of `docs/design.md`.
 */
import type { BashValidator } from "../../types.js";
export declare const readOnlyValidation: BashValidator;
//# sourceMappingURL=read-only.d.ts.map