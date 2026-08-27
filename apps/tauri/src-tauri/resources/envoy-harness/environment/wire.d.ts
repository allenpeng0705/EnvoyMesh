/**
 * Phase C — wire jobs / web / terminal / credentials into
 * a tool registry.
 *
 * Kept out of `Agent` so Phase B plugin work and Phase C
 * environment seams don't collide. CLI hosts call this once
 * after registering `BUILTIN_TOOLS`.
 */
import type { CredentialsProvider } from "../credentials/types.js";
import type { UserQuestionService } from "../interaction/user-questions.js";
import { type JobRegistry } from "../jobs/index.js";
import type { ToolRegistry } from "../tools/registry.js";
import { type TerminalSessionService } from "../terminal/index.js";
import { type SkillRegistry } from "../skills/index.js";
import { type WebRuntime } from "../web/index.js";
export interface WireEnvironmentOptions {
    /** Pre-built credentials; otherwise env + optional file + ask. */
    credentials?: CredentialsProvider & {
        resolveByName?(name: string, opts: {
            signal: AbortSignal;
        }): Promise<string>;
        revealedValues?(): ReadonlySet<string>;
    };
    /** When set, ask-backend can prompt for missing secrets. */
    questions?: UserQuestionService;
    /**
     * Prefer the real `node-pty` backend when the optional
     * dependency resolves. Default `true`.
     */
    preferPty?: boolean;
    /** Override default credentials file path (tests). */
    credentialsFilePath?: string;
    /**
     * Skill registry override. When set, the default filesystem
     * provider (project + user roots) is NOT registered — the host
     * controls exactly which skills are discoverable. CLI hosts
     * and tests use this to pin skill discovery deterministically
     * (an empty registry makes transcripts hermetic; EnvoyMesh can
     * point at mesh-scoped skills).
     */
    skills?: SkillRegistry;
    /**
     * Register the SKILL.md model-facing tools (`skill`,
     * `skill_list`) on the supplied tool registry. Default
     * `true`. Set `false` for hosts that want to manage their
     * own skill surface (or for hermetic tests that should
     * not see filesystem-backed skills).
     */
    enableSkills?: boolean;
}
export interface EnvironmentCapabilities {
    jobs: JobRegistry;
    web: WebRuntime;
    terminals: TerminalSessionService;
    /** SKILL.md registry (filesystem provider wired). */
    skills: SkillRegistry;
    credentials: CredentialsProvider & {
        resolveByName?(name: string, opts: {
            signal: AbortSignal;
        }): Promise<string>;
        revealedValues?(): ReadonlySet<string>;
    };
    /** Cancel jobs + close terminals. Safe to call more than once. */
    dispose(): Promise<void>;
}
/**
 * Build the default credentials cascade: env → optional
 * `~/.config/envoy-harness/credentials.json` → ask (when
 * `questions` is provided).
 */
export declare function createDefaultCredentials(options: {
    questions?: UserQuestionService;
    filePath?: string;
}): CredentialsProvider & {
    resolveByName(name: string, opts: {
        signal: AbortSignal;
    }): Promise<string>;
    revealedValues(): ReadonlySet<string>;
};
/**
 * Create registries, register model-facing tools, return
 * handles for disposal. Web ships with the keyless HTTP
 * fetch provider; Brave search registers when
 * `BRAVE_SEARCH_API_KEY` is present in the environment.
 * Terminal prefers `node-pty` when loadable.
 */
export declare function wireEnvironmentTools(tools: ToolRegistry, options?: WireEnvironmentOptions): EnvironmentCapabilities;
//# sourceMappingURL=wire.d.ts.map