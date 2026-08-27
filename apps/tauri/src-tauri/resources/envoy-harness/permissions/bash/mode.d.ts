/**
 * modeValidation — third of the 6 bash validators.
 *
 * **Rule:** if the policy does not allow network, block any command
 * that talks to the network.
 *
 * **Detection (regex):** `\bcurl\b`, `\bwget\b`, `\bnc\b`, `\bssh\b`,
 * `\bnslookup\b`. Notably absent: `ping` (not always network in the
 * blocking sense), `nc -l` (server-side, not network access),
 * `python -c "import requests"` (would need a different detector).
 * Future: extend to detect these without false positives.
 *
 * **Note on `mode !== 'read-only'`:** we don't gate this validator on
 * read-only mode because `workspace-write` can also disable network
 * (`networkAccess: false` in the policy). The validator checks the
 * policy directly, not the mode.
 *
 * **Design doc:** §6.2 of `docs/design.md`.
 */
import type { BashValidator } from "../../types.js";
export declare const modeValidation: BashValidator;
//# sourceMappingURL=mode.d.ts.map