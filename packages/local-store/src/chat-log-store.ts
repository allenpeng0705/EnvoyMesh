/**
 * Append-only human chat transcripts under the profile directory (JSONL).
 * One file keeps all threads; rows carry `threadPeerOwnerId` for filtering.
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export const CHAT_MESSAGES_FILE = "chat-messages.jsonl";

/** Same shape as `@envoymesh/api` ChatMessage minus UI-only coupling. */
export interface ChatLogEnvelope {
  messageId: string;
  sender: {
    nodeId: string;
    displayName: string;
    ownerId?: string;
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

function createSerialJsonlAppender(path: string): (value: unknown) => Promise<void> {
  let tail: Promise<unknown> = Promise.resolve();
  return (value: unknown) => {
    const done = tail.then(() => appendJsonLine(path, value));
    tail = done.then(
      () => {},
      () => {},
    );
    return done;
  };
}

export interface LocalChatLogStore {
  append(threadPeerOwnerId: string, envelope: ChatLogEnvelope): Promise<void>;
  /** Most recent messages in a thread, ascending by timestamp (default newest cap 800). */
  listThread(threadPeerOwnerId: string, limit?: number): Promise<ChatLogEnvelope[]>;
  /** Scan all stored messages (for RAG backfill). */
  listAllMessages(limit?: number): Promise<Array<ChatLogEnvelope & { threadPeerOwnerId: string }>>;
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

export function createLocalChatLogStore(profileDir: string): LocalChatLogStore {
  const path = join(profileDir.trim(), CHAT_MESSAGES_FILE);
  const appendQueued = createSerialJsonlAppender(path);

  return {
    async append(threadPeerOwnerId: string, envelope: ChatLogEnvelope) {
      const key = threadPeerOwnerId.trim();
      if (!key) return;
      const line: ChatLogLine = {
        version: "0.1",
        threadPeerOwnerId: key,
        ...envelope,
      };
      await appendQueued(line);
    },

    async listThread(threadPeerOwnerId: string, limit = 800): Promise<ChatLogEnvelope[]> {
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
      const needle = threadPeerOwnerId.trim();
      const out: ChatLogEnvelope[] = [];

      for (const line of lines) {
        if (line.length > MAX_JSONL_LINE_CHARS) continue;
        try {
          const row = JSON.parse(line) as ChatLogLine;
          if (row.threadPeerOwnerId === needle && row.version === "0.1" && row.messageId) {
            out.push(lineToEnvelope(row));
          }
        } catch {
          /* skip corrupted line */
        }
      }

      out.sort(
        (a, b) =>
          new Date(a.metadata.timestamp).getTime() -
          new Date(b.metadata.timestamp).getTime(),
      );

      const cap = Math.max(1, Math.min(limit, 5000));
      return out.length > cap ? out.slice(out.length - cap) : out;
    },

    async listAllMessages(limit = 5000) {
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
      const out: Array<ChatLogEnvelope & { threadPeerOwnerId: string }> = [];
      for (const line of lines) {
        if (line.length > MAX_JSONL_LINE_CHARS) continue;
        try {
          const row = JSON.parse(line) as ChatLogLine;
          if (row.version === "0.1" && row.messageId && row.threadPeerOwnerId) {
            out.push({ threadPeerOwnerId: row.threadPeerOwnerId, ...lineToEnvelope(row) });
          }
        } catch {
          /* skip corrupted line */
        }
      }
      const cap = Math.max(1, Math.min(limit, 20_000));
      return out.length > cap ? out.slice(out.length - cap) : out;
    },
  };
}
