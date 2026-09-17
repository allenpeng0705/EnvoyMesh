/**
 * Catalog ACP backend — spawn a Paseo-catalog CLI and run one ACP prompt.
 */

import {
  codingProviderInstallHint,
  codingProviderProbeBinary,
  type CodingProviderEntry,
} from "@envoymesh/api/core";
import { runCatalogAcpPrompt } from "./catalog-acp-session.js";
import { InstallMissingError } from "./daemon-supervisor.js";
import { isExtAgentBinaryAvailable } from "./resolve-ext-agent-binary.js";
import type { ExtAgentAskOpts, ExtAgentBackend } from "./types.js";

export class CatalogAcpBackend implements ExtAgentBackend {
  readonly kind: string;
  readonly label: string;
  private readonly entry: CodingProviderEntry;

  constructor(entry: CodingProviderEntry) {
    this.entry = entry;
    this.kind = entry.id;
    this.label = entry.title;
  }

  async probe(): Promise<boolean> {
    const bin = codingProviderProbeBinary(this.entry);
    return isExtAgentBinaryAvailable(bin);
  }

  async ask(
    text: string,
    sessionKey: string,
    opts?: ExtAgentAskOpts,
  ): Promise<string> {
    if (!text.trim()) return "";
    if (!sessionKey) {
      throw new Error(`${this.entry.id} ask(): sessionKey is required`);
    }
    const cwd = opts?.cwd?.trim();
    if (!cwd) {
      throw new Error(`${this.entry.id} ask(): cwd required`);
    }
    const [command, ...args] = this.entry.command;
    const bin = codingProviderProbeBinary(this.entry);
    if (!isExtAgentBinaryAvailable(bin)) {
      throw new InstallMissingError({
        command: bin,
        reason: "pre-check",
        installHint: codingProviderInstallHint(this.entry),
      });
    }
    return runCatalogAcpPrompt({
      command,
      args,
      cwd,
      prompt: text,
      env: {
        ...this.entry.env,
        ...(opts?.env ?? {}),
      },
      installHint: codingProviderInstallHint(this.entry),
      onDelta: opts?.onDelta,
      permissionPolicy: opts?.permissionPolicy ?? "safe-only",
    });
  }
}

export function createCatalogAcpBackend(
  entry: CodingProviderEntry,
): ExtAgentBackend {
  return new CatalogAcpBackend(entry);
}
