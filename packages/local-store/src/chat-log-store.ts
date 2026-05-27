/**
 * Append-only human chat transcripts under the profile directory (JSONL).
 * One file keeps all threads; rows carry `threadPeerOwnerId` for filtering.
 */

import { appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";

export const CHAT_MESSAGES_FILE = "chat-messages.jsonl";

/** Same shape as `@envoymesh/api` ChatMessage minus UI-only coupling. */
export interface ChatLogEnvelope {
  messageId: string;
  sender: {
    nodeId: string;
    displayName: string;
    ownerId?: string;
    actorRole?: "human" | "agent" | "system";
    agentId?: string;
    agentVerified?: boolean;
  };
  recipient: {
    nodeId: string;
    displayName?: string;
    ownerId?: string;
  };
  content: {
    text: string;
    attachments?: Array<{
      id: string;
      filename: string;
      mimeType: string;
      sizeBytes: number;
      sensitivity: "public" | "friends" | "private";
      vaultRelativePath?: string;
    }>;
  };
  metadata: {
    timestamp: string;
    deliveryReceipt?: "pending" | "sent" | "delivered" | "read" | "failed";
  };
  signature: string;
}

export interface ChatLogLine extends ChatLogEnvelope {
  version: "0.1";
  /** Canonical thread key — the bonded contact's Envoy owner id. */
  threadPeerOwnerId: string;
}

const MAX_JSONL_LINE_CHARS = 12 * 1024 * 1024;

async function appendJsonLine(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  if (line.length > MAX_JSONL_LINE_CHARS) {
    throw new Error(
      `JSONL record exceeds MAX_JSONL_LINE_CHARS (${MAX_JSONL_LINE_CHARS}): ${basename(path)}`,
    );
  }
  await appendFile(path, line, { mode: 0o600 });
}

export interface LocalChatLogStore {
  append(threadPeerOwnerId: string, envelope: ChatLogEnvelope): Promise<void>;
  /** Most recent messages in a thread, ascending by timestamp (default newest cap 800). */
  listThread(threadPeerOwnerId: string, limit?: number): Promise<ChatLogEnvelope[]>;
  /** Scan all stored messages (for RAG backfill). */
  listAllMessages(limit?: number): Promise<Array<ChatLogEnvelope & { threadPeerOwnerId: string }>>;
  /** Remove one message from a thread. Returns true if a row was removed. */
  deleteMessage(threadPeerOwnerId: string, messageId: string): Promise<boolean>;
  /** Remove all messages in a thread. Returns count removed. */
  clearThread(threadPeerOwnerId: string): Promise<number>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function lineToEnvelope(row: ChatLogLine): ChatLogEnvelope {
  return {
    messageId: row.messageId,
    sender: row.sender,
    recipient: row.recipient,
    content: row.content,
    metadata: row.metadata,
    signature: row.signature,
  };
}

async function readAllChatLines(path: string): Promise<ChatLogLine[]> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  const lines = contents.split("\n").filter((l) => l.trim().length > 0);
  const out: ChatLogLine[] = [];
  for (const line of lines) {
    if (line.length > MAX_JSONL_LINE_CHARS) continue;
    try {
      const row = JSON.parse(line) as ChatLogLine;
      if (row.version === "0.1" && row.messageId && row.threadPeerOwnerId) {
        out.push(row);
      }
    } catch {
      /* skip corrupted line */
    }
  }
  return out;
}

async function writeChatLinesAtomic(path: string, rows: ChatLogLine[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const payload = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
  const tmp = join(dirname(path), `.chat-messages.${randomUUID()}.tmp`);
  try {
    await writeFile(tmp, payload, { mode: 0o600 });
    if (process.platform === "win32") {
      try {
        await unlink(path);
      } catch (error) {
        if (!isMissingFileError(error)) {
          throw error;
        }
      }
    }
    await rename(tmp, path);
  } catch (error) {
    try {
      await unlink(tmp);
    } catch {
      // best effort
    }
    throw error;
  }
}

export function createLocalChatLogStore(profileDir: string): LocalChatLogStore {
  const path = join(profileDir.trim(), CHAT_MESSAGES_FILE);
  let tail: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const done = tail.then(fn);
    tail = done.then(
      () => {},
      () => {},
    );
    return done;
  };

  return {
    append(threadPeerOwnerId, envelope) {
      return enqueue(async () => {
        const key = threadPeerOwnerId.trim();
        if (!key) return;
        const line: ChatLogLine = {
          version: "0.1",
          threadPeerOwnerId: key,
          ...envelope,
        };
        await appendJsonLine(path, line);
      });
    },

    async listThread(threadPeerOwnerId: string, limit = 800): Promise<ChatLogEnvelope[]> {
      const needle = threadPeerOwnerId.trim();
      const rows = await readAllChatLines(path);
      const out = rows
        .filter((row) => row.threadPeerOwnerId === needle)
        .map(lineToEnvelope);

      out.sort(
        (a, b) =>
          new Date(a.metadata.timestamp).getTime() -
          new Date(b.metadata.timestamp).getTime(),
      );

      const cap = Math.max(1, Math.min(limit, 5000));
      return out.length > cap ? out.slice(out.length - cap) : out;
    },

    async listAllMessages(limit = 5000) {
      const rows = await readAllChatLines(path);
      const out = rows.map((row) => ({
        threadPeerOwnerId: row.threadPeerOwnerId,
        ...lineToEnvelope(row),
      }));
      const cap = Math.max(1, Math.min(limit, 20_000));
      return out.length > cap ? out.slice(out.length - cap) : out;
    },

    deleteMessage(threadPeerOwnerId, messageId) {
      return enqueue(async () => {
        const thread = threadPeerOwnerId.trim();
        const id = messageId.trim();
        if (!thread || !id) return false;
        const rows = await readAllChatLines(path);
        const next = rows.filter(
          (row) => !(row.threadPeerOwnerId === thread && row.messageId === id),
        );
        if (next.length === rows.length) return false;
        await writeChatLinesAtomic(path, next);
        return true;
      });
    },

    clearThread(threadPeerOwnerId) {
      return enqueue(async () => {
        const thread = threadPeerOwnerId.trim();
        if (!thread) return 0;
        const rows = await readAllChatLines(path);
        const next = rows.filter((row) => row.threadPeerOwnerId !== thread);
        const deleted = rows.length - next.length;
        if (deleted === 0) return 0;
        await writeChatLinesAtomic(path, next);
        return deleted;
      });
    },
  };
}
