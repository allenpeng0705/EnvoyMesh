/**
 * AGENTS.md discovery — verbatim Codex pattern.
 *
 * Walks up from `cwd` to the nearest ancestor with a `projectRootMarker`
 * (e.g. `.git`), collecting every `AGENTS.md` (and any `fallbackFilenames`)
 * along the way. Concatenates them into a single `assembled` string
 * with origin/path comments, respecting a `maxBytes` budget.
 *
 * **Design doc:** `docs/design.md` §9. Mirrors
 * `codex-rs/core/src/agents_md.rs:1-90` line-for-line.
 *
 * **The algorithm (5 steps):**
 *
 * 1. **Find the project root.** Walk up from `cwd` looking for any
 *    `projectRootMarker`. Stop at the first match. If no match is
 *    found, the cwd itself is the project root.
 *
 * 2. **Collect doc paths.** From the project root down to the cwd
 *    (inclusive), at each directory, look for `AGENTS_MD_FILENAME`
 *    and any `fallbackFilenames`. The list is ordered root-first
 *    (project root first, cwd last) so the byte budget favors the
 *    project root's instructions — the Codex pattern. The design
 *    doc §9 sketch (which reverses the walk) is authoritative.
 *
 * 3. **Read each doc, respecting `maxBytes`.** Truncate the LAST doc
 *    that would exceed the budget; never start a new one. This is the
 *    same byte-budget policy as Codex: the project root's instructions
 *    are always included; the most specific (cwd) instructions are
 *    truncated if everything together is too big.
 *
 * 4. **Read the override.** `AGENTS_OVERRIDE_FILENAME` in `cwd` is
 *    appended last, so it wins on conflicts. The same byte budget
 *    applies; the override may itself be truncated.
 *
 * 5. **Assemble.** Each doc is preceded by an HTML comment with the
 *    origin and path, so the model can see where each piece came
 *    from. The separator is `'\n\n--- project-doc ---\n\n'`.
 *
 * **Why this is a separate module from the rest of the runtime:**
 * the discovery algorithm is pure (input → output, no side effects
 * beyond file reads). It's easy to test in isolation, and easy to
 * reason about. The runtime reads the assembled string and injects
 * it into the system prompt.
 */
import { type DiscoveredAgentsDoc, type LoadedAgentsMd } from "../types.js";
/** Options for `discoverAgentsMd`. */
export interface DiscoveryOptions {
    /** The working directory to start the upward walk from. */
    cwd: string;
    /**
     * Files that mark a directory as a project root. The walk stops
     * at the first ancestor containing any of these.
     * Default: `['.git']`.
     */
    projectRootMarkers?: ReadonlyArray<string>;
    /**
     * Additional filenames to look for alongside `AGENTS.md`. Useful
     * for monorepos with custom names. Default: `[]`.
     */
    fallbackFilenames?: ReadonlyArray<string>;
    /**
     * Maximum total bytes across all docs (including the override).
     * Default: 32 KB.
     */
    maxBytes?: number;
    /**
     * Override the user-level docs (caller passes a list already
     * loaded; defaults to empty). Future chunk: this is where the
     * `~/.config/envoy/AGENTS.md` integration will plug in.
     */
    userDocs?: ReadonlyArray<DiscoveredAgentsDoc>;
}
/**
 * Walk up from `cwd` to find the project root, collect AGENTS.md
 * along the way, read the override, and assemble. See file header
 * for the 5-step algorithm.
 */
export declare function discoverAgentsMd(options: DiscoveryOptions): Promise<LoadedAgentsMd>;
//# sourceMappingURL=discover.d.ts.map