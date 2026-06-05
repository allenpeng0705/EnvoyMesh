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
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// ---- Path Discovery ----
const BUNDLED_BIN_DIR = join(__dirname, "..", "bin");
const SOURCE_DIR = join(__dirname, "..", "..", "openclaw");
/**
 * Discover the best available OpenClaw installation.
 * Returns the executable path or null if not found.
 */
export async function discoverOpenClaw() {
    // 1. Check PATH (which openclaw)
    try {
        const { execSync } = await import("node:child_process");
        const result = execSync("which openclaw 2>/dev/null || where openclaw 2>/dev/null", { timeout: 2000 }).toString().trim();
        if (result && existsSync(result))
            return result;
    }
    catch { /* not on PATH */ }
    // 2. Bundled locations
    // Tauri sets app-specific env vars at runtime
    const tauriResourceDir = process.env.TAURI_RESOURCE_DIR ?? process.env.TAURI_APP_RESOURCES_DIR;
    const pathCandidates = [
        "openclaw",
        // Tauri app resource bundle (build-time path)
        resolve(__dirname, "..", "..", "..", "apps", "tauri", "src-tauri", "resources", "openclaw", "openclaw"),
        // Tauri app resource bundle (runtime path via env var)
        ...(tauriResourceDir ? [resolve(tauriResourceDir, "openclaw", "openclaw")] : []),
        resolve(BUNDLED_BIN_DIR, "openclaw"),
        resolve(SOURCE_DIR, "bin", "openclaw"),
    ];
    for (const candidate of pathCandidates) {
        console.log("[openclaw-runtime] checking:", candidate);
        if (existsSync(candidate)) {
            console.log("[openclaw-runtime] found at:", candidate);
            return candidate;
        }
    }
    console.log("[openclaw-runtime] not found in any bundled location");
    // 3. Source build — check if package.json exists
    const sourcePkg = join(SOURCE_DIR, "package.json");
    if (existsSync(sourcePkg)) {
        // Needs `npm run build` — can't use directly
        console.log("[openclaw-runtime] source found at", SOURCE_DIR, "— run npm run build first");
    }
    return null;
}
// ---- Runtime ----
export class OpenClawRuntime {
    process = null;
    pending = new Map();
    ready = false;
    config;
    executablePath = null;
    constructor(config = {}) {
        this.config = {
            responseTimeoutMs: 120_000,
            ...config,
        };
    }
    /**
     * Discover and start OpenClaw.
     * Returns true if started successfully, false if not available.
     */
    async start() {
        if (this.process && !this.process.killed)
            return true;
        // Auto-discover if no explicit path
        if (!this.config.executablePath) {
            this.executablePath = await discoverOpenClaw();
        }
        else {
            this.executablePath = this.config.executablePath;
        }
        if (!this.executablePath) {
            console.log("[openclaw-runtime] OpenClaw not found — using fallback model providers");
            return false;
        }
        console.log(`[openclaw-runtime] Starting OpenClaw from ${this.executablePath}`);
        return new Promise((resolve) => {
            const proc = spawn(this.executablePath, this.config.args ?? ["--stdio"], {
                cwd: this.config.cwd,
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env, OPENCLAW_STDIO: "1" },
            });
            proc.on("error", () => {
                console.log("[openclaw-runtime] failed to start — using fallback");
                resolve(false);
            });
            proc.on("exit", (code) => {
                this.ready = false;
                if (code !== 0 && code !== null) {
                    console.warn(`[openclaw-runtime] exited with code ${code}`);
                }
            });
            // Timer for handshake timeout (declared before rl.on so it's in scope)
            let handshakeTimer;
            // Read JSON responses from stdout (all message types)
            const rl = createInterface({ input: proc.stdout });
            rl.on("line", (line) => {
                try {
                    const msg = JSON.parse(line);
                    // Handle request/response multiplexing
                    if (msg.type === "response" || msg.type === "error") {
                        const pending = this.pending.get(msg.id);
                        if (pending) {
                            clearTimeout(pending.timer);
                            this.pending.delete(msg.id);
                            if (msg.type === "error") {
                                pending.reject(new Error(msg.error ?? "OpenClaw error"));
                            }
                            else {
                                pending.resolve(msg.text ?? "");
                            }
                        }
                    }
                    // Version negotiation: hello_ack
                    if (msg.type === "hello_ack" && handshakeTimer) {
                        clearTimeout(handshakeTimer);
                        this.ready = true;
                        this.process = proc;
                        const version = msg.version ?? "unknown";
                        console.log(`[openclaw-runtime] v${version}, protocol envoy-openclaw/1.0`);
                    }
                }
                catch { /* ignore non-JSON */ }
            });
            proc.stderr.on("data", (data) => {
                const line = data.toString().trim();
                if (line)
                    console.log(`[openclaw] ${line}`);
            });
            // Phase 29F — Version negotiation + model config handshake
            const handshake = JSON.stringify({
                type: "hello",
                protocol: "envoy-openclaw/1.0",
                envoyVersion: "0.1.0",
                tools: "ENVOY_TOOL_CATALOG",
                // Inherit EnvoyMesh's LLM config so user only configures once
                modelConfig: this.config.modelConfig ?? null,
            }) + "\n";
            proc.stdin.write(handshake);
            // Fallback: assume ready after 5s even without hello_ack
            handshakeTimer = setTimeout(() => {
                if (!this.ready) {
                    this.ready = true;
                    this.process = proc;
                    console.log("[openclaw-runtime] no version ack — assuming compatible");
                }
            }, 5000);
            // Overall start() timeout — resolves the promise after 5s
            setTimeout(() => {
                if (!this.ready) {
                    this.ready = true;
                    this.process = proc;
                }
                resolve(true);
            }, 5000);
        });
    }
    /**
     * Ask OpenClaw a question. Falls back to returning an error string
     * if not started — caller should use their own model provider.
     */
    async ask(prompt, context) {
        if (!this.ready || !this.process) {
            throw new Error("OpenClaw not available");
        }
        const id = randomUUID();
        const message = {
            type: "request",
            id,
            text: context ? `${context}\n\n${prompt}` : prompt,
        };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`OpenClaw response timeout`));
            }, this.config.responseTimeoutMs ?? 120_000);
            this.pending.set(id, { resolve, reject, timer });
            this.process.stdin.write(JSON.stringify(message) + "\n");
        });
    }
    /**
     * Send updated model config to OpenClaw without restarting.
     * Called when the user changes LLM settings in EnvoyMesh.
     */
    updateModelConfig(config) {
        this.config.modelConfig = config;
        if (this.ready && this.process && !this.process.killed) {
            this.process.stdin.write(JSON.stringify({
                type: "config_update",
                id: randomUUID(),
                modelConfig: config,
            }) + "\n");
        }
    }
    isReady() {
        return this.ready && this.process !== null && !this.process.killed;
    }
    async stop() {
        if (!this.process)
            return;
        this.ready = false;
        for (const [, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error("OpenClaw stopped"));
        }
        this.pending.clear();
        this.process.stdin?.end();
        this.process.kill();
        this.process = null;
    }
}
/**
 * Quick check: is OpenClaw executable available?
 * Used by the node to decide whether to attempt starting it.
 */
export function isOpenClawInstalled(expectedPath) {
    if (expectedPath && existsSync(expectedPath))
        return true;
    try {
        const { spawnSync } = require("node:child_process");
        const result = spawnSync("openclaw", ["--version"], { timeout: 2000, stdio: "ignore" });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
// ---- Singleton ----
let _instance = null;
export function getOpenClawRuntime(config) {
    if (!_instance) {
        _instance = new OpenClawRuntime(config);
    }
    return _instance;
}
//# sourceMappingURL=index.js.map