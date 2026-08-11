/**
 * Phase 56B — Aider ext agent backend.
 *
 * Drives `aider --message <text> --no-pretty --no-git --yes-always` (one-shot
 * per ask). Install via `pip install aider-chat` (or `aider-install`).
 *
 * Critical safety flags:
 * - `--no-git`       — disables ALL git operations (no auto-commits, no
 *                      diff display, no version checks). This is
 *                      essential for chat-bridge use: we never want
 *                      Aider to commit on the user's behalf from the
 *                      chat panel.
 * - `--yes-always`   — auto-accepts any prompts Aider would otherwise
 *                      raise (e.g. "trust this repo?"). Without this,
 *                      Aider can block forever in non-TTY contexts.
 * - `--no-pretty`    — strips ANSI escape codes from output. Defensive:
 *                      parseOutput also strips just in case.
 *
 * See `docs/Ext_Agent_guide.md` (Phase 56 section) for install + start.
 */

import {
  OneShotCliBackend,
  type OneShotCliBackendOptions,
} from "./one-shot-cli-backend.js";
import type { ExtAgentBackend } from "./types.js";

const AIDER_DEFAULTS = {
  command: "aider",
  // Aider is slow: Python venv creation (first run), model handshake,
  // and the actual inference. 120s gives a comfortable cap for the
  // first cold call + typical multi-file refactors.
  requestTimeoutMs: 120_000,
  installHint:
    "Install Aider: `pip install aider-chat` (or `python -m pip install aider-install` then `aider-install`). Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your shell.",
} as const;

export interface AiderBackendOptions {
  /** Binary to spawn. Default: `aider`. */
  command?: string;
  /** Args prepended to every invocation (after the safety flags). */
  args?: string[];
  /** Extra env merged on top of `process.env` (e.g. `ANTHROPIC_API_KEY`). */
  env?: NodeJS.ProcessEnv;
  /** Per-ask timeout. Default: 120_000ms. */
  requestTimeoutMs?: number;
  /**
   * Extra args inserted AFTER the safety flags. Example:
   * `["--model", "anthropic/claude-sonnet-4-20250514"]`. Default: `[]`.
   *
   * Note: the safety flags (`--no-pretty`, `--no-git`, `--yes-always`)
   * always come first; if `extraArgs` includes any of those, the
   * `args` array is built with `extraArgs` appended (later wins on
   * the CLI). This lets tests override the safety flags when needed.
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

export class AiderBackend extends OneShotCliBackend {
  readonly kind = "aider" as const;
  readonly label = "Aider";
  private readonly extraArgs: string[];

  constructor(opts: AiderBackendOptions = {}) {
    super({
      command: opts.command ?? AIDER_DEFAULTS.command,
      args: opts.args,
      env: opts.env,
      requestTimeoutMs: opts.requestTimeoutMs ?? AIDER_DEFAULTS.requestTimeoutMs,
      installHint: AIDER_DEFAULTS.installHint,
      binaryOnPath: opts.binaryOnPath,
      probeArgs: opts.probeArgs,
    });
    this.extraArgs = opts.extraArgs ?? [];
  }

  protected buildArgs(text: string, _sessionKey: string): string[] {
    // Safety flag ordering: Aider is a CLI that uses last-occurrence
    // wins for mutually-exclusive flags. If a user passes
    // `extraArgs: ["--git"]` and the safety flags come first, aider
    // would re-enable git (auto-commits from the chat panel — bad).
    // Putting the safety flags LAST means they always win, regardless
    // of what the user passes in `extraArgs` or `args`. Tests that
    // need to override the safety flags can mock the whole backend.
    return [
      "--message",
      text,
      ...this.extraArgs,
      "--no-pretty",
      "--no-git",
      "--yes-always",
    ];
  }

  protected parseOutput(
    stdout: string,
    _stderr: string,
    _exitCode: number,
  ): string {
    return stripAnsi(stdout).trim();
  }
}

export function createAiderBackend(
  options: AiderBackendOptions = {},
): ExtAgentBackend {
  return new AiderBackend(options);
}

/**
 * Strip ANSI escape codes from Aider output. Aider shouldn't emit colors
 * with `--no-pretty`, but older builds (or specific subcommands like
 * `/lint`, `/test`) may leak a few. Defensive cleanup.
 */
function stripAnsi(s: string): string {
  // Matches CSI sequences (`\x1b[` ... `<letter>`), SGR-only chunks,
  // and standalone ESC sequences Aider may emit. Conservative — won't
  // touch actual text content.
  return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}
