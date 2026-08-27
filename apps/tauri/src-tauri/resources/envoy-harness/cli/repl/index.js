/**
 * F17.1 + F17.2 + F17.2.5 + F17.5 + F17.6 + F14.1 + F14.3 — REPL public surface.
 *
 * Re-exports the public API for the REPL. The CLI runner imports
 * `runRepl` from here; tests can import the same entry point.
 *
 * **Stability:** the surface here is F17.1 + F17.2 + F17.2.5
 * + F17.5 + F17.6 + F14.1 + F14.3. F17.3 (history helpers)
 * and F17.4 (e2e tests) had no public API additions.
 */
export { runRepl } from "./loop.js";
export { BUILTIN_COMMANDS } from "./commands.js";
export { BUILTIN_INFO_COMMANDS } from "./commands-info.js";
export { BUILTIN_TIER2_COMMANDS } from "./commands-tier2.js";
export { BUILTIN_TIER2_BATCH2_COMMANDS } from "./commands-tier2-batch2.js";
export { BUILTIN_TIER2_BATCH3_COMMANDS } from "./commands-tier2-batch3.js";
export { BUILTIN_TIER2_BATCH4_COMMANDS } from "./commands-tier2-batch4.js";
export { ReplCommandRegistry, dispatchCommand, parseCommandLine, } from "./registry.js";
//# sourceMappingURL=index.js.map