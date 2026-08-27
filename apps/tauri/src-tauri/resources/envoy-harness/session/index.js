/**
 * F14 — session sub-module: the `PersistedSession`
 * (disk-backed `Session` impl) + the `SessionStore`
 * (directory-aware loader/saver/lister).
 *
 * **Re-exports** for the public API (Package 1
 * surface): the host wires these via
 * `Agent(session: PersistedSession)` or via
 * `SessionStore` for `--resume` / `--fork` flows.
 *
 * **T3.2:** `resolveSession` (the CLI's session
 * resolver for `--resume` / `--fork` / `--persist`)
 * lives here too. It used to be in `cli/run.ts`;
 * moving it next to the session types makes the
 * session sub-module the single home for everything
 * session-shaped.
 */
export { PersistedSession } from "./persisted-session.js";
export { SessionStore } from "./session-store.js";
export { resolveSession } from "./resolve.js";
export { indexSessionDirectory, indexSessionFile, isPathInside, } from "./indexer.js";
export { createSessionQueryService, makeSessionQueryTool, registerSessionQueryTool, } from "./query.js";
//# sourceMappingURL=index.js.map