/**
 * Phase 56A — Cursor CLI (Anysphere) ext agent backend.
 *
 * Drives `cursor-agent --prompt <text> --output json` (one-shot per
 * `ask()`). Install via `curl https://cursor.com/install -fsS | bash`
 * (the binary name is `cursor-agent`, not `cursor`).
 *
 * Output format: when `--output json` is supported, the CLI emits a
 * JSON object — typically `{ "result": "...", "session_id": "..." }`,
 * but some builds use `text` / `response` / `output` as the field
 * name. We try all four. Older builds that don't accept `--output
 * json` emit plain text — we fall back to trimming the raw stdout in
 * that case.
 *
 * See `docs/Ext_Agent_guide.md` (Phase 56 section) for the install
 * command and the first-run browser login caveat.
 */

import {
  OneShotCliBackend,
  type OneShotCliBackendOptions,
} from "./one-shot-cli-backend.js";
import { getExtAgentProjectPathCwd } from "./project-path-store.js";
import type { ExtAgentBackend } from "./types.js";

const CURSOR_DEFAULTS = {
  command: "cursor-agent",
  requestTimeoutMs: 60_000,
  installHint:
    "Install the Cursor CLI: `curl https://cursor.com/install -fsS | bash` — then run `cursor-agent --version` to confirm. First run opens a browser for OAuth login.",
} as const;

export interface CursorAgentBackendOptions {
  /** Binary to spawn. Default: `cursor-agent`. */
  command?: string;
  /** Args prepended to every invocation (after the prompt). */
  args?: string[];
  /** Extra env merged on top of `process.env` (e.g. `CURSOR_API_KEY`). */
  env?: NodeJS.ProcessEnv;
  /** Per-ask timeout. Default: 60_000ms. */
  requestTimeoutMs?: number;
  /**
   * Extra args inserted after the prompt. Example:
   * `["--model", "gpt-4", "--workspace", "/path"]`. Default: `[]`.
   */
  extraArgs?: string[];
  /**
   * Override the `binaryOnPath` check (see
   * `OneShotCliBackendOptions.binaryOnPath`). Used by tests to
   * simulate a missing binary without touching the real `$PATH`.
   */
  binaryOnPath?: (command: string) => Promise<boolean | null>;
  /** Override the args passed to `probe()`. Default: `["--version"]`. */
  probeArgs?: string[];
}

export class CursorAgentBackend extends OneShotCliBackend {
  readonly kind = "cursor" as const;
  readonly label = "Cursor CLI";
  private readonly extraArgs: string[];

  constructor(opts: CursorAgentBackendOptions = {}) {
    super({
      command: opts.command ?? CURSOR_DEFAULTS.command,
      args: opts.args,
      env: opts.env,
      requestTimeoutMs: opts.requestTimeoutMs ?? CURSOR_DEFAULTS.requestTimeoutMs,
      installHint: CURSOR_DEFAULTS.installHint,
      binaryOnPath: opts.binaryOnPath,
      probeArgs: opts.probeArgs,
    });
    this.extraArgs = opts.extraArgs ?? [];
  }

  protected buildArgs(text: string, _sessionKey: string): string[] {
    const args = ["--prompt", text, "--output", "json", ...this.extraArgs];
    const workspace = getExtAgentProjectPathCwd("cursor");
    if (workspace) args.push("--workspace", workspace);
    return args;
  }

  protected parseOutput(
    stdout: string,
    _stderr: string,
    _exitCode: number,
  ): string {
    const trimmed = stdout.trim();
    if (!trimmed) return "";
    // Try JSON first: { result, session_id, ... }
    if (trimmed.startsWith("{")) {
      try {
        const obj = JSON.parse(trimmed) as Record<string, unknown>;
        for (const k of ["result", "text", "response", "output"]) {
          const v = obj[k];
          if (typeof v === "string" && v.trim()) return v.trim();
        }
      } catch {
        // Not valid JSON — fall through to raw text.
      }
    }
    return trimmed;
  }
}

export function createCursorAgentBackend(
  options: CursorAgentBackendOptions = {},
): ExtAgentBackend {
  return new CursorAgentBackend(options);
}
