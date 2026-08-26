/**
 * Per-project Envoy Harness workspace session resolution.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import { SessionStore } from "@envoymesh/envoy-harness";

import {
  createEnvoyHarnessSessionStore,
  deleteEhChatTurnFromStore,
  ehMessagesToChatTurns,
  loadEhChatHistoryFromStore,
  mergeSessionMapping,
  normalizeEhWorkspaceCwd,
  resolveEhSessionIdForCwd,
} from "../src/envoy-harness-workspace.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "eh-workspace-test-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("envoy-harness-workspace", () => {
  it("normalizes cwd paths for stable config keys", () => {
    expect(normalizeEhWorkspaceCwd("/projects/app/")).toBe(
      normalizeEhWorkspaceCwd("/projects/app"),
    );
  });

  it("merges cwd → sessionId into config map", () => {
    const key = normalizeEhWorkspaceCwd("/projects/app");
    const next = mergeSessionMapping({ [key]: "old-id" }, "/projects/app", "new-id");
    expect(next[key]).toBe("new-id");
  });

  it("resolves session from config mapping", async () => {
    const store = new SessionStore({ dir: tmpDir });
    const created = await store.create({
      cwd: "/projects/app",
      startedAt: new Date().toISOString(),
      permissionMode: "workspace-write",
    });
    const key = normalizeEhWorkspaceCwd("/projects/app");
    const resolved = await resolveEhSessionIdForCwd({
      cwd: "/projects/app",
      sessionByCwd: { [key]: created.id },
      sessionStore: store,
    });
    expect(resolved.sessionId).toBe(created.id);
    expect(resolved.migratedFromDisk).toBe(false);
  });

  it("falls back to most recent session on disk for cwd", async () => {
    const store = new SessionStore({ dir: tmpDir });
    const older = await store.create({
      cwd: "/projects/other",
      startedAt: new Date().toISOString(),
      permissionMode: "workspace-write",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const newer = await store.create({
      cwd: "/projects/other",
      startedAt: new Date().toISOString(),
      permissionMode: "workspace-write",
    });

    const resolved = await resolveEhSessionIdForCwd({
      cwd: "/projects/other",
      sessionByCwd: {},
      sessionStore: store,
    });
    expect(resolved.sessionId).toBe(newer.id);
    expect(resolved.migratedFromDisk).toBe(true);
    expect(older.id).not.toBe(newer.id);
  });

  it("converts harness messages to chat turns", async () => {
    const store = createEnvoyHarnessSessionStore(tmpDir);
    const created = await store.create({
      cwd: "/tmp",
      startedAt: new Date().toISOString(),
      permissionMode: "workspace-write",
    });
    await created.appendMessage("user", [{ type: "text", text: "Hi" }]);
    await created.appendMessage("assistant", [{ type: "text", text: "Hello!" }]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    const history = await loadEhChatHistoryFromStore({
      sessionStore: store,
      sessionId: created.id,
      cwd: "/tmp",
    });
    expect(history.turns).toHaveLength(2);
    expect(history.turns[0]?.text).toBe("Hi");
    expect(history.turns[1]?.text).toBe("Hello!");

    const direct = ehMessagesToChatTurns(created.messages);
    expect(direct).toHaveLength(2);
  });

  it("deletes a user turn together with its assistant/tool exchange", async () => {
    const store = createEnvoyHarnessSessionStore(tmpDir);
    const created = await store.create({
      cwd: "/tmp",
      startedAt: new Date().toISOString(),
      permissionMode: "workspace-write",
    });
    created.appendMessage("user", [{ type: "text", text: "first" }]);
    created.appendMessage("assistant", [{ type: "text", text: "working" }]);
    created.appendMessage("tool", [{ type: "text", text: "tool result" }]);
    created.appendMessage("user", [{ type: "text", text: "second" }]);
    created.appendMessage("assistant", [{ type: "text", text: "kept" }]);
    await created.flush();

    const result = await deleteEhChatTurnFromStore({
      sessionStore: store,
      sessionId: created.id,
      cwd: "/tmp",
      turnId: "eh-msg-0",
    });
    expect(result.deleted).toBe(true);
    expect(result.history.turns.map((turn) => turn.text)).toEqual(["second", "kept"]);
    const reopened = await store.load(created.id);
    expect(reopened.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
  });
});
