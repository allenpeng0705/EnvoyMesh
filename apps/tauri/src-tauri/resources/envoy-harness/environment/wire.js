/**
 * Phase C — wire jobs / web / terminal / credentials into
 * a tool registry.
 *
 * Kept out of `Agent` so Phase B plugin work and Phase C
 * environment seams don't collide. CLI hosts call this once
 * after registering `BUILTIN_TOOLS`.
 */
import * as os from "node:os";
import * as path from "node:path";
import { createAskCredentialsProvider, createCredentialsProvider, createEnvCredentialsProvider, createFileCredentialsProvider, CredentialError, } from "../credentials/index.js";
import { createLocalJobRegistry, registerJobTools, } from "../jobs/index.js";
import { makeBashTool } from "../tools/builtin/bash.js";
import { createFakeTerminalBackend, createTerminalSessionService, registerTerminalTools, } from "../terminal/index.js";
import { createPtyTerminalBackend, isPtyAvailable, } from "../terminal/pty-backend.js";
import { createFilesystemSkillProvider, createSkillRegistry, registerSkillTools, } from "../skills/index.js";
import { createHttpFetchProvider, createWebRuntime, registerWebTools, } from "../web/index.js";
import { createBraveSearchProvider } from "../web/search-brave.js";
import { createExaSearchProvider } from "../web/search-exa.js";
import { createPerplexitySearchProvider } from "../web/search-perplexity.js";
const DEFAULT_CREDENTIAL_NAMES = ["BRAVE_SEARCH_API_KEY"];
function defaultCredentialsFilePath() {
    return path.join(os.homedir(), ".config", "envoy-harness", "credentials.json");
}
/**
 * Build the default credentials cascade: env → optional
 * `~/.config/envoy-harness/credentials.json` → ask (when
 * `questions` is provided).
 */
export function createDefaultCredentials(options) {
    const env = createEnvCredentialsProvider({
        knownNames: DEFAULT_CREDENTIAL_NAMES,
    });
    const file = createFileCredentialsProvider({
        filePath: options.filePath ?? defaultCredentialsFilePath(),
    });
    const ask = options.questions !== undefined
        ? createAskCredentialsProvider({
            questions: options.questions,
            knownNames: [...DEFAULT_CREDENTIAL_NAMES],
        })
        : {
            async resolve() {
                throw new CredentialError("ask credentials require a UserQuestionService", "NOT_FOUND");
            },
            list: () => [],
        };
    return createCredentialsProvider({ env, file, ask });
}
/**
 * Create registries, register model-facing tools, return
 * handles for disposal. Web ships with the keyless HTTP
 * fetch provider; Brave search registers when
 * `BRAVE_SEARCH_API_KEY` is present in the environment.
 * Terminal prefers `node-pty` when loadable.
 */
export function wireEnvironmentTools(tools, options = {}) {
    const credentials = options.credentials ??
        createDefaultCredentials({
            ...(options.questions !== undefined
                ? { questions: options.questions }
                : {}),
            ...(options.credentialsFilePath !== undefined
                ? { filePath: options.credentialsFilePath }
                : {}),
        });
    const jobs = createLocalJobRegistry();
    registerJobTools(tools, jobs);
    // bash --job sugar: re-register bash bound to the job registry.
    tools.unregister("bash");
    tools.register(makeBashTool({ jobs }));
    const web = createWebRuntime();
    web.registerFetchProvider(createHttpFetchProvider());
    const brave = createBraveSearchProvider({ credentials });
    if (brave.available()) {
        web.registerSearchProvider(brave);
    }
    const exa = createExaSearchProvider({ credentials });
    if (exa.available()) {
        web.registerSearchProvider(exa);
    }
    const perplexity = createPerplexitySearchProvider({ credentials });
    if (perplexity.available()) {
        web.registerSearchProvider(perplexity);
    }
    registerWebTools(tools, web);
    const terminals = createTerminalSessionService();
    const preferPty = options.preferPty !== false;
    if (preferPty && isPtyAvailable()) {
        terminals.registerBackend(createPtyTerminalBackend());
    }
    else {
        terminals.registerBackend(createFakeTerminalBackend());
    }
    registerTerminalTools(tools, terminals, jobs);
    // SKILL.md loader (L0 reuse): project + user roots, codex /
    // deepseek / universal. Hosts can disable by passing
    // `enableSkills: false` in WireEnvironmentOptions.
    const skills = options.skills ?? createSkillRegistry();
    if (options.skills === undefined) {
        skills.registerProvider(createFilesystemSkillProvider({ homeDir: os.homedir() }));
    }
    if (options.enableSkills !== false) {
        registerSkillTools(tools, skills);
    }
    let disposed = false;
    return {
        jobs,
        web,
        terminals,
        credentials,
        skills,
        async dispose() {
            if (disposed)
                return;
            disposed = true;
            await Promise.all([jobs.dispose(), terminals.dispose()]);
        },
    };
}
//# sourceMappingURL=wire.js.map