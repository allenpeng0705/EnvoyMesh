/**
 * Phase 56C — MiniMax MMX-CLI ext agent backend.
 *
 * Drives `mmx text chat --message <text> --output json` (one-shot per
 * ask). MMX-CLI is the MiniMax-published CLI designed *for* AI agents —
 * clean JSON output, semantic exit codes, async non-blocking. Install
 * via `npm install -g mmx-cli` (or `npx skills add MiniMax-AI/cli -y -g`).
 *
 * Auth: `mmx auth login --api-key sk-xxxx` (saves to `~/.mmx/config.json`),
 * OR set `MINIMAX_API_KEY` in the shell. Region is auto-detected by
 * the CLI from the API key prefix (global vs CN).
 *
 * JSON output shape (with `--output json`):
 *   { "text": "the assistant response",
 *     "session_id": "...",     // optional
 *     "model": "MiniMax-M2.7", // optional
 *     "usage": { ... } }       // optional
 *
 * We try `text` first; fall back to `response` / `output` / `message`
 * for forward compat. If stdout isn't JSON, fall back to trimming the
 * raw text.
 *
 * See `docs/Ext_Agent_guide.md` (Phase 56 section) for install + start.
 */

import {
  OneShotCliBackend,
  type OneShotCliBackendOptions,
} from "./one-shot-cli-backend.js";
import type { ExtAgentBackend } from "./types.js";

const MMX_DEFAULTS = {
  command: "mmx",
  requestTimeoutMs: 60_000,
  installHint:
    "Install MMX-CLI: `npm install -g mmx-cli` (or `npx skills add MiniMax-AI/cli -y -g`). Then run `mmx auth login --api-key sk-xxxx` to authenticate.",
} as const;

export interface MmxBackendOptions {
  /** Binary to spawn. Default: `mmx`. */
  command?: string;
  /** Args prepended to every invocation. */
  args?: string[];
  /** Extra env merged on top of `process.env` (e.g. `MINIMAX_API_KEY`). */
  env?: NodeJS.ProcessEnv;
  /** Per-ask timeout. Default: 60_000ms. */
  requestTimeoutMs?: number;
  /**
   * Extra args inserted AFTER the prompt. Example:
   * `["--model", "MiniMax-M3"]`. Default: `[]`.
   */
  extraArgs?: string[];
  /**
   * Override the `binaryOnPath` check (see
   * `OneShotCliBackendOptions.binaryOnPath`).
   */
  binaryOnPath?: (command: string) => Promise<boolean | null>;
  /** Override the args passed to `probe()`. Default: `["auth", "status"]`. */
  probeArgs?: string[];
}

export class MmxBackend extends OneShotCliBackend {
  readonly kind = "mmx" as const;
  readonly label = "MiniMax MMX-CLI";
  private readonly extraArgs: string[];

  constructor(opts: MmxBackendOptions = {}) {
    super({
      command: opts.command ?? MMX_DEFAULTS.command,
      args: opts.args,
      env: opts.env,
      requestTimeoutMs: opts.requestTimeoutMs ?? MMX_DEFAULTS.requestTimeoutMs,
      installHint: MMX_DEFAULTS.installHint,
      binaryOnPath: opts.binaryOnPath,
      probeArgs: opts.probeArgs,
    });
    this.extraArgs = opts.extraArgs ?? [];
  }

  protected buildArgs(text: string, _sessionKey: string): string[] {
    return [
      "text",
      "chat",
      "--message",
      text,
      "--output",
      "json",
      ...this.extraArgs,
    ];
  }

  protected parseOutput(
    stdout: string,
    _stderr: string,
    _exitCode: number,
  ): string {
    const trimmed = stdout.trim();
    if (!trimmed) return "";
    // MMX-CLI --output json typically wraps the response in
    // `{ text, session_id, model, usage }`. Field names are not
    // guaranteed across versions; try the most likely first.
    if (trimmed.startsWith("{")) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        for (const k of ["text", "response", "output", "message", "content"]) {
          const v = obj[k];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
      } catch {
        // Fall through to raw text on parse failure.
      }
    }
    return trimmed;
  }
}

export function createMmxBackend(
  options: MmxBackendOptions = {},
): ExtAgentBackend {
  return new MmxBackend(options);
}
