/**
 * Envoy chat workspace registry helpers (sidebar threads ↔ projects).
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { EhChatWorkspace } from "@envoymesh/api";
import { MAX_ENVOY_HARNESS_CHATS } from "@envoymesh/api";
import { SessionStore } from "@envoymesh/envoy-harness";

import {
  assertEhChatCapacity,
  findEhChatByCwd,
  findEhChatById,
  migrateLegacyEhChats,
  removeEhChat,
  sortEhChats,
  summarizeEhChats,
  touchEhChat,
  updateEhChatCwd,
  upsertEhChatSessionId,
} from "../src/envoy-harness-chats.js";

function chat(overrides: Partial<EhChatWorkspace> = {}): EhChatWorkspace {
  return {
    id: "chat-1",
    cwd: "/projects/app",
    title: "app",
    createdAt: "2026-08-01T00:00:00.000Z",
    lastUsedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "eh-chats-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("envoy-harness-chats", () => {
  it("sorts by lastUsedAt (newest first)", () => {
    const old = chat({ id: "old", lastUsedAt: "2026-08-01T00:00:00.000Z" });
    const fresh = chat({ id: "fresh", lastUsedAt: "2026-08-02T00:00:00.000Z" });
    expect(sortEhChats([old, fresh]).map((c) => c.id)).toEqual([
      "fresh",
      "old",
    ]);
  });

  it("finds chats by id and normalized cwd", () => {
    const chats = [
      chat({ id: "a", cwd: "/projects/app/" }),
      chat({ id: "b", cwd: "/projects/other" }),
    ];
    expect(findEhChatById(chats, "b")?.id).toBe("b");
    expect(findEhChatByCwd(chats, "/projects/app")?.id).toBe("a");
    expect(findEhChatByCwd(chats, "/projects/missing")).toBeUndefined();
  });

  it("migrates the legacy single project into one chat row", () => {
    const migrated = migrateLegacyEhChats({
      chats: undefined,
      legacyCwd: "/projects/app",
      sessionByCwd: { "/projects/app": "sess-legacy" },
    });
    expect(migrated).toHaveLength(1);
    expect(migrated[0]?.cwd).toBe("/projects/app");
    expect(migrated[0]?.sessionId).toBe("sess-legacy");
    expect(migrated[0]?.title).toBe("app");
  });

  it("keeps existing chats over legacy migration (no duplicates)", () => {
    const existing = [chat({ id: "keep" })];
    const migrated = migrateLegacyEhChats({
      chats: existing,
      legacyCwd: "/projects/app",
      sessionByCwd: {},
    });
    expect(migrated).toEqual(existing);
  });

  it("summarizes chats with persisted message counts", async () => {
    const store = new SessionStore({ dir: tmpDir });
    const session = await store.create({
      cwd: "/projects/app",
      startedAt: new Date().toISOString(),
      permissionMode: "workspace-write",
    });
    await session.appendMessage("user", [{ type: "text", text: "hi" }]);
    await session.appendMessage("assistant", [
      { type: "text", text: "hello" },
    ]);
    // PersistedSession.appendMessage flushes to disk asynchronously
    // (fire-and-forget); wait for the write before re-reading the file.
    await new Promise((resolve) => setTimeout(resolve, 25));

    const summaries = await summarizeEhChats({
      chats: [chat({ sessionId: session.id })],
      sessionStore: store,
      sessionByCwd: {},
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.messageCount).toBe(2);
    expect(summaries[0]?.title).toBe("app");
  });

  it("summarizes chats without a session (messageCount omitted)", async () => {
    const store = new SessionStore({ dir: tmpDir });
    const summaries = await summarizeEhChats({
      chats: [chat({ id: "no-sess" })],
      sessionStore: store,
      sessionByCwd: {},
    });
    expect(summaries[0]?.id).toBe("no-sess");
    expect(summaries[0]?.messageCount).toBeUndefined();
  });

  it("touch / upsert / update / remove mutate the right row", () => {
    const chats = [chat({ id: "a" }), chat({ id: "b" })];
    const touched = touchEhChat(chats, "a");
    expect(touched.find((c) => c.id === "a")?.lastUsedAt).not.toBe(
      chats[0]?.lastUsedAt,
    );

    const upserted = upsertEhChatSessionId(chats, "b", "sess-b");
    expect(upserted.find((c) => c.id === "b")?.sessionId).toBe("sess-b");
    expect(upserted.find((c) => c.id === "a")?.sessionId).toBeUndefined();

    const updated = updateEhChatCwd(chats, "a", "/projects/new");
    const row = updated.find((c) => c.id === "a");
    expect(row?.cwd).toBe("/projects/new");
    expect(row?.title).toBe("new");
    expect(row?.sessionId).toBeUndefined();

    expect(removeEhChat(chats, "b").map((c) => c.id)).toEqual(["a"]);
  });

  it("enforces the chat capacity cap", () => {
    const full = Array.from({ length: MAX_ENVOY_HARNESS_CHATS }, (_, i) =>
      chat({ id: `chat-${i}` }),
    );
    expect(() => assertEhChatCapacity(full)).toThrow(/chat_limit/);
    expect(() => assertEhChatCapacity(full.slice(0, -1))).not.toThrow();
  });
});
