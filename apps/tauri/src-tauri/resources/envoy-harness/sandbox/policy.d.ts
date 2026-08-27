/**
 * Phase F — SandboxPolicy → landlock grants / seatbelt profile.
 */
import type { SandboxPolicy } from "../types.js";
/** Filesystem grants for landlock-run (`--ro` / `--rw`). */
export interface LandlockGrants {
    readonly readOnly: readonly string[];
    readonly readWrite: readonly string[];
}
/**
 * Translate policy into landlock-run grants.
 *
 * Allow-list: grant read-only `/` so binaries stay runnable,
 * then add write roots from the policy.
 */
export declare function policyToLandlockGrants(policy: SandboxPolicy, cwd: string): LandlockGrants;
/**
 * Build a macOS seatbelt (`sandbox-exec -p`) profile from policy.
 *
 * **Profile breadth (intentional, defense-in-depth):** the
 * default rules grant `(allow process*)`, `(allow mach*)`,
 * `(allow file-read*)` and `(allow signal)` so common CLI
 * binaries (Node, sh, git) work inside the sandbox. The 6
 * bash validators (parse-time command rejection in
 * `permissions/`) are the v1 *enforcement* layer; the
 * seatbelt profile is the *containment* layer that prevents
 * the wrapped command from touching the host filesystem
 * outside the policy's writable roots. A user who wants a
 * tighter profile can supply a custom `SandboxExecutor`.
 */
export declare function policyToSeatbeltProfile(policy: SandboxPolicy, cwd: string): string;
//# sourceMappingURL=policy.d.ts.map