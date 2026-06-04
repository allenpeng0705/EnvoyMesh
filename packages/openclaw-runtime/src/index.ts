/**
 * OpenClaw Runtime — Bundled OpenClaw agent inside EnvoyMesh.
 *
 * Instead of requiring users to install and configure OpenClaw separately,
 * EnvoyMesh spawns it as a child process and communicates via stdio.
 * The bridge protocol (JSON messages over stdin/stdout) is the same as
 * the HTTP bridge but without the HTTP layer.
 *
 * Architecture:
 *   EnvoyMesh ──spawn──▶ OpenClaw child process
 *                         stdin: JSON messages
 *                         stdout: JSON responses
 *
 * Fallback: if OpenClaw isn't installed, falls back to configured model
 * providers (OpenAI-compatible, Ollama, etc.).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

export interface OpenClawRuntimeConfig {
  /** Path to the OpenClaw executable. */
  executablePath: string;
  /** CLI arguments for the OpenClaw process. */
  args?: string[];
  /** Working directory for OpenClaw. */
  cwd?: string;
  /** Timeout for OpenClaw responses (ms). */
  responseTimeoutMs?: number;
}

export interface OpenClawMessage {
  type: "request" | "response" | "error";
  id: string;
  /** Request: the prompt to send. Response: the answer. */
  text?: string;
  /** Error message if type is "error". */
  error?: string;
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class OpenClawRuntime {
  private process: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private ready = false;
  private config: OpenClawRuntimeConfig;

  constructor(config: OpenClawRuntimeConfig) {
    this.config = {
      responseTimeoutMs: 120_000,
      ...config,
    };
  }

  /**
   * Start the OpenClaw child process and establish stdio communication.
   */
  async start(): Promise<void> {
    if (this.process) return;

    return new Promise((resolve, reject) => {
      const proc = spawn(this.config.executablePath, this.config.args ?? [], {
        cwd: this.config.cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to start OpenClaw: ${err.message}`));
      });

      proc.on("exit", (code) => {
        this.ready = false;
        if (code !== 0 && code !== null) {
          console.warn(`[openclaw-runtime] process exited with code ${code}`);
        }
      });

      // Read responses line by line from stdout
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
        } catch {
          // Ignore non-JSON lines
        }
      });

      // Buffer for startup — wait for first response
      const startupTimeout = setTimeout(() => {
        this.ready = true;
        this.process = proc;
        resolve();
      }, 5000);

      // Send a ping to verify
      proc.stdin!.write(JSON.stringify({ type: "ping" }) + "\n");

      proc.stderr!.on("data", (data: Buffer) => {
        console.log(`[openclaw] ${data.toString().trim()}`);
      });

      // If we get any response, OpenClaw is ready
      rl.once("line", () => {
        clearTimeout(startupTimeout);
        this.ready = true;
        this.process = proc;
        resolve();
      });
    });
  }

  /**
   * Send a prompt to OpenClaw and wait for the response.
   */
  async ask(prompt: string, context?: string): Promise<string> {
    if (!this.ready || !this.process) {
      throw new Error("OpenClaw runtime not started");
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
        reject(new Error(`OpenClaw response timeout after ${this.config.responseTimeoutMs}ms`));
      }, this.config.responseTimeoutMs ?? 120_000);

      this.pending.set(id, { resolve, reject, timer });

      try {
        this.process!.stdin!.write(JSON.stringify(message) + "\n");
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  /**
   * Check if OpenClaw is running and ready.
   */
  isReady(): boolean {
    return this.ready && this.process !== null && !this.process.killed;
  }

  /**
   * Stop the OpenClaw child process.
   */
  async stop(): Promise<void> {
    if (!this.process) return;
    this.ready = false;

    // Reject all pending requests
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("OpenClaw runtime stopped"));
    }
    this.pending.clear();

    this.process.stdin?.end();
    this.process.kill();
    this.process = null;
  }
}

/**
 * Check if OpenClaw is available on the system.
 */
export function isOpenClawInstalled(executablePath: string): boolean {
  try {
    const result = spawn(executablePath, ["--version"], {
      stdio: "ignore",
      timeout: 3000,
    });
    result.on("error", () => {});
    // If spawn doesn't throw immediately, the executable exists
    return true;
  } catch {
    return false;
  }
}
