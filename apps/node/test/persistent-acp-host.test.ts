/**
 * U6 — persistent in-process ACP host (multi-session chat + EHUI rails).
 *
 * Covers the new session lifecycle: create-on-start persists the session,
 * resume loads a persisted transcript, same-cwd reuse short-circuits, and
 * per-prompt abort cancels the in-flight turn through the backend.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import {
  createAgentSessionBackend,
  SessionStore,
  type Agent,
} from "@envoymesh/envoy-harness";
import {
  EnvoyHarnessPersistentAcpHost,
  type AcpPermissionBridge,
} from "../src/agent-runtime-envoy/persistent-acp-host.js";

function noopPermissionBridge(): AcpPermissionBridge {
  return {
    request: async () => "allow",
    clear: () => {},
  };
}

interface MockMessage {
  role: string;
  content: Array<{ type: "text"; text: string }>;
}

/**
 * A scripted Agent mock that records its transcript and can park the run
 * until `abort()` fires (for the cancel path). Mirrors the shape the
 * ACP backend drives: run / abort / getMessageCount / getSession /
 * tracer / assistantStreamSink / toolOutputSink.
 */
function createMockAgent(opts: {
  cwd: string;
  park?: boolean;
  initial?: MockMessage[];
  /** Real PersistedSession when the backend loads/resumes one. */
  session?: {
    messages: MockMessage[];
    appendMessage(
      role: string,
      content: Array<{ type: "text"; text: string }>,
    ): void;
  };
}): Agent {
  const messages: MockMessage[] = opts.session?.messages ?? [...(opts.initial ?? [])];
  let aborted = false;
  let releaseParked: (() => void) | undefined;

  const append = (role: string, text: string): void => {
    const block = { type: "text" as const, text };
    if (opts.session?.appendMessage) {
      opts.session.appendMessage(role, [block]);
    } else {
      messages.push({ role, content: [block] });
    }
  };

  const agent = {
    abort() {
      aborted = true;
      releaseParked?.();
    },
    getMessageCount() {
      return messages.length;
    },
    getSession() {
      return { metadata: { cwd: opts.cwd }, messages };
    },
    async run(prompt: string | ReadonlyArray<{ type: string }>) {
      const text =
        typeof prompt === "string"
          ? prompt
          : prompt
              .filter((b) => b.type === "text" && "text" in b)
              .map((b) => String((b as { text: string }).text))
              .join("\n");
      append("user", text);
      if (opts.park) {
        await new Promise<void>((resolve) => {
          releaseParked = () => {
            releaseParked = undefined;
            resolve();
          };
          if (aborted) releaseParked();
        });
      }
      append("assistant", `echo:${text}`);
      return {
        messages: [...messages],
        stopReason: aborted ? ("aborted" as const) : ("end_turn" as const),
        costUsd: 0,
        iterations: 1,
      };
    },
  };
  return agent as unknown as Agent;
}

let tmpDir: string;
let store: SessionStore;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "eh-persistent-host-"));
  store = new SessionStore({ dir: tmpDir });
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function buildBackend(opts?: { park?: boolean }) {
  return createAgentSessionBackend({
    defaultCwd: "/projects/app",
    sessionStore: store,
    createAgent: ({ sessionId, cwd, session }) =>
      createMockAgent({
        cwd: cwd ?? "/projects/app",
        park: opts?.park,
        session: session as
          | {
              messages: MockMessage[];
              appendMessage(
                role: string,
                content: Array<{ type: "text"; text: string }>,
              ): void;
            }
          | undefined,
      }),
  });
}

describe("EnvoyHarnessPersistentAcpHost", () => {
  it("start creates a persisted session and prompt returns assistant text", async () => {
    const host = new EnvoyHarnessPersistentAcpHost();
    try {
      const started = await host.start({
        cwd: "/projects/app",
        backend: buildBackend(),
        permissionBridge: noopPermissionBridge(),
      });
      expect(started.resumed).toBe(false);
      expect(started.sessionId).toMatch(/^[0-9a-f-]{36}$/);

      // The session is persisted to disk (multi-session resume depends
      // on this), not only held in memory.
      const summaries = await store.listSummaries();
      expect(summaries.some((s) => s.id === started.sessionId)).toBe(true);

      const result = await host.prompt("hello");
      expect(result.stopReason).toBe("end_turn");
      expect(result.text).toContain("echo:hello");
    } finally {
      host.close();
    }
  });

  it("resumes a persisted session and keeps its transcript", async () => {
    const backend = buildBackend();
    const first = new EnvoyHarnessPersistentAcpHost();
    let sessionId: string;
    try {
      const started = await first.start({
        cwd: "/projects/app",
        backend,
        permissionBridge: noopPermissionBridge(),
      });
      sessionId = started.sessionId;
      await first.prompt("first turn");
    } finally {
      first.close();
    }

    const second = new EnvoyHarnessPersistentAcpHost();
    try {
      const resumed = await second.start({
        cwd: "/projects/app",
        backend,
        permissionBridge: noopPermissionBridge(),
        resumeSessionId: sessionId,
      });
      expect(resumed.resumed).toBe(true);
      expect(resumed.sessionId).toBe(sessionId);

      const result = await second.prompt("second turn");
      expect(result.stopReason).toBe("end_turn");
      expect(result.text).toContain("echo:second turn");

      // Both turns persisted: 4 messages (user/assistant x2). A failed
      // resume would have started a fresh session with only 2.
      const summary = (await store.listSummaries()).find(
        (s) => s.id === sessionId,
      );
      expect(summary?.messageCount).toBe(4);
    } finally {
      second.close();
    }
  });

  it("reuses the in-process session for the same cwd (no duplicate host)", async () => {
    const host = new EnvoyHarnessPersistentAcpHost();
    try {
      const backend = buildBackend();
      const a = await host.start({
        cwd: "/projects/app",
        backend,
        permissionBridge: noopPermissionBridge(),
      });
      const b = await host.start({
        cwd: "/projects/app",
        backend,
        permissionBridge: noopPermissionBridge(),
      });
      expect(b.sessionId).toBe(a.sessionId);
      expect(b.resumed).toBe(true);

      // A different (existing) resume id forces a reload — the host
      // switches to that persisted session for another chat workspace.
      const otherSession = await store.create({
        cwd: "/projects/other",
        startedAt: new Date().toISOString(),
        permissionMode: "workspace-write",
      });
      const other = await host.start({
        cwd: "/projects/app",
        backend,
        permissionBridge: noopPermissionBridge(),
        resumeSessionId: otherSession.id,
      });
      expect(other.resumed).toBe(true);
      expect(other.sessionId).toBe(otherSession.id);
    } finally {
      host.close();
    }
  });

  it("abort cancels the in-flight prompt through the backend", async () => {
    const host = new EnvoyHarnessPersistentAcpHost();
    try {
      await host.start({
        cwd: "/projects/app",
        backend: buildBackend({ park: true }),
        permissionBridge: noopPermissionBridge(),
      });
      const ac = new AbortController();
      const promise = host.prompt("slow turn", { signal: ac.signal });
      setTimeout(() => ac.abort(), 10);
      const result = await promise;
      // The parked run was released by agent.abort() via the cancel RPC;
      // the backend surfaces the stopped reason instead of hanging.
      expect(["aborted", "cancelled"]).toContain(result.stopReason);
    } finally {
      host.close();
    }
  });
});
