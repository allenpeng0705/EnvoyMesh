/**
 * Optional Cordis-compat container wire-up.
 *
 * Dynamic import keeps `@envoymesh/envoy-harness-cordis` optional
 * (not a hard dependency of Package 1).
 */
import type { ToolRegistry } from "../tools/registry.js";
import type { JobRegistry } from "../jobs/index.js";
import type { SkillRegistry } from "../skills/index.js";
import type { WebRuntime } from "../web/types.js";
import type { EnvironmentCapabilities } from "../environment/wire.js";
export interface CordisWireResult {
    dispose: () => Promise<void>;
    /** Replacement jobs registry when Cordis provides `jobs`. */
    jobs?: JobRegistry;
}
export interface CordisWireOptions {
    plugins: ReadonlyArray<{
        name: string;
        config?: unknown;
    }>;
    cwd: string;
    tools: ToolRegistry;
    jobs: JobRegistry;
    skills: SkillRegistry;
    web: WebRuntime;
}
export interface CordisEnvironmentWire {
    jobs: JobRegistry;
    cordisDispose?: () => Promise<void>;
}
/** Bridge Cordis plugins into an already-wired environment. */
export declare function wireCordisExtensions(options: {
    plugins: ReadonlyArray<{
        name: string;
        config?: unknown;
    }> | undefined;
    cwd: string;
    tools: ToolRegistry;
    environment: EnvironmentCapabilities;
}): Promise<CordisEnvironmentWire>;
/** Host whitelisted Cordis plugins when the optional package is installed. */
export declare function wireCordisFromConfig(options: CordisWireOptions): Promise<CordisWireResult | undefined>;
//# sourceMappingURL=wire-from-config.d.ts.map