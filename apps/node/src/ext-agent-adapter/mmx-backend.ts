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
 * JSON output shape (mmx 1.x `--output json`) matches the MiniMax
 * Messages API assistant message, e.g.:
 *   { "id": "...", "type": "message", "role": "assistant",
 *     "content": [{ "type": "text", "text": "…" }], "usage": {…} }
 * Older / alternate shapes may use a flat `{ "text": "…" }` (or
 * `response` / `output` / `message`). Plain-text stdout is accepted
 * when JSON parsing fails.
 *
 * Parsing is isolated via {@link extractOneShotAssistantText} with
 * `prefer: "content-first"` so Cursor/Aider shapes are not affected.
 *
 * See `docs/Ext_Agent_guide.md` (Phase 56 section) for install + start.
 */

import {
  OneShotCliBackend,
} from "./one-shot-cli-backend.js";
import { extractOneShotAssistantText } from "./parse-one-shot-json.js";
import type { ExtAgentBackend } from "./types.js";

const MMX_DEFAULTS = {
  command: "mmx",
  requestTimeoutMs: 60_000,
  installHint:
    "Install MMX-CLI: `npm install -g mmx-cli` (or `npx skills add MiniMax-AI/cli -y -g`). Then run `mmx auth login --api-key sk-xxxx` to authenticate.",
} as const;

/** Flat fields for older mmx / alternate wrappers (after content blocks). */
const MMX_FLAT_KEYS = ["text", "response", "output", "message"] as const;

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
  /** Override the args passed to `probe()`. Default: `["--version"]`. */
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
    const extracted = extractOneShotAssistantText(stdout, {
      flatKeys: MMX_FLAT_KEYS,
      prefer: "content-first",
    });
    return extracted ?? stdout.trim();
  }
}

export function createMmxBackend(
  options: MmxBackendOptions = {},
): ExtAgentBackend {
  return new MmxBackend(options);
}
