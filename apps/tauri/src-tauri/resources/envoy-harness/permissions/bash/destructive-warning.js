/**
 * destructiveCommandWarning — second of the 6 bash validators.
 *
 * **Rule:** destructive commands that target root or raw devices
 * (`rm -rf /`, `dd if=... of=/dev/...`) are allowed but warned.
 *
 * **Why "allow with warning" instead of "block":** the user has
 * legitimately dangerous use cases (e.g. wiping a dev VM disk). We
 * don't pretend we can stop them; we surface the risk and let them
 * proceed. The owner-key escape hatch for `danger-full-access` is
 * the policy-level answer; this validator is the per-command answer.
 *
 * **Detection (regex):** `rm -rf /`, `dd if=... of=/dev/...`. The
 * pattern is intentionally narrow: missing a variant of a dangerous
 * command is fine (the next validator catches more), false positives
 * on a normal command are not.
 *
 * **Design doc:** §6.2 of `docs/design.md`.
 */
const DESTRUCTIVE_PATTERN = /rm\s+(-[a-z]*f[a-z]*\s+)?\/(\s|$)|dd\s+if=.*\s+of=\/dev/i;
export const destructiveCommandWarning = {
    name: "destructive-warning",
    async validate(input) {
        if (DESTRUCTIVE_PATTERN.test(input.command)) {
            return {
                kind: "allow-with-warning",
                warning: "destructive: targets root or device",
            };
        }
        return { kind: "allow" };
    },
};
//# sourceMappingURL=destructive-warning.js.map