/**
 * Per-chat Envoy Harness runtime: ACP hosts + in-flight turns (parallel across projects).
 */

import type { EhTurnCompleteEvent } from "@envoymesh/api";

import type { EnvoyHarnessPersistentAcpHost } from "./agent-runtime-envoy/persistent-acp-host.js";

export interface EhActiveTurnRecord {
  turnId: string;
  chatId?: string;
  sessionId?: string;
  cwd: string;
  userPrompt: string;
  startedAt: string;
  streamingText: string;
  changedFiles: string[];
  resultPromise: Promise<EhTurnCompleteEvent>;
}

export interface EhChatHostRecord {
  host: EnvoyHarnessPersistentAcpHost;
  cwd: string;
  configKey: string;
  sessionId: string;
}

export class EhChatRuntime {
  readonly #hosts = new Map<string, EhChatHostRecord>();
  readonly #sessionToChatId = new Map<string, string>();
  readonly #turns = new Map<string, EhActiveTurnRecord>();
  readonly #turnIdByChatId = new Map<string, string>();

  getHost(chatId: string): EhChatHostRecord | undefined {
    return this.#hosts.get(chatId);
  }

  setHost(chatId: string, record: EhChatHostRecord): void {
    this.#hosts.set(chatId, record);
    this.#sessionToChatId.set(record.sessionId, chatId);
  }

  removeHost(chatId: string): void {
    const record = this.#hosts.get(chatId);
    if (record) {
      this.#sessionToChatId.delete(record.sessionId);
      record.host.close();
    }
    this.#hosts.delete(chatId);
  }

  /**
   * Close every idle per-chat host (e.g. after a permission-policy
   * change). Hosts with an in-flight turn stay alive so the current
   * turn is not killed; the new policy applies on the next turn.
   */
  closeAll(): void {
    for (const chatId of [...this.#hosts.keys()]) {
      if (this.#turnIdByChatId.has(chatId)) continue;
      this.removeHost(chatId);
    }
  }

  chatIdForSession(sessionId: string): string | undefined {
    return this.#sessionToChatId.get(sessionId);
  }

  registerTurn(record: EhActiveTurnRecord): void {
    this.#turns.set(record.turnId, record);
    if (record.chatId) {
      this.#turnIdByChatId.set(record.chatId, record.turnId);
    }
  }

  getTurn(turnId: string): EhActiveTurnRecord | undefined {
    return this.#turns.get(turnId);
  }

  getTurnForChat(chatId: string): EhActiveTurnRecord | undefined {
    const turnId = this.#turnIdByChatId.get(chatId);
    return turnId ? this.#turns.get(turnId) : undefined;
  }

  removeTurn(turnId: string): EhActiveTurnRecord | undefined {
    const record = this.#turns.get(turnId);
    if (!record) return undefined;
    this.#turns.delete(turnId);
    if (record.chatId && this.#turnIdByChatId.get(record.chatId) === turnId) {
      this.#turnIdByChatId.delete(record.chatId);
    }
    return record;
  }

  hasTurnForChat(chatId: string): boolean {
    return this.#turnIdByChatId.has(chatId);
  }

  activeTurnCount(): number {
    return this.#turns.size;
  }

  listActiveTurns(): EhActiveTurnRecord[] {
    return [...this.#turns.values()];
  }
}
