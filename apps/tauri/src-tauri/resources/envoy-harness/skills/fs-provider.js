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
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
/** Default skill roots in priority order (project first). */
export function defaultSkillRoots(opts) {
    const home = opts.homeDir ?? os.homedir();
    return [
        { name: "project:envoy", path: path.join(opts.cwd, ".envoy", "skills") },
        { name: "project:codex", path: path.join(opts.cwd, ".codex", "skills") },
        { name: "project:dsh", path: path.join(opts.cwd, ".dsh", "skills") },
        { name: "user:agents", path: path.join(home, ".agents", "skills") },
        { name: "user:codex", path: path.join(home, ".codex", "skills") },
        { name: "user:dsh", path: path.join(home, ".dsh", "skills") },
    ];
}
export function createFilesystemSkillProvider(options = {}) {
    // Cache the most recent list() result per-cwd. Tests can
    // construct a fresh provider for hermetic isolation. We
    // key on cwd so concurrent reads in different sessions
    // don't collide.
    let lastCwd;
    let lastSummaries = [];
    let lastDefs;
    function rootsFor(cwd) {
        const base = defaultSkillRoots({ cwd, ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}) });
        if (options.extraRoots !== undefined) {
            return [...options.extraRoots, ...base];
        }
        return base;
    }
    async function readSkillMd(root, name) {
        const filePath = path.join(root.path, name, "SKILL.md");
        let raw;
        try {
            raw = await fs.readFile(filePath, "utf8");
        }
        catch {
            return null;
        }
        let frontmatter;
        let body;
        try {
            ({ frontmatter, body } = parseFrontmatter(raw));
        }
        catch {
            // Malformed SKILL.md — isolated per-file, never crashes
            // the catalog. The fs-provider's contract is "list
            // everything parseable, skip the rest"; the user can
            // diagnose via the fs path printed in their loader.
            return null;
        }
        return {
            definition: {
                name: frontmatter.name,
                description: frontmatter.description,
                ...(frontmatter.whenToUse !== undefined
                    ? { whenToUse: frontmatter.whenToUse }
                    : {}),
                provider: root.name,
                invocation: { modelInvocable: true, userInvocable: true },
                resourceBase: path.join(root.path, name),
                instructions: body,
            },
        };
    }
    return {
        name: "filesystem",
        async list({ cwd, signal }) {
            if (signal.aborted)
                return [];
            if (lastCwd === cwd && lastDefs !== undefined) {
                // Reuse cache, but rebuild summaries from definitions.
                return lastDefs !== undefined
                    ? [...lastDefs.values()].map((d) => ({
                        name: d.name,
                        description: d.description,
                        ...(d.whenToUse !== undefined ? { whenToUse: d.whenToUse } : {}),
                        provider: d.provider,
                        invocation: d.invocation,
                    }))
                    : [];
            }
            const defs = new Map();
            for (const root of rootsFor(cwd)) {
                if (signal.aborted)
                    break;
                let entries;
                try {
                    entries = await fs.readdir(root.path);
                }
                catch {
                    continue;
                }
                for (const entry of entries) {
                    if (signal.aborted)
                        break;
                    // Each skill lives in its own directory. We do not
                    // recurse — SKILL.md is at <root>/<name>/SKILL.md.
                    const read = await readSkillMd(root, entry);
                    if (read === null)
                        continue;
                    // Project-local wins over user-level: don't overwrite.
                    if (defs.has(read.definition.name))
                        continue;
                    defs.set(read.definition.name, read.definition);
                }
            }
            lastCwd = cwd;
            lastDefs = defs;
            lastSummaries = [...defs.values()].map((d) => ({
                name: d.name,
                description: d.description,
                ...(d.whenToUse !== undefined ? { whenToUse: d.whenToUse } : {}),
                provider: d.provider,
                invocation: d.invocation,
            }));
            return lastSummaries;
        },
        async get(name, { cwd, signal }) {
            if (signal.aborted)
                return undefined;
            if (lastCwd !== cwd) {
                // Warm the cache.
                await this.list({ cwd, signal });
            }
            return lastDefs?.get(name);
        },
    };
}
//# sourceMappingURL=fs-provider.js.map