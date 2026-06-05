/**
 * OpenClaw Runtime — Auto-discovery and process management.
 *
 * Supports three installation methods:
 *   1. PATH: openclaw on system PATH
 *   2. binary: openclaw bundled in packages/openclaw-runtime/bin/
 *   3. source: packages/openclaw/ as a source submodule
 *
 * Priority: npm > PATH binary > bundled binary > source build > fallback
 */
export interface OpenClawModelConfig {
    provider: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
}
export interface OpenClawRuntimeConfig {
    /** Override the auto-detected OpenClaw path. */
    executablePath?: string;
    /** CLI arguments for the OpenClaw process. */
    args?: string[];
    /** Working directory for OpenClaw. */
    cwd?: string;
    /** Timeout for OpenClaw responses (ms). */
    responseTimeoutMs?: number;
    /** Inherit EnvoyMesh's LLM config. OpenClaw can override if it has its own config. */
    modelConfig?: OpenClawModelConfig | null;
}
/**
 * Discover the best available OpenClaw installation.
 * Returns the executable path or null if not found.
 */
export declare function discoverOpenClaw(): Promise<string | null>;
export declare class OpenClawRuntime {
    private process;
    private pending;
    private ready;
    private config;
    private executablePath;
    constructor(config?: OpenClawRuntimeConfig);
    /**
     * Discover and start OpenClaw.
     * Returns true if started successfully, false if not available.
     */
    start(): Promise<boolean>;
    /**
     * Ask OpenClaw a question. Falls back to returning an error string
     * if not started — caller should use their own model provider.
     */
    ask(prompt: string, context?: string): Promise<string>;
    /**
     * Send updated model config to OpenClaw without restarting.
     * Called when the user changes LLM settings in EnvoyMesh.
     */
    updateModelConfig(config: OpenClawModelConfig): void;
    isReady(): boolean;
    stop(): Promise<void>;
}
/**
 * Quick check: is OpenClaw executable available?
 * Used by the node to decide whether to attempt starting it.
 */
export declare function isOpenClawInstalled(expectedPath?: string): boolean;
export declare function getOpenClawRuntime(config?: OpenClawRuntimeConfig): OpenClawRuntime;
//# sourceMappingURL=index.d.ts.map