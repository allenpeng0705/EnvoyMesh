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
/**
 * Match a write redirect: any `>` or `>>` that is not fd duplication
 * (`>&0`, `>&1`, `>&2`, `>&-`) and not a redirect to `/dev/null` /
 * `/dev/tty` (no persistent filesystem write).
 *
 * Examples:
 * - `echo hi > file`      matches
 * - `echo hi >> file`     matches
 * - `echo hi>file`        matches (no space before `>`)
 * - `ls 2>/tmp/out.txt`   matches (fd redirect to a real file)
 * - `cmd &>file`          matches (combined stdout+stderr redirect)
 * - `cmd 2>&1`            does NOT match (fd duplication)
 * - `cmd >&2`             does NOT match (fd duplication)
 * - `ls 2>/dev/null`      does NOT match (no persistent write)
 *
 * Known false positive: a literal `>` in a comparison such as
 * `$((a>b))` or inside quoted text. This is the price of the
 * "read-only means no writes" guarantee; the v0 heuristic errs
 * on the side of blocking.
 */
const REDIRECT_PATTERN = />\s*(?!&[0-9-])(?!\s*\/dev\/(?:null|tty)\b)|>>/;
const WRITE_PATTERN = new RegExp([
    REDIRECT_PATTERN.source,
    "\\btee\\b",
    "sed -i",
    "\\bmv\\b",
    "\\bcp\\b",
    "\\brm\\b",
    "\\bdd\\b",
    "\\btouch\\b",
    "\\bmkdir\\b",
    "\\brmdir\\b",
    "\\bchmod\\b",
    "\\bchown\\b",
    "\\bchgrp\\b",
    "\\bln\\b",
    "\\btruncate\\b",
    "\\bfallocate\\b",
    "\\bmktemp\\b",
    "\\binstall\\b",
    "\\brsync\\b",
    // Git commands that mutate the repo (or the network).
    "\\bgit\\s+(?:add|commit|push|pull|fetch|clone|merge|rebase|cherry-pick|revert|reset|stash|clean|restore|switch|checkout|tag|init|rm|mv|apply|am|gc|prune|update-ref|symbolic-ref)\\b",
    // Package managers installing / removing packages.
    "\\b(?:npm|yarn|pnpm|bun)\\s+(?:add|i|install|update|remove|rm)\\b",
].join("|"), "i");
export const readOnlyValidation = {
    name: "read-only",
    async validate(input) {
        if (input.policy.mode !== "read-only")
            return { kind: "allow" };
        if (WRITE_PATTERN.test(input.command)) {
            return { kind: "block", reason: "read-only mode cannot write" };
        }
        return { kind: "allow" };
    },
};
//# sourceMappingURL=read-only.js.map