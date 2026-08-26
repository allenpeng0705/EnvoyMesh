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
  sessionId: string;
  chatId?: string;
}

const DEFAULT_TIMEOUT_MS = 300_000;

export class EhPermissionBridge {
  readonly #pending = new Map<string, Pending>();
  readonly #emit: EhPermissionBridgeEmit;
  readonly #timeoutMs: number;
  readonly #getCwd: (() => Promise<string | undefined>) | undefined;
  readonly #onResolved: ((requestId: string, status: "allowed" | "denied" | "expired", chatId?: string) => void) | undefined;

  readonly #getChatIdForSession:
    | ((sessionId: string) => string | undefined)
    | undefined;

  constructor(
    emit: EhPermissionBridgeEmit,
    opts?: {
      timeoutMs?: number;
      getCwd?: () => Promise<string | undefined>;
      getChatIdForSession?: (sessionId: string) => string | undefined;
      onResolved?: (requestId: string, status: "allowed" | "denied" | "expired", chatId?: string) => void;
    },
  ) {
    this.#emit = emit;
    this.#timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#getCwd = opts?.getCwd;
    this.#getChatIdForSession = opts?.getChatIdForSession;
    this.#onResolved = opts?.onResolved;
  }

  request(req: EhPermissionRequest): Promise<EhPermissionDecision> {
    const requestId = randomUUID();
    return new Promise<EhPermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        const entry = this.#pending.get(requestId);
        this.#pending.delete(requestId);
        this.#onResolved?.(requestId, "expired", entry?.chatId);
        resolve("deny");
      }, this.#timeoutMs);

      const chatId = this.#getChatIdForSession?.(req.sessionId);
      this.#pending.set(requestId, { resolve, timer, sessionId: req.sessionId, ...(chatId ? { chatId } : {}) });

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
          ...(chatId ? { chatId } : {}),
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
    this.#onResolved?.(requestId, decision === "allow" ? "allowed" : "denied", entry.chatId);
    return { delivered: true };
  }

  clearForSession(sessionId: string): void {
    for (const [id, entry] of this.#pending) {
      if (entry.sessionId !== sessionId) continue;
      clearTimeout(entry.timer);
      entry.resolve("deny");
      this.#pending.delete(id);
      this.#onResolved?.(id, "denied", entry.chatId);
    }
  }

  clear(): void {
    for (const [id, entry] of this.#pending) {
      clearTimeout(entry.timer);
      entry.resolve("deny");
      this.#onResolved?.(id, "denied", entry.chatId);
    }
    this.#pending.clear();
  }

  get size(): number {
    return this.#pending.size;
  }
}
