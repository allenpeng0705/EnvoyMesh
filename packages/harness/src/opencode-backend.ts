/**
 * Phase 68-C3 — OpenCode ext agent backend.
 *
 * One-shot: `opencode run --format json <prompt>` (non-interactive).
 * Install: `curl -fsSL https://opencode.ai/install | bash`
 * (or `npm install -g opencode-ai` — package name is opencode-ai).
 *
 * Paseo IA reference only — install URLs from public OpenCode docs.
 */

import { OneShotCliBackend } from "./one-shot-cli-backend.js";
import { extractOneShotAssistantText } from "./parse-one-shot-json.js";
import type { ExtAgentBackend } from "./types.js";

const OPENCODE_DEFAULTS = {
  command: "opencode",
  requestTimeoutMs: 180_000,
  installHint:
    "Install OpenCode: `curl -fsSL https://opencode.ai/install | bash` (or `npm install -g opencode-ai`). Then `opencode --version` and `opencode auth login`.",
} as const;

export interface OpenCodeBackendOptions {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  extraArgs?: string[];
  binaryOnPath?: (command: string) => Promise<boolean | null>;
  probeArgs?: string[];
}

export class OpenCodeBackend extends OneShotCliBackend {
  readonly kind = "opencode" as const;
  readonly label = "OpenCode";
  private readonly extraArgs: string[];

  constructor(opts: OpenCodeBackendOptions = {}) {
    super({
      command: opts.command ?? OPENCODE_DEFAULTS.command,
      args: opts.args,
      env: opts.env,
      requestTimeoutMs:
        opts.requestTimeoutMs ?? OPENCODE_DEFAULTS.requestTimeoutMs,
      installHint: OPENCODE_DEFAULTS.installHint,
      binaryOnPath: opts.binaryOnPath,
      probeArgs: opts.probeArgs,
    });
    this.extraArgs = opts.extraArgs ?? [];
  }

  protected buildArgs(
    text: string,
    _sessionKey: string,
    opts?: import("./types.js").ExtAgentAskOpts,
  ): string[] {
    // Non-interactive one-shot. `--format json` yields parseable events;
    // plain text stdout is accepted as a fallback in parseOutput.
    const args = ["run", "--format", "json", ...this.extraArgs];
    const model = opts?.model?.trim();
    if (model) args.push("--model", model);
    args.push(text);
    return args;
  }

  protected parseOutput(
    stdout: string,
    _stderr: string,
    _exitCode: number,
  ): string {
    const extracted = extractOneShotAssistantText(stdout, {
      flatKeys: ["text", "content", "message", "result", "output"],
      prefer: "flat-first",
      ndjson: true,
    });
    return extracted ?? stdout.trim();
  }
}

export function createOpenCodeBackend(
  options: OpenCodeBackendOptions = {},
): ExtAgentBackend {
  return new OpenCodeBackend(options);
}
