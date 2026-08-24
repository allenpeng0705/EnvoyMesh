/**
 * U6 — persistent in-process ACP host (one session for chat + EHUI).
 *
 * Uses `attachAcpServer` + `createAgentSessionBackend` so plan / memory /
 * transcript state is shared between `askEnvoyHarness` and EHUI panel RPCs.
 */

import { PassThrough } from "node:stream";

import {
  attachAcpServer,
  JsonRpcConnection,
  type ProtocolSessionBackend,
} from "@envoymesh/envoy-harness";
import {
  EnvoyHarnessClient,
  createEhuiDataSource,
  type EhuiDataSource,
} from "@envoymesh/envoy-harness-client";

export interface AcpPermissionBridge {
  request(req: {
    sessionId: string;
    toolName: string;
    description: string;
    args: unknown;
  }): Promise<"allow" | "deny">;
  clear(): void;
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

export class EnvoyHarnessPersistentAcpHost {
  #client: EnvoyHarnessClient | undefined;
  #sessionId: string | undefined;
  #cwd: string | undefined;
  #disposeServer: (() => void) | undefined;
  #c2s: PassThrough | undefined;
  #s2c: PassThrough | undefined;

  get sessionId(): string | undefined {
    return this.#sessionId;
  }

  async start(opts: {
    cwd: string;
    backend: ProtocolSessionBackend;
    permissionBridge: AcpPermissionBridge;
  }): Promise<void> {
    if (this.#sessionId !== undefined && this.#cwd === opts.cwd) {
      return;
    }
    this.close();
    const c2s = new PassThrough();
    const s2c = new PassThrough();
    this.#c2s = c2s;
    this.#s2c = s2c;
    const server = new JsonRpcConnection({ input: c2s, output: s2c });
    this.#disposeServer = attachAcpServer({
      connection: server,
      backend: opts.backend,
    });
    const bridge = opts.permissionBridge;
    const client = new EnvoyHarnessClient({
      input: s2c,
      output: c2s,
      onPermissionRequest: async (req) => bridge.request(req),
    });
    this.#client = client;
    await client.initialize();
    const created = await client.acpNewSession({ cwd: opts.cwd });
    this.#sessionId = created.sessionId;
    this.#cwd = opts.cwd;
  }

  async prompt(
    text: string,
    opts?: {
      signal?: AbortSignal;
      onActivity?: (activity: {
        kind: string;
        summary: string;
        toolName?: string;
        ts?: string;
      }) => void;
      onToken?: (token: { role: string; delta: string }) => void;
    },
  ): Promise<{
    text: string;
    stopReason: string;
    turnHints?: {
      followUps?: string[];
      deferred?: Array<{ task: string; reason: string }>;
    };
  }> {
    if (this.#client === undefined || this.#sessionId === undefined) {
      throw new Error("EnvoyHarnessPersistentAcpHost: call start() first");
    }
    const sessionId = this.#sessionId;
    const signal = opts?.signal;
    if (signal?.aborted) {
      throw new Error("envoy_harness_cancelled");
    }
    const onAbort = (): void => {
      void this.#client?.cancel(sessionId);
    };
    if (signal !== undefined) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    try {
      const unsubActivity = this.#client.onNotification(
        "session/activity",
        (params) => {
          const p = params as {
            sessionId?: string;
            activity?: {
              kind: string;
              summary: string;
              toolName?: string;
              ts?: string;
            };
          };
          if (p.sessionId !== sessionId || p.activity === undefined) return;
          opts?.onActivity?.(p.activity);
        },
      );
      const unsubToken = this.#client.onNotification(
        "session/token",
        (params) => {
          const p = params as {
            sessionId?: string;
            token?: { role?: string; delta?: string };
          };
          if (p.sessionId !== sessionId || p.token === undefined) return;
          const role = p.token.role ?? "assistant";
          const delta = p.token.delta ?? "";
          if (delta.length === 0) return;
          opts?.onToken?.({ role, delta });
        },
      );
      try {
        const result = await this.#client.prompt(sessionId, text);
        return {
          text: assistantTextFromMessages(result.messages),
          stopReason: result.stopReason,
          ...(result.turnHints !== undefined ? { turnHints: result.turnHints } : {}),
        };
      } finally {
        unsubActivity();
        unsubToken();
      }
    } finally {
      if (signal !== undefined) {
        signal.removeEventListener("abort", onAbort);
      }
    }
  }

  getDataSource(): EhuiDataSource {
    if (this.#client === undefined || this.#sessionId === undefined) {
      throw new Error("EnvoyHarnessPersistentAcpHost: call start() first");
    }
    return createEhuiDataSource(this.#client, this.#sessionId);
  }

  getClient(): EnvoyHarnessClient {
    if (this.#client === undefined) {
      throw new Error("EnvoyHarnessPersistentAcpHost: call start() first");
    }
    return this.#client;
  }

  async cancelActiveTurn(): Promise<void> {
    if (this.#client === undefined || this.#sessionId === undefined) return;
    await this.#client.cancel(this.#sessionId);
  }

  close(): void {
    this.#client?.close();
    this.#disposeServer?.();
    this.#c2s?.destroy();
    this.#s2c?.destroy();
    this.#client = undefined;
    this.#sessionId = undefined;
    this.#cwd = undefined;
    this.#disposeServer = undefined;
    this.#c2s = undefined;
    this.#s2c = undefined;
  }
}
