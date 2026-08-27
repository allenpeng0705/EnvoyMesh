/**
 * Auto-run permission policy (Codex / Claude-style modes) for ACP
 * sessions, the TUI, and hosts:
 *
 * - `always-confirm` — ask for every tool.
 * - `safe-only` (default) — auto-allow read-only tools AND safe bash
 *   commands; ask for everything else.
 * - `off` — never ask (auto-allow everything).
 *
 * This is the session-level counterpart of the EnvoyMesh
 * `envoyHarnessAutoRunPolicy`; keeping the classifier here lets the TUI
 * and any ACP host offer the same three modes without importing EnvoyMesh.
 */
/** Read-only / low-risk tools that `safe-only` may auto-allow. */
export declare const AUTO_RUN_SAFE_TOOLS: ReadonlySet<string>;
export type AutoRunPolicy = "always-confirm" | "safe-only" | "off";
export declare function isAutoRunSafeBashCommand(command: string | undefined): boolean;
/**
 * Whether the session should ASK for this tool call under the policy.
 * Returns `undefined` when the policy is not set (caller falls back to
 * its own shouldAsk).
 */
export declare function shouldAskUnderAutoRun(policy: AutoRunPolicy | undefined, toolName: string, args?: unknown): boolean | undefined;
//# sourceMappingURL=auto-run.d.ts.map