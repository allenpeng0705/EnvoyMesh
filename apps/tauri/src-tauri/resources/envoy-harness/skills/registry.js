/**
 * Skill registry — multiple providers, last-write-wins on name
 * conflicts. A second provider with the same skill name
 * shadows the first.
 *
 * **Why a registry (vs. one provider):** deepseek and codex
 * ship different root layouts; the Agent Skills spec adds a
 * third. The registry is the seam that lets all three roots
 * coexist in one runtime without forcing a fork in fs-provider.
 */
export function createSkillRegistry() {
    const providers = [];
    return {
        registerProvider(provider) {
            providers.push(provider);
            return () => {
                const idx = providers.indexOf(provider);
                if (idx >= 0)
                    providers.splice(idx, 1);
            };
        },
        async list({ cwd, signal }) {
            const merged = new Map();
            for (const provider of providers) {
                if (signal.aborted)
                    return [];
                try {
                    const summaries = await provider.list({ cwd, signal });
                    for (const summary of summaries) {
                        // Last provider wins.
                        merged.set(summary.name, summary);
                    }
                }
                catch {
                    // Provider errors are isolated; one bad provider
                    // doesn't kill the catalog.
                }
            }
            return [...merged.values()];
        },
        async get(name, { cwd, signal }) {
            // First provider to know the skill wins. (Providers are
            // queried in registration order; the first hit returns.)
            for (const provider of providers) {
                if (signal.aborted)
                    return undefined;
                try {
                    const def = await provider.get(name, { cwd, signal });
                    if (def !== undefined)
                        return def;
                }
                catch {
                    // See list() — isolate per-provider.
                }
            }
            return undefined;
        },
        providers() {
            return providers.map((p) => p.name);
        },
    };
}
//# sourceMappingURL=registry.js.map