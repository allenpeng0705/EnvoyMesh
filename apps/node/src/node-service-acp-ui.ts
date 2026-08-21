/**
 * Phase G / 12b — in-flight ACP permission waiter (Pi-style).
 *
 * Host maps emissions onto existing `pi:proposal` /
 * `piRespondToProposal` so EnvoyGo needs no protocol changes.
 */

import { randomUUID } from "node:crypto";

import type {
  AcpPermissionDecision,
  AcpPermissionRequest,
} from "./agent-runtime-envoy/acp-host.js";

export interface AcpPermissionBridgeEmit {
  (event: "acp:permission", payload: {
    requestId: string;
    sessionId: string;
    toolName: string;
    description: string;
    args: unknown;
    timeoutMs: number;
  }): void;
}

interface PendingAcpPermission {
  resolve: (decision: AcpPermissionDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export class AcpPermissionBridge {
  readonly #pending = new Map<string, PendingAcpPermission>();
  readonly #emit: AcpPermissionBridgeEmit;
  readonly #timeoutMs: number;

  constructor(
    emit: AcpPermissionBridgeEmit,
    opts?: { timeoutMs?: number },
  ) {
    this.#emit = emit;
    this.#timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** Ask Social; default deny on timeout or missing UI. */
  request(req: AcpPermissionRequest): Promise<AcpPermissionDecision> {
    const requestId = randomUUID();
    return new Promise<AcpPermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        resolve("deny");
      }, this.#timeoutMs);

      this.#pending.set(requestId, { resolve, timer });
      this.#emit("acp:permission", {
        requestId,
        sessionId: req.sessionId,
        toolName: req.toolName,
        description: req.description,
        args: req.args,
        timeoutMs: this.#timeoutMs,
      });
    });
  }

  /** Deliver Social's allow/deny. Returns false if already timed out. */
  respond(
    requestId: string,
    decision: AcpPermissionDecision,
  ): { delivered: boolean } {
    const entry = this.#pending.get(requestId);
    if (!entry) return { delivered: false };
    clearTimeout(entry.timer);
    this.#pending.delete(requestId);
    entry.resolve(decision);
    return { delivered: true };
  }

  /** Cancel all waiters (node shutdown / turn abort). */
  clear(): void {
    for (const [id, entry] of this.#pending) {
      clearTimeout(entry.timer);
      entry.resolve("deny");
      this.#pending.delete(id);
    }
  }

  get size(): number {
    return this.#pending.size;
  }
}
