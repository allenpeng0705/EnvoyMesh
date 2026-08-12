/**
 * Phase 56A — shared base for one-shot CLI ext agent backends.
 *
 * Drives the CLI one subprocess per `ask()`: spawn → wait for exit →
 * parse stdout → return text. No long-lived process, no session
 * state, no JSON-RPC framing. Used by cursor-agent (56A), aider
 * (56B), and mmx (56C).
 *
 * Install detection reuses the same `InstallMissingError` shape as
 * the 55A `DaemonSupervisor` so the 55A.1 / 55D.1 install card
 * surfaces automatically when the binary is missing.
 *
 * Why a base class (vs three independent files): every one-shot CLI
 * backends the same plumbing — pre-spawn `command -v` check, spawn
 * with timeout, capture stdout, parse, surface install-missing on
 * ENOENT. Sharing it kills the duplication without giving up the
 * per-backend flexibility on `buildArgs` and `parseOutput`.
 */

import { spawn } from "node:child_process";
import { InstallMissingError } from "./daemon-supervisor.js";
import {
  augmentPathForExtAgentBins,
  isExtAgentBinaryAvailable,
  resolveExtAgentBinary,
} from "./resolve-ext-agent-binary.js";
import { getExtAgentProjectPathCwd } from "./project-path-store.js";
import type { ExtAgentBackend, ExtAgentSidecarKind } from "./types.js";

export interface OneShotCliBackendOptions {
  /** Binary to spawn (PATH-resolved). */
  command: string;
  /** Args to prepend to every invocation (e.g. `["--quiet"]`). */
  args?: string[];
  /** Extra env merged on top of `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Per-ask timeout. Default: 60_000ms. */
  requestTimeoutMs?: number;
  /** Install hint shown when the binary is missing. */
  installHint?: string;
  /**
   * Override the `binaryOnPath` check (e.g. for tests). Receives the
   * `command` and returns `true` / `false` / `null` (null = unknown).
   * Default: `defaultBinaryOnPath` (`command -v` on POSIX, `where`
   * on Windows).
   */
  binaryOnPath?: (command: string) => Promise<boolean | null>;
  /**
   * Override the args passed to `probe()`. Default: `["--version"]`.
   * Subclasses with a different "is this CLI responsive" probe
   * (e.g. `mmx auth status`) override this.
   */
  probeArgs?: string[];
}

export abstract class OneShotCliBackend implements ExtAgentBackend {
  abstract readonly kind: ExtAgentSidecarKind;
  abstract readonly label: string;

  protected abstract buildArgs(text: string, sessionKey: string): string[];
  /**
   * Extract the assistant text from the CLI's stdout. Throw an Error
   * to surface a non-zero exit or an unparseable response. The base
   * class does NOT swallow stderr — subclasses can include it in the
   * error message for context.
   */
  protected abstract parseOutput(
    stdout: string,
    stderr: string,
    exitCode: number,
  ): string;

  private readonly command: string;
  private readonly defaultArgs: string[];
  private readonly env: NodeJS.ProcessEnv;
  private readonly requestTimeoutMs: number;
  private readonly installHint: string;
  private readonly binaryOnPathFn: (command: string) => Promise<boolean | null>;
  private readonly probeArgsList: string[];

  constructor(opts: OneShotCliBackendOptions) {
    this.command = opts.command;
    this.defaultArgs = opts.args ?? [];
    this.env = augmentPathForExtAgentBins({ ...process.env, ...(opts.env ?? {}) });
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 60_000;
    this.installHint =
      opts.installHint ?? `Install the \`${opts.command}\` CLI and ensure it is on PATH.`;
    this.binaryOnPathFn = opts.binaryOnPath ?? checkBinaryOnPath;
    this.probeArgsList = opts.probeArgs ?? ["--version"];
  }

  /**
   * Spawn the CLI, capture stdout/stderr, parse the response, return
   * the assistant text. Throws `InstallMissingError` if the binary is
   * missing on `$PATH` (pre-spawn check) or `spawn()` returns ENOENT
   * (synchronous or async via the `error` event). Times out after
   * `requestTimeoutMs` (kills the subprocess).
   */
  async ask(text: string, sessionKey: string): Promise<string> {
    if (!text.trim()) return "";
    if (!sessionKey) {
      throw new Error(`${this.kind} ask(): sessionKey is required`);
    }
    // Pre-spawn `command -v` check — matches the daemon-supervisor
    // pattern so install-missing surfaces before we burn a spawn.
    const onPath = await this.binaryOnPathFn(this.command);
    if (onPath === false) {
      throw new InstallMissingError({
        command: this.command,
        reason: "pre-check",
        installHint: this.installHint,
      });
    }
    const args = [...this.defaultArgs, ...this.buildArgs(text, sessionKey)];
    const resolvedCmd = resolveExtAgentBinary(this.command) ?? this.command;
    const cwd = getExtAgentProjectPathCwd(this.kind);
    return new Promise<string>((resolve, reject) => {
      const proc = spawn(resolvedCmd, args, {
        env: this.env,
        stdio: ["ignore", "pipe", "pipe"],
        ...(cwd ? { cwd } : {}),
      });
      let stdout = "";
      let stderr = "";
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        try {
          proc.kill("SIGKILL");
        } catch {
          // already gone
        }
        reject(
          new Error(
            `${this.kind} ask(): timed out after ${this.requestTimeoutMs}ms (cmd=${this.command} ${args.join(" ")})`,
          ),
        );
      }, this.requestTimeoutMs);
      timer.unref?.();
      if (proc.stdout) {
        proc.stdout.setEncoding("utf8");
        proc.stdout.on("data", (chunk: string) => {
          stdout += chunk;
        });
      }
      if (proc.stderr) {
        proc.stderr.setEncoding("utf8");
        proc.stderr.on("data", (chunk: string) => {
          stderr += chunk;
        });
      }
      proc.on("error", (err) => {
        if (killed) return;
        clearTimeout(timer);
        if (isEnoent(err)) {
          reject(
            new InstallMissingError({
              command: this.command,
              reason: "spawn-enoent",
              installHint: this.installHint,
            }),
          );
          return;
        }
        reject(err);
      });
      proc.on("close", (code) => {
        if (killed) return;
        clearTimeout(timer);
        const exitCode = code ?? -1;
        // Non-zero exit is a hard error — do NOT call parseOutput, which
        // would happily return whatever the CLI wrote to stdout (often
        // a one-line error message that would then be returned to the
        // user as if it were the assistant's reply). Subclasses can
        // override `parseOutput` to throw a richer error if the CLI
        // emits structured error JSON on a non-zero exit.
        if (exitCode !== 0) {
          // Append the install hint so the user can self-diagnose
          // "did the CLI run but fail, or is it not installed at all?"
          // The hint is short for known agents (e.g. "Install mmx-cli
          // via `npm install -g mmx-cli`") and not noisy.
          reject(
            new Error(
              `${this.kind} ask(): non-zero exit (code=${exitCode}, stderr=${truncateForError(
                stderr,
              )}) — ${this.installHint}`,
            ),
          );
          return;
        }
        try {
          const result = this.parseOutput(stdout, stderr, exitCode);
          if (!result.trim()) {
            reject(
              new Error(
                `${this.kind} ask(): empty response (exit=0, stderr=${truncateForError(
                  stderr,
                )})`,
              ),
            );
            return;
          }
          resolve(result);
        } catch (err) {
          // parseOutput threw on a zero exit — surface the underlying
          // parse error. The exit code is 0 so we don't conflate it
          // with a CLI failure; the user can fix the parser or report
          // a malformed response.
          const msg = err instanceof Error ? err.message : String(err);
          reject(
            new Error(
              `${this.kind} ask(): failed to parse output (exit=0): ${msg}`,
            ),
          );
        }
      });
    });
  }

  /**
   * Cheap readiness probe: pre-spawn `command -v` + run the
   * `probeArgs` (default `--version`) with a 5s timeout. Never throws.
   */
  async probe(): Promise<boolean> {
    try {
      const onPath = await this.binaryOnPathFn(this.command);
      if (onPath === false) return false;
      return await new Promise<boolean>((resolve) => {
        const proc = spawn(this.command, this.probeArgsList, {
          env: this.env,
          stdio: ["ignore", "pipe", "pipe"],
        });
        const timer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            // already gone
          }
          resolve(false);
        }, 5_000);
        timer.unref?.();
        proc.on("error", () => {
          clearTimeout(timer);
          resolve(false);
        });
        proc.on("close", (code) => {
          clearTimeout(timer);
          resolve(code === 0);
        });
      });
    } catch {
      return false;
    }
  }
}

function isEnoent(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === "ENOENT";
}

function truncateForError(s: string, max = 200): string {
  const trimmed = s.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Inline PATH + well-known-bin check. Prefer
 * {@link isExtAgentBinaryAvailable} so GUI-stripped PATH still finds
 * `npm i -g` installs under `~/.npm-global/bin`.
 *
 * Behaviour matches `defaultBinaryOnPath` in `probe.ts`:
 * - `true`  → binary is available
 * - `false` → binary is missing
 * - `null`  → check failed for an unrelated reason (unused here —
 *   sync resolver returns boolean only)
 */
function checkBinaryOnPath(command: string): Promise<boolean | null> {
  return Promise.resolve(isExtAgentBinaryAvailable(command));
}
