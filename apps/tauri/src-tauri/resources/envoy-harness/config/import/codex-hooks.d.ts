/**
 * Codex `[[hook.<Event>]]` table parser → `HookHandlerSpec[]`.
 */
import type { HookHandlerSpec } from "../schema.js";
/**
 * Parse codex/envoy `hook` nested tables:
 * `[[hook.PreToolUse]]` → `{ hook: { PreToolUse: [...] } }`.
 */
export declare function parseCodexHookTable(hookRoot: unknown): HookHandlerSpec[];
//# sourceMappingURL=codex-hooks.d.ts.map