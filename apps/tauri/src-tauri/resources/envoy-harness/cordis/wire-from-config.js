/**
 * Optional Cordis-compat container wire-up.
 *
 * Dynamic import keeps `@envoymesh/envoy-harness-cordis` optional
 * (not a hard dependency of Package 1).
 */
/** Bridge Cordis plugins into an already-wired environment. */
export async function wireCordisExtensions(options) {
    if (options.plugins === undefined || options.plugins.length === 0) {
        return { jobs: options.environment.jobs };
    }
    const wired = await wireCordisFromConfig({
        plugins: options.plugins,
        cwd: options.cwd,
        tools: options.tools,
        jobs: options.environment.jobs,
        skills: options.environment.skills,
        web: options.environment.web,
    });
    if (wired === undefined) {
        return { jobs: options.environment.jobs };
    }
    return {
        jobs: wired.jobs ?? options.environment.jobs,
        cordisDispose: wired.dispose,
    };
}
/** Host whitelisted Cordis plugins when the optional package is installed. */
export async function wireCordisFromConfig(options) {
    if (options.plugins.length === 0)
        return undefined;
    try {
        // Optional peer package — not a hard dependency of Package 1.
        // @ts-expect-error optional workspace package
        const cordis = await import("@envoymesh/envoy-harness-cordis");
        const container = await cordis.createCordisContainer({
            plugins: options.plugins.map((p) => ({
                name: p.name,
                ...(p.config !== undefined ? { config: p.config } : {}),
            })),
        });
        const capabilities = container.capabilities();
        let jobs;
        if (capabilities.some((c) => c.service === "jobs")) {
            jobs = cordis.createHostedJobsRegistry(container.ctx);
        }
        if (capabilities.some((c) => c.service === "skills")) {
            options.skills.registerProvider(cordis.createHostedSkillsProvider(container.ctx));
        }
        return {
            ...(jobs !== undefined ? { jobs } : {}),
            dispose: async () => {
                await container.dispose();
            },
        };
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=wire-from-config.js.map