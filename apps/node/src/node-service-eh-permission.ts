/**
 * In-flight tool permission waiter for Envoy Harness chat / terminal.
 *
 * Emits `eh:permission` → Social UI dock → `ehRespondToPermission`.
 */

import { randomUUID } from "node:crypto";

import type { EhPermissionEvent } from "@envoymesh/api";

import { buildEhPermissionPreview } from "./agent-runtime-envoy/permission-preview.js";

export type EhPermissionDecision = "allow" | "deny";

export interface EhPermissionRequest {
  sessionId: string;
  toolName: string;
  description: string;
  args: unknown;
}

export interface EhPermissionBridgeEmit {
  (event: "eh:permission", payload: EhPermissionEvent): void;
}

interface Pending {
  resolve: (decision: EhPermissionDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 300_000;

export class EhPermissionBridge {
  readonly #pending = new Map<string, Pending>();
  readonly #emit: EhPermissionBridgeEmit;
  readonly #timeoutMs: number;
  readonly #getCwd: (() => Promise<string | undefined>) | undefined;

  constructor(
    emit: EhPermissionBridgeEmit,
    opts?: {
      timeoutMs?: number;
      getCwd?: () => Promise<string | undefined>;
    },
  ) {
    this.#emit = emit;
    this.#timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#getCwd = opts?.getCwd;
  }

  request(req: EhPermissionRequest): Promise<EhPermissionDecision> {
    const requestId = randomUUID();
    return new Promise<EhPermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        resolve("deny");
      }, this.#timeoutMs);

      this.#pending.set(requestId, { resolve, timer });

      void (async () => {
        const cwd = this.#getCwd !== undefined ? await this.#getCwd() : undefined;
        const preview = await buildEhPermissionPreview(
          { toolName: req.toolName, args: req.args },
          cwd,
        );
        this.#emit("eh:permission", {
          requestId,
          sessionId: req.sessionId,
          toolName: req.toolName,
          description: req.description,
          args: req.args,
          timeoutMs: this.#timeoutMs,
          ...(preview !== undefined ? { preview } : {}),
        });
      })();
    });
  }

  respond(
    requestId: string,
    decision: EhPermissionDecision,
  ): { delivered: boolean } {
    const entry = this.#pending.get(requestId);
    if (!entry) return { delivered: false };
    clearTimeout(entry.timer);
    this.#pending.delete(requestId);
    entry.resolve(decision);
    return { delivered: true };
  }

  clear(): void {
    for (const [, entry] of this.#pending) {
      clearTimeout(entry.timer);
      entry.resolve("deny");
    }
    this.#pending.clear();
  }

  get size(): number {
    return this.#pending.size;
  }
}
