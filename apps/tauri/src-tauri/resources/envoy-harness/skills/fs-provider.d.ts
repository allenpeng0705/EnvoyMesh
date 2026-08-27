/**
 * Filesystem SkillProvider — scans skill roots for SKILL.md files.
 *
 * **Skill roots scanned (in priority order, project first):**
 * 1. `<cwd>/.envoy/skills/` — project-local skills
 * 2. `<cwd>/.codex/skills/` — codex compat (read-only)
 * 3. `<cwd>/.dsh/skills/` — deepseek compat (read-only)
 * 4. `~/.agents/skills/` — universal (the emerging Agent Skills spec)
 * 5. `~/.codex/skills/` — codex user-level (read-only)
 * 6. `~/.dsh/skills/` — deepseek user-level (read-only)
 *
 * **Per-file isolation:** a single malformed SKILL.md is
 * skipped + logged, never crashes the catalog. list() returns
 * the union of all parseable skills; get(name) returns the
 * first match (project-local wins over user-level).
 *
 * **No caching in v0.** The list is cheap enough (a few hundred
 * `stat` calls on a typical workstation) that a per-request
 * scan is fine. If profiling shows a hot path, add an LRU.
 */
import type { SkillProvider } from "./types.js";
/** A filesystem root to scan (relative to cwd or absolute). */
export interface SkillRoot {
    /** Display name for diagnostics. */
    readonly name: string;
    /** Absolute path to the skills directory. */
    readonly path: string;
}
export interface FilesystemSkillProviderOptions {
    /** Extra roots to scan first (e.g. test fixtures). */
    readonly extraRoots?: ReadonlyArray<SkillRoot>;
    /** Override the home directory (tests). */
    readonly homeDir?: string;
}
/** Default skill roots in priority order (project first). */
export declare function defaultSkillRoots(opts: {
    cwd: string;
    homeDir?: string;
}): ReadonlyArray<SkillRoot>;
export declare function createFilesystemSkillProvider(options?: FilesystemSkillProviderOptions): SkillProvider;
//# sourceMappingURL=fs-provider.d.ts.map