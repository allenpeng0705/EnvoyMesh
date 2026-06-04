/**
 * OpenClaw Runtime — Auto-discovery and process management.
 *
 * Supports three installation methods:
 *   1. npm: @openclaw/core as a project dependency
 *   2. binary: openclaw on PATH or in packages/openclaw-runtime/bin/
 *   3. source: packages/openclaw/ as a git submodule
 *
 * Priority: npm > PATH binary > bundled binary > source build > fallback
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

// ---- Types ----

export interface OpenClawRuntimeConfig {
  /** Override the auto-detected OpenClaw path. */
  executablePath?: string;
  /** CLI arguments for the OpenClaw process. */
  args?: string[];
  /** Working directory for OpenClaw. */
  cwd?: string;
  /** Timeout for OpenClaw responses (ms). */
  responseTimeoutMs?: number;
}

interface OpenClawMessage {
  type: "request" | "response" | "error" | "ping" | "pong";
  id: string;
  text?: string;
  error?: string;
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ---- Path Discovery ----

const BUNDLED_BIN_DIR = join(__dirname, "..", "bin");
const SOURCE_DIR = join(__dirname, "..", "..", "openclaw");

/**
 * Discover the best available OpenClaw installation.
 * Returns the executable path or null if not found.
 */
export async function discoverOpenClaw(): Promise<string | null> {
  // 1. Try npm package (@openclaw/core)
  try {
    const { getOpenClawPath } = await import("@openclaw/core");
    const path = getOpenClawPath?.();
    if (path && existsSync(path)) return path;
  } catch { /* @openclaw/core not installed */ }

  // 2. Try PATH
  const pathCandidates = [
    "openclaw",
    resolve(BUNDLED_BIN_DIR, "openclaw"),
    resolve(SOURCE_DIR, "bin", "openclaw"),
  ];

  for (const candidate of pathCandidates) {
    if (existsSync(candidate)) return candidate;
  }

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
  private process: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private ready = false;
  private config: OpenClawRuntimeConfig;
  private executablePath: string | null = null;

  constructor(config: OpenClawRuntimeConfig = {}) {
    this.config = {
      responseTimeoutMs: 120_000,
      ...config,
    };
  }

  /**
   * Discover and start OpenClaw.
   * Returns true if started successfully, false if not available.
   */
  async start(): Promise<boolean> {
    if (this.process) return true;

    // Auto-discover if no explicit path
    if (!this.config.executablePath) {
      this.executablePath = await discoverOpenClaw();
    } else {
      this.executablePath = this.config.executablePath;
    }

    if (!this.executablePath) {
      console.log("[openclaw-runtime] OpenClaw not found — using fallback model providers");
      return false;
    }

    console.log(`[openclaw-runtime] Starting OpenClaw from ${this.executablePath}`);

    return new Promise((resolve) => {
      const proc = spawn(this.executablePath!, this.config.args ?? ["--stdio"], {
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

      // Read JSON responses from stdout
      const rl = createInterface({ input: proc.stdout! });
      rl.on("line", (line: string) => {
        try {
          const msg: OpenClawMessage = JSON.parse(line);
          if (msg.type === "response" || msg.type === "error") {
            const pending = this.pending.get(msg.id);
            if (pending) {
              clearTimeout(pending.timer);
              this.pending.delete(msg.id);
              if (msg.type === "error") {
                pending.reject(new Error(msg.error ?? "OpenClaw error"));
              } else {
                pending.resolve(msg.text ?? "");
              }
            }
          }
          if (msg.type === "pong") {
            this.ready = true;
            this.process = proc;
          }
        } catch { /* ignore non-JSON */ }
      });

      proc.stderr!.on("data", (data: Buffer) => {
        const line = data.toString().trim();
        if (line) console.log(`[openclaw] ${line}`);
      });

      // Send ping to verify readiness
      proc.stdin!.write(JSON.stringify({ type: "ping", id: "startup" }) + "\n");

      // Fallback: assume ready after 5s even without pong
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
  async ask(prompt: string, context?: string): Promise<string> {
    if (!this.ready || !this.process) {
      throw new Error("OpenClaw not available");
    }

    const id = randomUUID();
    const message: OpenClawMessage = {
      type: "request",
      id,
      text: context ? `${context}\n\n${prompt}` : prompt,
    };

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`OpenClaw response timeout`));
      }, this.config.responseTimeoutMs ?? 120_000);

      this.pending.set(id, { resolve, reject, timer });
      this.process!.stdin!.write(JSON.stringify(message) + "\n");
    });
  }

  isReady(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }

  async stop(): Promise<void> {
    if (!this.process) return;
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

// ---- Singleton ----

let _instance: OpenClawRuntime | null = null;

export function getOpenClawRuntime(config?: OpenClawRuntimeConfig): OpenClawRuntime {
  if (!_instance) {
    _instance = new OpenClawRuntime(config);
  }
  return _instance;
}
