/**
 * Phase G / 12b — EnvoyMesh ACP host for envoy-harness.
 *
 * Wraps `@envoymesh/envoy-harness-client` so Tauri / node can talk to
 * Package 1 over the same ACP contract as `envoy-harness-tui`:
 * permissions, committed transcript updates, prompt/cancel.
 *
 * Two modes:
 * - **spawn** — child `node …/cli/acp-stdio.js` (or `envoy-harness --acp`)
 * - **in-process** — PassThrough pair + `attachAcpServer` (hermetic tests
 *   and same-process Tauri workers)
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  attachAcpServer,
  createFakeSessionBackend,
  JsonRpcConnection,
  type ProtocolSessionBackend,
} from "@envoymesh/envoy-harness";
import {
  EnvoyHarnessClient,
  spawnAcpServer,
  type SpawnAcpOptions,
} from "@envoymesh/envoy-harness-client";

/** Permission request surfaced to EnvoyMesh UI (default deny). */
export interface AcpPermissionRequest {
  sessionId: string;
  toolName: string;
  description: string;
  args: unknown;
}

export type AcpPermissionDecision = "allow" | "deny";

/** Committed transcript update from `session/update`. */
export interface AcpTranscriptUpdate {
  dialect: "acp" | "sdk";
  params: unknown;
}

export interface EnvoyHarnessAcpHostOptions {
  cwd?: string;
  /**
   * `"spawn"` (default) — child ACP process.
   * `"in-process"` — PassThrough + `attachAcpServer`.
   */
  transport?: "spawn" | "in-process";
  /** Spawn mode: harness command. Default: resolve staged / PATH. */
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  stderr?: SpawnAcpOptions["stderr"];
  /** In-process session backend (default fake). */
  backend?: ProtocolSessionBackend;
  onPermission?: (
    req: AcpPermissionRequest,
  ) => Promise<AcpPermissionDecision>;
  onTranscript?: (update: AcpTranscriptUpdate) => void;
}

export interface EnvoyHarnessAcpHost {
  readonly sessionId: string | undefined;
  start(): Promise<{ sessionId: string; protocolVersion: number }>;
  prompt(text: string): Promise<{
    stopReason: string;
    messages: unknown[];
    assistantText: string;
  }>;
  cancel(): Promise<void>;
  close(): void;
}

/**
 * Resolve a command that serves `envoy-harness --acp`.
 *
 * Order:
 * 1. `ENVOY_HARNESS_ACP_CMD` (full executable)
 * 2. `ENVOY_HARNESS_RESOURCES` + `cli/acp-stdio.js` (Tauri staged tree)
 * 3. Sibling monorepo `packages/envoy-harness/dist/cli/acp-stdio.js`
 * 4. `envoy-harness` on PATH with `--acp`
 */
export function resolveEnvoyHarnessAcpCommand(): {
  command: string;
  args: string[];
} {
  if (process.env.ENVOY_HARNESS_ACP_CMD) {
    return { command: process.env.ENVOY_HARNESS_ACP_CMD, args: [] };
  }

  const resources = process.env.ENVOY_HARNESS_RESOURCES;
  if (resources) {
    const staged = path.join(resources, "envoy-harness", "cli", "acp-stdio.js");
    if (existsSync(staged)) {
      return { command: process.execPath, args: [staged] };
    }
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const siblingDist = path.resolve(
    here,
    "../../../../../envoy-harness/packages/envoy-harness/dist/cli/acp-stdio.js",
  );
  if (existsSync(siblingDist)) {
    return { command: process.execPath, args: [siblingDist] };
  }

  return { command: "envoy-harness", args: ["--acp"] };
}

function assistantTextFromMessages(messages: unknown[]): string {
  const parts: string[] = [];
  for (const m of messages) {
    if (
      typeof m === "object" &&
      m !== null &&
      "role" in m &&
      (m as { role: unknown }).role === "assistant" &&
      "text" in m &&
      typeof (m as { text: unknown }).text === "string"
    ) {
      parts.push((m as { text: string }).text);
    }
  }
  return parts.join("\n");
}

/** Create an ACP host (spawn by default; in-process when asked). */
export function createEnvoyHarnessAcpHost(
  options: EnvoyHarnessAcpHostOptions = {},
): EnvoyHarnessAcpHost {
  const inProcess =
    options.transport === "in-process" || options.backend !== undefined;
  if (inProcess) return createInProcessAcpHost(options);
  return createSpawnedAcpHost(options);
}

function createInProcessAcpHost(
  options: EnvoyHarnessAcpHostOptions,
): EnvoyHarnessAcpHost {
  const c2s = new PassThrough();
  const s2c = new PassThrough();
  const server = new JsonRpcConnection({ input: c2s, output: s2c });
  const backend = options.backend ?? createFakeSessionBackend();
  const disposeServer = attachAcpServer({ connection: server, backend });

  const handlePermission = async (
    req: AcpPermissionRequest,
  ): Promise<AcpPermissionDecision> => {
    if (options.onPermission) return options.onPermission(req);
    return "deny";
  };

  const client = new EnvoyHarnessClient({
    input: s2c,
    output: c2s,
    onPermissionRequest: (req) => handlePermission(req),
    onEvent: (event) => options.onTranscript?.(event),
  });

  let sessionId: string | undefined;
  let closed = false;

  return {
    get sessionId() {
      return sessionId;
    },
    async start() {
      const init = await client.initialize();
      const created = await client.acpNewSession(
        options.cwd !== undefined ? { cwd: options.cwd } : undefined,
      );
      sessionId = created.sessionId;
      return {
        sessionId: created.sessionId,
        protocolVersion: init.protocolVersion,
      };
    },
    async prompt(text) {
      if (sessionId === undefined) {
        throw new Error("EnvoyHarnessAcpHost: call start() before prompt()");
      }
      const result = await client.prompt(sessionId, text);
      return {
        stopReason: result.stopReason,
        messages: result.messages,
        assistantText: assistantTextFromMessages(result.messages),
      };
    },
    async cancel() {
      if (sessionId !== undefined) await client.cancel(sessionId);
    },
    close() {
      if (closed) return;
      closed = true;
      client.close();
      disposeServer();
      server.close();
      c2s.destroy();
      s2c.destroy();
    },
  };
}

function createSpawnedAcpHost(
  options: EnvoyHarnessAcpHostOptions,
): EnvoyHarnessAcpHost {
  const resolved =
    options.command !== undefined
      ? { command: options.command, args: options.args ?? ["--acp"] }
      : resolveEnvoyHarnessAcpCommand();

  const spawned = spawnAcpServer({
    command: resolved.command,
    args: resolved.args,
    ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.stderr !== undefined ? { stderr: options.stderr } : {}),
    onPermissionRequest: async (req) => {
      if (options.onPermission) return options.onPermission(req);
      return "deny";
    },
    onEvent: (event) => options.onTranscript?.(event),
  });

  let sessionId: string | undefined;
  let closed = false;

  return {
    get sessionId() {
      return sessionId;
    },
    async start() {
      const init = await spawned.client.initialize();
      const created = await spawned.client.acpNewSession(
        options.cwd !== undefined ? { cwd: options.cwd } : undefined,
      );
      sessionId = created.sessionId;
      return {
        sessionId: created.sessionId,
        protocolVersion: init.protocolVersion,
      };
    },
    async prompt(text) {
      if (sessionId === undefined) {
        throw new Error("EnvoyHarnessAcpHost: call start() before prompt()");
      }
      const result = await spawned.client.prompt(sessionId, text);
      return {
        stopReason: result.stopReason,
        messages: result.messages,
        assistantText: assistantTextFromMessages(result.messages),
      };
    },
    async cancel() {
      if (sessionId !== undefined) await spawned.client.cancel(sessionId);
    },
    close() {
      if (closed) return;
      closed = true;
      spawned.close();
    },
  };
}
