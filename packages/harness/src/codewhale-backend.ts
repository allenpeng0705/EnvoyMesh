/**
 * Phase 68-C3 — CodeWhale ext agent backend.
 *
 * One-shot: `codewhale -p <prompt>` (prints and exits).
 * ACP (`codewhale serve --acp`) is out of scope for Tier B ask —
 * PATH probe + one-shot print mode only.
 *
 * Install: `curl -fsSL https://codewhale.net/install.sh | sh`
 * (or `npm install -g codewhale`). Paseo catalog lists ACP serve;
 * EnvoyMesh uses print mode for Coding ask.
 */

import { OneShotCliBackend } from "./one-shot-cli-backend.js";
import { extractOneShotAssistantText } from "./parse-one-shot-json.js";
import type { ExtAgentBackend } from "./types.js";

const CODEWHALE_DEFAULTS = {
  command: "codewhale",
  requestTimeoutMs: 180_000,
  installHint:
    "Install CodeWhale: `curl -fsSL https://codewhale.net/install.sh | sh` (or `npm install -g codewhale`). Then `codewhale --version` and `codewhale auth set --provider deepseek`.",
} as const;

export interface CodeWhaleBackendOptions {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  requestTimeoutMs?: number;
  extraArgs?: string[];
  binaryOnPath?: (command: string) => Promise<boolean | null>;
  probeArgs?: string[];
}

export class CodeWhaleBackend extends OneShotCliBackend {
  readonly kind = "codewhale" as const;
  readonly label = "CodeWhale";
  private readonly extraArgs: string[];

  constructor(opts: CodeWhaleBackendOptions = {}) {
    super({
      command: opts.command ?? CODEWHALE_DEFAULTS.command,
      args: opts.args,
      env: opts.env,
      requestTimeoutMs:
        opts.requestTimeoutMs ?? CODEWHALE_DEFAULTS.requestTimeoutMs,
      installHint: CODEWHALE_DEFAULTS.installHint,
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
    // `-p` / `--prompt` = one-shot print mode (docs/MODES.md).
    const args = ["-p", text, ...this.extraArgs];
    const model = opts?.model?.trim();
    if (model) args.push("--model", model);
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

export function createCodeWhaleBackend(
  options: CodeWhaleBackendOptions = {},
): ExtAgentBackend {
  return new CodeWhaleBackend(options);
}
