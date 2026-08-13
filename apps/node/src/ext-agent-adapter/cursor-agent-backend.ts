/**
 * Phase 56A — Cursor CLI (Anysphere) ext agent backend.
 *
 * Drives current Cursor Agent CLI (2026.06+):
 *   `cursor-agent --print --output-format json --trust <prompt>`
 * (one-shot per `ask()`). Older docs used `--prompt` / `--output json`;
 * those flags were removed — the CLI now takes a positional prompt and
 * `--print` for non-interactive runs.
 *
 * Install via `curl https://cursor.com/install -fsS | bash`
 * (the binary name is `cursor-agent`, not `cursor`).
 *
 * JSON shape: typically `{ "result": "..." }` (also try `text` /
 * `response` / `output`). Plain-text stdout is accepted as a fallback.
 *
 * See `docs/Ext_Agent_guide.md` (Phase 56 section) for the install
 * command and the first-run browser login caveat.
 */

import {
  OneShotCliBackend,
} from "./one-shot-cli-backend.js";
import { extractOneShotAssistantText } from "./parse-one-shot-json.js";
import { getExtAgentProjectPathCwd } from "./project-path-store.js";
import type { ExtAgentBackend } from "./types.js";

const CURSOR_DEFAULTS = {
  command: "cursor-agent",
  requestTimeoutMs: 60_000,
  installHint:
    "Install the Cursor CLI: `curl https://cursor.com/install -fsS | bash` — then run `cursor-agent --version` to confirm. First run opens a browser for OAuth login.",
} as const;

/** Cursor prefers `result` before generic text fields / content blocks. */
const CURSOR_FLAT_KEYS = ["result", "text", "response", "output"] as const;

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
   * Extra args inserted before the positional prompt. Example:
   * `["--model", "gpt-5"]`. Default: `[]`.
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
    // Current Cursor Agent CLI (2026.06+): positional prompt + --print
    // for headless. Do not use --prompt / --output (removed).
    const args = [
      "--print",
      "--output-format",
      "json",
      "--trust",
      ...this.extraArgs,
    ];
    const workspace = getExtAgentProjectPathCwd("cursor");
    if (workspace) args.push("--workspace", workspace);
    args.push(text);
    return args;
  }

  protected parseOutput(
    stdout: string,
    _stderr: string,
    _exitCode: number,
  ): string {
    // Flat-first so a Cursor `{ result }` payload is never overridden by
    // an incidental Messages-style `content` array (and vice versa for mmx).
    const extracted = extractOneShotAssistantText(stdout, {
      flatKeys: CURSOR_FLAT_KEYS,
      prefer: "flat-first",
      ndjson: true,
    });
    return extracted ?? stdout.trim();
  }
}

export function createCursorAgentBackend(
  options: CursorAgentBackendOptions = {},
): ExtAgentBackend {
  return new CursorAgentBackend(options);
}
