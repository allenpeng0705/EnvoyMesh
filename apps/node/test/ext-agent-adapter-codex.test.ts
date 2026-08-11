/**
 * Phase 55B — codex ext agent backend tests.
 *
 * Strategy: spawn real `node` processes as fake "codex app-server"
 * binaries that speak NDJSON over stdio. This exercises the actual
 * JSON-RPC framing, the `turn/completed` notification, and the
 * `sessionKey → threadId` cache without needing the real codex CLI
 * (which requires `OPENAI_API_KEY`).
 *
 * Each test writes a tiny node script to a temp dir; the script
 * replies deterministically to the JSON-RPC methods the backend
 * uses (`initialize`, `thread/start`, `turn/start`, `thread/list`).
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexBackend, createCodexBackend } from "../src/ext-agent-adapter/codex-backend.js";
import { InstallMissingError } from "../src/ext-agent-adapter/daemon-supervisor.js";

// ---------------------------------------------------------------------------
// Fake "codex app-server" scripts
// ---------------------------------------------------------------------------

/**
 * Reads JSON-RPC over stdin (one message per line), responds to
 * `initialize` / `thread/start` / `turn/start` / `thread/list`, and
 * emits a `turn/completed` notification for each `turn/start`.
 *
 * Used for: ask happy path (reuses thread, returns assistant text),
 * probe() true on healthy thread/list.
 */
const SCRIPT_HAPPY = `#!/usr/bin/env node
let nextThreadSeq = 1;
let nextTurnSeq = 1;
let initHandled = false;
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === undefined) continue; // ignore notifications
    handleRequest(msg);
  }
});
function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}
function notify(method, params) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\\n");
}
function handleRequest(msg) {
  switch (msg.method) {
    case "initialize":
      initHandled = true;
      reply(msg.id, { serverInfo: { name: "fake-codex", version: "0.0.0" } });
      return;
    case "thread/start":
      if (!initHandled) {
        reply(msg.id, { error: { code: -32000, message: "not initialized" } });
        return;
      }
      reply(msg.id, { thread: { id: "thread-" + nextThreadSeq }, model: "fake" });
      nextThreadSeq++;
      return;
    case "turn/start": {
      if (!initHandled) {
        reply(msg.id, { error: { code: -32000, message: "not initialized" } });
        return;
      }
      const turnId = "turn-" + nextTurnSeq;
      nextTurnSeq++;
      reply(msg.id, { turn: { id: turnId, threadId: msg.params && msg.params.threadId, status: "inProgress" } });
      // Emit turn/completed asynchronously (mimics the real codex server).
      setImmediate(() => {
        notify("turn/completed", {
          threadId: msg.params && msg.params.threadId,
          turnId,
          turn: {
            id: turnId,
            status: "completed",
            items: [
              { id: "msg-" + turnId, type: "agentMessage", title: null, text: "hello from codex (thread=" + (msg.params && msg.params.threadId) + ")" },
            ],
          },
        });
      });
      return;
    }
    case "thread/list":
      reply(msg.id, { data: [], nextCursor: null });
      return;
    default:
      reply(msg.id, { error: { code: -32601, message: "method not found: " + msg.method } });
  }
}
`;

/** Replies to `thread/list` with an error — used to verify probe() returns false. */
const SCRIPT_BAD_PROBE = `#!/usr/bin/env node
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id === undefined) continue;
    if (msg.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { serverInfo: { name: "fake" } } }) + "\\n");
    } else {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "intentional failure" } }) + "\\n");
    }
  }
});
`;

/** Exits 7 immediately on spawn — used for the "process won't start" test. */
const SCRIPT_EXIT = `process.exit(7);`;

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmpDir: string;
const scripts: Record<string, string> = {};

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "codex-backend-"));
  const files: Record<string, string> = {
    "happy.js": SCRIPT_HAPPY,
    "bad-probe.js": SCRIPT_BAD_PROBE,
    "exit.js": SCRIPT_EXIT,
  };
  for (const [name, src] of Object.entries(files)) {
    const path = join(tmpDir, name);
    await writeFile(path, src, "utf8");
    scripts[name] = path;
  }
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

interface MakeOpts {
  command?: string;
  args?: string[];
  apiKey?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  healthcheckTimeoutMs?: number;
  /** If true, the fake server will reply with turn/completed. */
  withHappyPath?: boolean;
}

function makeBackend(opts: MakeOpts = {}): CodexBackend {
  return new CodexBackend({
    name: "codex",
    command: opts.command ?? process.execPath,
    args: opts.args ?? [scripts["happy.js"]!],
    apiKey: opts.apiKey ?? "test-key",
    requestTimeoutMs: opts.requestTimeoutMs ?? 5_000,
    startupTimeoutMs: opts.startupTimeoutMs ?? 5_000,
    healthcheckTimeoutMs: opts.healthcheckTimeoutMs ?? 1_000,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("codex-backend (55B) — basic lifecycle", () => {
  let backend: CodexBackend | null = null;
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(async () => {
    if (backend) {
      await backend.stop();
      backend = null;
    }
  });

  it("createCodexBackend returns a backend with kind=codex", () => {
    backend = makeBackend();
    expect(backend.kind).toBe("codex");
    expect(backend.label.toLowerCase()).toContain("codex");
  });

  it("ask() initializes, creates a thread, sends turn/start, returns assistant text", async () => {
    backend = makeBackend();
    const text = await backend.ask("hello codex", "sess-1");
    expect(text).toContain("hello from codex");
    expect(text).toContain("thread-");
  }, 10_000);

  it("ask() reuses the same threadId for the same sessionKey", async () => {
    backend = makeBackend();

    const a = await backend.ask("first", "sess-A");
    const b = await backend.ask("second", "sess-A");
    // Same sessionKey → same threadId → the fake server's counter
    // returns thread-1 in the assistant text both times.
    expect(a).toContain("thread-1");
    expect(b).toContain("thread-1");

    const c = await backend.ask("third", "sess-B");
    // Different sessionKey → fresh threadId (thread-2).
    expect(c).toContain("thread-2");
  }, 10_000);

  it("probe() returns true on a healthy thread/list response", async () => {
    backend = makeBackend();
    // Force startup so the supervisor spawns the fake binary.
    await backend.start();
    const ok = await backend.probe();
    expect(ok).toBe(true);
  }, 10_000);

  it("probe() returns false when thread/list returns an error", async () => {
    backend = makeBackend({ args: [scripts["bad-probe.js"]!] });
    await backend.start();
    const ok = await backend.probe();
    expect(ok).toBe(false);
    // 20s budget: `start()` waits for the supervisor's
    // `startupTimeoutMs` (5s) when the healthcheck never passes, and
    // then `probe()` waits up to `healthcheckTimeoutMs` (1s) for the
    // thread/list roundtrip. The 100ms stability grace in the
    // supervisor can push the first run to ~6s+ on slow CI.
  }, 20_000);

  it("start() surfaces InstallMissingError when the codex binary is not on PATH", async () => {
    backend = new CodexBackend({
      name: "codex",
      command: "codex-this-binary-does-not-exist-xyz-9876",
      args: [],
      apiKey: "test-key",
      startupTimeoutMs: 500,
      healthcheckTimeoutMs: 200,
    });
    await expect(backend.start()).rejects.toBeInstanceOf(InstallMissingError);
    // Cleanup — install-missing already short-circuited; stop() is
    // safe but no-op.
    await backend.stop();
  }, 10_000);

  it("start() surfaces install-missing event before rejecting", async () => {
    backend = new CodexBackend({
      name: "codex",
      command: "codex-this-binary-does-not-exist-xyz-9876",
      args: [],
      apiKey: "test-key",
      startupTimeoutMs: 500,
      healthcheckTimeoutMs: 200,
    });
    const events: string[] = [];
    backend["supervisor"].on("install-missing", (info: { reason: string }) => {
      events.push(`install-missing:${info.reason}`);
    });
    await backend.start().catch(() => undefined);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatch(/^install-missing:(spawn-enoent|pre-check)$/);
    await backend.stop();
  }, 10_000);

  it("ask() rejects when supervisor crashes mid-ask", async () => {
    // Use a script that exits right after the initialize handshake,
    // so the supervisor crashes between init and the first turn/start.
    const SCRIPT_CRASH = `#!/usr/bin/env node
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, nl);
    buffer = buffer.slice(nl + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && msg.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { serverInfo: { name: "fake" } } }) + "\\n");
    }
  }
  // Crash right after init.
  setTimeout(() => process.exit(42), 50);
});
`;
    const crashPath = join(tmpDir, "crash-after-init.js");
    await writeFile(crashPath, SCRIPT_CRASH, "utf8");
    backend = makeBackend({ args: [crashPath] });
    const askPromise = backend.ask("hello", "sess-X");
    // After the script crashes, the supervisor's child is dead, so
    // any subsequent sendStdin() returns false. The error message
    // carries through to the ask() promise.
    await expect(askPromise).rejects.toThrow(/stdin|gone|aborted|crash/i);
  }, 10_000);

  it("stop() is idempotent", async () => {
    backend = makeBackend();
    await backend.start();
    await backend.stop();
    await backend.stop(); // second call must be a no-op
    expect(backend["supervisor"].isRunning()).toBe(false);
  });

  // Phase 55+56 review — A3: stop() must clear per-process state
  // (threadIds, threadIdToSessionKey, initialized, nextRpcId) so a
  // future start() on the same backend instance begins from a
  // clean slate. Without this, a re-used backend would carry stale
  // thread ids pointing at a long-gone codex process.
  it("stop() clears per-process state for a clean re-start", async () => {
    backend = makeBackend();
    await backend.start();
    // Force some state to be populated: send a thread/start to
    // populate threadIds.
    await backend.ask("hello", "sess-A");
    // The thread id should be cached for "sess-A".
    const threadIdsBefore = backend["threadIds"] as Map<string, string>;
    expect(threadIdsBefore.size).toBeGreaterThan(0);
    expect(backend["initialized"]).toBe(true);
    // stop() should clear everything.
    await backend.stop();
    expect((backend["threadIds"] as Map<string, string>).size).toBe(0);
    expect((backend["threadIdToSessionKey"] as Map<string, string>).size).toBe(0);
    expect(backend["initialized"]).toBe(false);
    expect(backend["nextRpcId"]).toBe(1);
  }, 10_000);
});

describe("codex-backend (55B) — install-missing event handling", () => {
  // Phase 55+56 review — B2: macOS-style async ENOENT. The supervisor
  // emits "install-missing" on its EventEmitter when the async
  // `error` event fires with `code === "ENOENT"`. The codex backend
  // subscribes to that event and calls `failAllPending` so in-flight
  // requests are rejected rather than hanging. This test uses a fake
  // supervisor (the codex backend's `supervisor` option is overridable
  // for tests per the JSDoc) to emit the event on demand and verify
  // the codex backend's behavior.
  it("emits install-missing from the supervisor → codex backend listener fires (no throw)", async () => {
    const { EventEmitter } = await import("node:events");
    const fake = new EventEmitter() as unknown as {
      // Fake supervisor — only the methods the codex backend calls.
      start: () => Promise<void>;
      stop: () => Promise<void>;
      sendStdin: (chunk: string) => boolean;
      getChildProcess: () => null;
      on: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };
    fake.start = async () => {};
    fake.stop = async () => {};
    fake.sendStdin = () => false;
    fake.getChildProcess = () => null;
    // The fake is also an EventEmitter — `on` is inherited.

    const backend = new CodexBackend({
      apiKey: "test-key",
      requestTimeoutMs: 5_000,
      supervisor: fake as never,
    });

    // Emit the install-missing event the codex backend listens for.
    // The codex backend's listener calls failAllPending (which is
    // a no-op when no requests are pending). The test pins: the
    // emit doesn't throw, and the backend survives the event.
    expect(() => {
      (fake as unknown as EventEmitter).emit("install-missing", {
        command: "codex",
        reason: "spawn-enoent",
      });
    }).not.toThrow();
    // The backend should still respond to stop() cleanly.
    await backend.stop();
  });

  it("failAllPending rejects pending requests with a clear error", async () => {
    // Direct unit test of the failAllPending path. We don't need a
    // full supervisor — just construct a backend, populate the
    // pending maps, then call failAllPending directly via a
    // synthetic install-missing event.
    const { EventEmitter } = await import("node:events");
    const fake = new EventEmitter() as unknown as {
      start: () => Promise<void>;
      stop: () => Promise<void>;
      sendStdin: () => boolean;
      getChildProcess: () => null;
      on: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };
    fake.start = async () => {};
    fake.stop = async () => {};
    fake.sendStdin = () => false;
    fake.getChildProcess = () => null;

    const backend = new CodexBackend({
      apiKey: "test-key",
      requestTimeoutMs: 5_000,
      supervisor: fake as never,
    });

    // Manually populate a pending completion. We use the private
    // pendingCompletions map directly.
    let resolved = false;
    let rejected: Error | null = null;
    const completionPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error("test-timeout"));
        }
      }, 5_000);
      timer.unref?.();
      (backend as never as {
        pendingCompletions: Map<string, { resolve: (v: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; turnId: string; threadId: string; sessionKey: string }>;
      }).pendingCompletions.set("sess-A", {
        sessionKey: "sess-A",
        threadId: "thread-A",
        turnId: "turn-A",
        resolve: (v: string) => {
          resolved = true;
          resolve(v);
        },
        reject: (e: Error) => {
          rejected = e;
          reject(e);
        },
        timer,
      });
    });

    // Emit install-missing — the codex backend's listener should
    // call failAllPending, which rejects the pending completion.
    (fake as unknown as EventEmitter).emit("install-missing", {
      command: "codex",
      reason: "spawn-enoent",
    });
    await expect(completionPromise).rejects.toThrow(
      /binary missing \(install-missing event\)/,
    );
    expect(rejected).not.toBeNull();
    await backend.stop();
  });
});

describe("codex-backend (55B) — integration with createBackend()", () => {
  it("createBackend('codex') returns a CodexBackend (the manager path)", async () => {
    const { createBackend } = await import(
      "../src/ext-agent-adapter/backends.js"
    );
    const b = createBackend("codex");
    expect(b.kind).toBe("codex");
    await b.stop();
  });
});
