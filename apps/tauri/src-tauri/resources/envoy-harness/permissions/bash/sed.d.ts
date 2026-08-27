/**
 * sedValidation — fourth of the 6 bash validators.
 *
 * **Rule:** `sed -i` (in-place edit) on a system path is a common
 * disaster. Block it.
 *
 * **Detection (regex):** the command must contain `sed -i` AND one of
 * `/etc/`, `/usr/`, `/var/`, `/bin/`, `/sbin/`. The system path list
 * mirrors the FHS (Filesystem Hierarchy Standard); if a user has
 * weird paths, they can override via the policy.
 *
 * **Why not block all `sed -i`?** `sed -i` is the right tool for many
 * in-place edits (config files in a project, log rotation, etc.).
 * Blocking it would be too restrictive. The dangerous variant is
 * specifically on system files.
 *
 * **Design doc:** §6.2 of `docs/design.md`.
 */
import type { BashValidator } from "../../types.js";
export declare const sedValidation: BashValidator;
//# sourceMappingURL=sed.d.ts.map