/**
 * Append-only chat drafts under the profile directory (JSONL).
 * Drafts are keyed by threadPeerOwnerId + draftId.
 */

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const CHAT_DRAFTS_FILE = "chat-drafts.jsonl";

export interface ChatDraft {
  draftId: string;
  threadPeerOwnerId: string;
  inReplyToMessageId: string;
  text: string;
  createdAt: string;
}

interface ChatDraftLine {
  version: "0.1";
  draftId: string;
  threadPeerOwnerId: string;
  inReplyToMessageId: string;
  text: string;
  createdAt: string;
}

function lineToDraft(line: ChatDraftLine): ChatDraft {
  return {
    draftId: line.draftId,
    threadPeerOwnerId: line.threadPeerOwnerId,
    inReplyToMessageId: line.inReplyToMessageId,
    text: line.text,
    createdAt: line.createdAt,
  };
}

export interface ChatDraftStore {
  /** Save a draft, replacing any existing draft for the same thread+draftId. */
  save(draft: ChatDraft): Promise<void>;
  /** List drafts for a given thread, most recent first. */
  listByThread(threadPeerOwnerId: string): Promise<ChatDraft[]>;
  /** List all drafts across all threads, most recent first. */
  listAll(): Promise<ChatDraft[]>;
  /** Delete a specific draft by id. */
  delete(draftId: string): Promise<void>;
  /** Delete all drafts for a given thread. */
  deleteByThread(threadPeerOwnerId: string): Promise<void>;
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

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function createChatDraftStore(profileDir: string): ChatDraftStore {
  const path = join(profileDir.trim(), CHAT_DRAFTS_FILE);
  const appendQueued = createSerialJsonlAppender(path);

  return {
    async save(draft: ChatDraft) {
      const line: ChatDraftLine = {
        version: "0.1",
        draftId: draft.draftId,
        threadPeerOwnerId: draft.threadPeerOwnerId,
        inReplyToMessageId: draft.inReplyToMessageId,
        text: draft.text,
        createdAt: draft.createdAt,
      };
      await appendQueued(line);
    },

    async listByThread(threadPeerOwnerId: string): Promise<ChatDraft[]> {
      const all = await loadAllDrafts(path);
      return all
        .filter((d) => d.threadPeerOwnerId === threadPeerOwnerId.trim())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    async listAll(): Promise<ChatDraft[]> {
      const all = await loadAllDrafts(path);
      return all.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },

    async delete(draftId: string) {
      const all = await loadAllDrafts(path);
      const filtered = all.filter((d) => d.draftId !== draftId);
      await writeAllDrafts(path, filtered);
    },

    async deleteByThread(threadPeerOwnerId: string) {
      const all = await loadAllDrafts(path);
      const filtered = all.filter((d) => d.threadPeerOwnerId !== threadPeerOwnerId.trim());
      await writeAllDrafts(path, filtered);
    },
  };
}

async function loadAllDrafts(filePath: string): Promise<ChatDraft[]> {
  let contents: string;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  const lines = contents.split("\n").filter((l) => l.trim().length > 0);
  const drafts: ChatDraft[] = [];

  for (const line of lines) {
    if (line.length > 10000) continue; // sanity cap
    try {
      const row = JSON.parse(line) as ChatDraftLine;
      if (row.version === "0.1" && row.draftId && row.threadPeerOwnerId) {
        drafts.push(lineToDraft(row));
      }
    } catch {
      /* skip corrupted line */
    }
  }

  return drafts;
}

async function writeAllDrafts(filePath: string, drafts: ChatDraft[]): Promise<void> {
  const lines = drafts.map(
    (d) =>
      JSON.stringify({
        version: "0.1" as const,
        draftId: d.draftId,
        threadPeerOwnerId: d.threadPeerOwnerId,
        inReplyToMessageId: d.inReplyToMessageId,
        text: d.text,
        createdAt: d.createdAt,
      }),
  );
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, lines.join("\n") + "\n", { mode: 0o600 });
}
