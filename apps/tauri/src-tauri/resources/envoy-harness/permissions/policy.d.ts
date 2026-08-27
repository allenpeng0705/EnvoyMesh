/**
 * Shared `SandboxPolicy` builder.
 *
 * **Why a single module:** the agent and the bash tool each
 * used to derive the policy from the session's permission
 * mode in two separate copies that could drift (implementation-
 * plan risk 5.1). Both now import `policyFromMode` from here.
 *
 * **Stability:** additive. `policyFromMode` is the public
 * surface.
 *
 * **Default backend is "none" (validators only).** The six
 * bash validators (§6) are the v1 enforcement layer — they
 * parse the command and reject dangerous operations at the
 * shell-syntax level. The kernel-level sandbox (landlock /
 * seatbelt) is a defense-in-depth second layer that must be
 * explicitly opted into by setting `policy.backend` to
 * `"linux-landlock"` (or by injecting a `SandboxExecutor`
 * via `AgentOptions`). Defaulting to "none" keeps the test
 * suite hermetic — no real kernel required, no Mac CI broken
 * by sandbox-exec restrictions.
 */
import type { PermissionMode, SandboxPolicy } from "../types.js";
/**
 * Build a `SandboxPolicy` from a permission mode and cwd.
 *
 * | mode               | backend | network |
 * |--------------------|---------|---------|
 * | read-only          | none    | no      |
 * | workspace-write    | none    | no      |
 * | danger-full-access | none    | yes     |
 *
 * **To enable the kernel-level sandbox:** set
 * `policy.backend = "linux-landlock"` (or pass a custom
 * `SandboxPolicy` to the Agent). See `resolveSandboxExecutor`
 * for the resolver semantics.
 */
export declare function policyFromMode(mode: PermissionMode, cwd: string): SandboxPolicy;
//# sourceMappingURL=policy.d.ts.map