/**
 * Bash validator composition — the public entry point for the 6
 * bash safety validators.
 *
 * **Composition rules (per design §6.2):**
 *
 * 1. First pass: any `block` short-circuits. A blocked command never
 *    sees warnings — the user is told "this is blocked" and the
 *    command does not run. Warnings about the same command are noise.
 *
 * 2. Second pass: any `allow-with-warning` short-circuits. If the
 *    command survives all the blocking checks but triggers a warning,
 *    the warning is shown to the user. The command may still run.
 *
 * 3. If neither pass short-circuits: `allow`. The command is benign.
 *
 * **Why two passes, not one?** because warnings and blocks are
 * different signals. A command that's both dangerous (`rm -rf /`)
 * and structurally broken (unbalanced quotes) should fail on the
 * first signal (the block), not confuse the user with both. A
 * command that's dangerous but structurally fine should warn, not
 * block silently.
 *
 * **Order matters:** the `ALL_VALIDATORS` array order is the order
 * validators run. The first validator to block wins. The first
 * validator to warn wins (in the second pass). A future change to
 * this order changes user-visible behavior; tests catch it.
 *
 * **Stability:** this file is the wire-equivalent of the bash
 * safety spine. Changes here ripple through every bash call. New
 * validators are added by appending to `ALL_VALIDATORS`, not by
 * editing this composition.
 */
import { commandSemanticsValidation } from "./semantics.js";
import { destructiveCommandWarning } from "./destructive-warning.js";
import { modeValidation } from "./mode.js";
import { pathValidation } from "./path.js";
import { readOnlyValidation } from "./read-only.js";
import { sedValidation } from "./sed.js";
// Re-export each validator for direct access (e.g., in tests).
export { commandSemanticsValidation, destructiveCommandWarning, modeValidation, pathValidation, readOnlyValidation, sedValidation, };
/**
 * The 6 bash safety validators, in execution order.
 *
 * - read-only first: cheapest heuristic; catches the most common
 *   case (read-only mode with a write attempt).
 * - mode: also cheap; catches network access in wrong mode.
 * - sed: cheap regex; system-path block.
 * - path: slightly more expensive (path.resolve per arg); runs in
 *   workspace-write mode only.
 * - destructive-warning: cheap regex; the only "allow with warning"
 *   verdict.
 * - command-semantics last: parses the command string; most
 *   expensive of the cheap checks.
 *
 * **Adding a 7th validator:** append to this array. The composition
 * picks it up automatically. The order is significant for
 * short-circuiting; the first blocker wins.
 */
export const ALL_VALIDATORS = [
    readOnlyValidation,
    modeValidation,
    sedValidation,
    pathValidation,
    destructiveCommandWarning,
    commandSemanticsValidation,
];
/**
 * Run all 6 validators against a bash command. Returns the first
 * blocking verdict, the first warning verdict, or `allow` if all
 * pass.
 *
 * **Idempotent:** `validateBash(input)` is a pure function of `input`.
 * Calling it twice with the same input returns the same verdict.
 *
 * **Async:** all validators are async (the `BashValidator` interface
 * returns `Promise<BashVerdict>`) so future validators can do I/O
 * (e.g., check a remote policy service). The current 6 are all
 * synchronous internally; the await is a formality.
 */
export async function validateBash(input) {
    // First pass: any block short-circuits.
    for (const v of ALL_VALIDATORS) {
        const verdict = await v.validate(input);
        if (verdict.kind === "block")
            return verdict;
    }
    // Second pass: surface the first warning, if any.
    for (const v of ALL_VALIDATORS) {
        const verdict = await v.validate(input);
        if (verdict.kind === "allow-with-warning")
            return verdict;
    }
    return { kind: "allow" };
}
//# sourceMappingURL=index.js.map