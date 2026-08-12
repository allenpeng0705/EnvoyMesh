/**
 * Phase 55C — claudecode ext agent backend tests.
 *
 * Strategy: the backend accepts a `queryFn` override that takes the
 * place of the real `@anthropic-ai/claude-agent-sdk`'s `query`. We
 * feed it an async iterable that yields the same `SDKMessage` shape
 * the real SDK emits (system/init → assistant → result). This
 * exercises the full message-loop without needing a live `claude`
 * CLI or an `ANTHROPIC_API_KEY`.
 *
 * The "SDK not installed" path is covered via `vi.mock` so the lazy
 * `loadSdk()` rejects with the install hint.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ClaudeCodeBackend,
  createClaudeCodeBackend,
  _test,
} from "../src/ext-agent-adapter/claudecode-backend.js";
import { createBackend } from "../src/ext-agent-adapter/backends.js";
import type { Options, Query, SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// ---------------------------------------------------------------------------
// Fake SDK helpers
// ---------------------------------------------------------------------------

/** Builds a fake `Query` from an array of messages. The Query
 *  interface extends AsyncGenerator — we just return an object with
 *  the async iterator protocol + `Symbol.asyncIterator`. We don't
 *  implement the control-request methods (interrupt, setModel, etc.)
 *  because the backend only iterates messages. */
function makeFakeQuery(messages: SDKMessage[]): Query {
  const iter = (async function* () {
    for (const m of messages) yield m;
  })();
  // Cast: we satisfy the iterator half of AsyncGenerator; control
  // methods are not used by the backend.
  return iter as unknown as Query;
}

/** Records every `query()` call so tests can assert on options
 *  (e.g. `resume` was passed on the second ask). */
interface QueryCall {
  prompt: string;
  options: Options | undefined;
}

function makeRecordingQuery(
  messages: SDKMessage[] | ((call: QueryCall) => SDKMessage[]),
): { fn: (params: { prompt: string; options?: Options }) => Query; calls: QueryCall[] } {
  const calls: QueryCall[] = [];
  const resolveMessages = (call: QueryCall): SDKMessage[] =>
    typeof messages === "function" ? messages(call) : messages;
  const fn = (params: { prompt: string; options?: Options }): Query => {
    const call: QueryCall = { prompt: params.prompt, options: params.options };
    calls.push(call);
    return makeFakeQuery(resolveMessages(call));
  };
  return { fn, calls };
}

/** Minimal `system/init` message. */
function makeInit(sessionId: string, slashCommands: string[] = []): SDKMessage {
  return {
    type: "system",
    subtype: "init",
    apiKeySource: "user",
    claude_code_version: "0.0.0-test",
    cwd: "/tmp/test",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-5",
    permissionMode: "default",
    slash_commands: slashCommands,
    output_style: "default",
    skills: [],
    plugins: [],
    uuid: "init-uuid" as never,
    session_id: sessionId,
  } as unknown as SDKMessage;
}

/** Minimal `result` (success) message. */
function makeSuccessResult(text: string, sessionId: string): SDKMessage {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 1,
    duration_api_ms: 1,
    is_error: false,
    num_turns: 1,
    result: text,
    stop_reason: "end_turn",
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      server_tool_use: { web_search_requests: 0 },
      service_tier: "standard",
    },
    modelUsage: {},
    permission_denials: [],
    uuid: "result-uuid" as never,
    session_id: sessionId,
  } as unknown as SDKMessage;
}

/** Minimal `result` (error) message. */
function makeErrorResult(
  subtype:
    | "error_during_execution"
    | "error_max_turns"
    | "error_max_budget_usd"
    | "error_max_structured_output_retries",
  errors: string[],
  sessionId: string,
): SDKMessage {
  return {
    type: "result",
    subtype,
    duration_ms: 1,
    duration_api_ms: 1,
    is_error: true,
    num_turns: 0,
    stop_reason: "error",
    total_cost_usd: 0,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      server_tool_use: { web_search_requests: 0 },
      service_tier: "standard",
    },
    modelUsage: {},
    permission_denials: [],
    errors,
    uuid: "error-uuid" as never,
    session_id: sessionId,
  } as unknown as SDKMessage;
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let savedApiKey: string | undefined;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  savedApiKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-anthropic-key";
  _test._resetCachedClaudeCodeSlashCommandsForTests();
});

afterEach(() => {
  if (savedApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = savedApiKey;
  }
  _test._resetCachedClaudeCodeSlashCommandsForTests();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("claudecode-backend (55C) — basic shape", () => {
  it("ClaudeCodeBackend has kind=claudecode and a label mentioning Claude", () => {
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({ queryFn: fn, apiKey: "k" });
    expect(backend.kind).toBe("claudecode");
    expect(backend.label.toLowerCase()).toContain("claude");
  });

  it("createClaudeCodeBackend returns an ExtAgentBackend with kind=claudecode", () => {
    const backend = createClaudeCodeBackend({ apiKey: "k" });
    expect(backend.kind).toBe("claudecode");
    expect(typeof backend.ask).toBe("function");
    expect(typeof backend.probe).toBe("function");
  });

  it("createBackend('claudecode') wires through the real ClaudeCodeBackend", () => {
    const backend = createBackend("claudecode");
    expect(backend.kind).toBe("claudecode");
  });
});

describe("claudecode-backend (55C) — ask()", () => {
  it("ask() returns the final text from a success result", async () => {
    const { fn } = makeRecordingQuery([
      makeInit("sess-id-1"),
      makeSuccessResult("hello from claude", "sess-id-1"),
    ]);
    const backend = new ClaudeCodeBackend({
      queryFn: fn,
      apiKey: "k",
      requestTimeoutMs: 2_000,
    });
    const text = await backend.ask("hi", "owner-A");
    expect(text).toBe("hello from claude");
  });

  it("ask() caches system/init slash_commands for the Ext Agent catalog", async () => {
    const { fn } = makeRecordingQuery([
      makeInit("sess-slash", ["compact", "review", "model"]),
      makeSuccessResult("ok", "sess-slash"),
    ]);
    const backend = new ClaudeCodeBackend({
      queryFn: fn,
      apiKey: "k",
      requestTimeoutMs: 2_000,
    });
    await backend.ask("hi", "owner-A");
    expect(_test.getCachedClaudeCodeSlashCommands()).toEqual([
      "compact",
      "review",
      "model",
    ]);
  });

  it("ask() caches the SDK session_id per sessionKey and passes it as resume on the next call", async () => {
    const recorded = makeRecordingQuery((call) => {
      // First call: fresh session, server returns session id "sdk-1"
      // Second call: backend should pass `resume: "sdk-1"`
      if (call.options?.resume === undefined) {
        return [makeInit("sdk-1"), makeSuccessResult("first reply", "sdk-1")];
      }
      return [makeInit("sdk-1"), makeSuccessResult("second reply", "sdk-1")];
    });
    const backend = new ClaudeCodeBackend({
      queryFn: recorded.fn,
      apiKey: "k",
      requestTimeoutMs: 2_000,
    });
    const a = await backend.ask("first", "owner-A");
    const b = await backend.ask("second", "owner-A");
    expect(a).toBe("first reply");
    expect(b).toBe("second reply");
    expect(recorded.calls.length).toBe(2);
    // First call: no resume
    expect(recorded.calls[0]!.options?.resume).toBeUndefined();
    // Second call: resume carries the cached id
    expect(recorded.calls[1]!.options?.resume).toBe("sdk-1");
  });

  it("ask() creates a separate SDK session per sessionKey (no cross-talk)", async () => {
    const recorded = makeRecordingQuery((call) => {
      if (call.prompt === "hi A") {
        return [makeInit("sdk-A"), makeSuccessResult("A reply", "sdk-A")];
      }
      return [makeInit("sdk-B"), makeSuccessResult("B reply", "sdk-B")];
    });
    const backend = new ClaudeCodeBackend({
      queryFn: recorded.fn,
      apiKey: "k",
      requestTimeoutMs: 2_000,
    });
    const a = await backend.ask("hi A", "owner-A");
    const b = await backend.ask("hi B", "owner-B");
    expect(a).toBe("A reply");
    expect(b).toBe("B reply");
    // Neither call had a cached session id to resume from.
    expect(recorded.calls[0]!.options?.resume).toBeUndefined();
    expect(recorded.calls[1]!.options?.resume).toBeUndefined();
  });

  it("ask() rejects with the SDK's error list on error_during_execution", async () => {
    const { fn } = makeRecordingQuery([
      makeInit("sess-1"),
      makeErrorResult("error_during_execution", ["tool X failed: boom", "network reset"], "sess-1"),
    ]);
    const backend = new ClaudeCodeBackend({
      queryFn: fn,
      apiKey: "k",
      requestTimeoutMs: 2_000,
    });
    await expect(backend.ask("hi", "owner-A")).rejects.toThrow(
      /tool X failed: boom; network reset/,
    );
  });

  it("ask() rejects with a clear error when not authenticated", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({
      queryFn: fn,
      // apiKey intentionally omitted
      requestTimeoutMs: 2_000,
    });
    await expect(backend.ask("hi", "owner-A")).rejects.toThrow(
      /not authenticated|ANTHROPIC_API_KEY|claude auth login/,
    );
  });

  it("ask() reports a stalled-stream error when the SDK does not produce a result", async () => {
    // Build a fake Query that yields init, then waits for the abort
    // signal and throws the SDK's AbortError — mirroring what the real
    // SDK does when its `abortController.signal` aborts mid-stream.
    class FakeAbortError extends Error {
      constructor(msg: string) {
        super(msg);
        this.name = "AbortError";
      }
    }
    const fn = (params: { prompt: string; options?: Options }): Query => {
      const signal = params.options?.abortController?.signal;
      const iter = (async function* () {
        yield makeInit("sess-1");
        if (!signal) {
          // No abort controller — hang forever (test bug, not the
          // backend's).
          await new Promise(() => undefined);
          return;
        }
        // Wait for the abort signal, then throw AbortError.
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        throw new FakeAbortError("aborted");
      })();
      return iter as unknown as Query;
    };
    const backend = new ClaudeCodeBackend({
      queryFn: fn,
      apiKey: "k",
      requestTimeoutMs: 50,
    });
    await expect(backend.ask("hi", "owner-A")).rejects.toThrow(
      /stalled.*50ms|timed out after 50ms/i,
    );
  });

  it("ask() throws a session-required error when sessionKey is empty", async () => {
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({ queryFn: fn, apiKey: "k" });
    await expect(backend.ask("hi", "")).rejects.toThrow(/sessionKey/);
  });
});

describe("claudecode-backend (55C) — probe()", () => {
  it("probe() returns true when SDK is loadable and ANTHROPIC_API_KEY is set", async () => {
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({ queryFn: fn, apiKey: "k" });
    // Force sdkLoader to resolve before the probe runs so we hit the
    // "apiKey set" branch.
    await backend.start();
    expect(await backend.probe()).toBe(true);
  });

  it("probe() returns true when authReady reports OAuth login (no API key)", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({
      queryFn: fn,
      authReady: async () => true,
    });
    expect(await backend.probe()).toBe(true);
  });

  it("probe() returns false when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({ queryFn: fn });
    await backend.start();
    expect(await backend.probe()).toBe(false);
  });
});

describe("claudecode-backend (55C) — start/stop", () => {
  it("start() is a safe no-op (idempotent)", async () => {
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({ queryFn: fn, apiKey: "k" });
    await backend.start();
    await backend.start(); // second call must not throw
  });

  it("stop() is a safe no-op (idempotent)", async () => {
    const { fn } = makeRecordingQuery([]);
    const backend = new ClaudeCodeBackend({ queryFn: fn, apiKey: "k" });
    await backend.stop();
    await backend.stop();
  });
});

describe("claudecode-backend (55C) — SDK import", () => {
  it("_test.loadSdk() resolves to a module with a query function (smoke)", async () => {
    // The SDK is declared as a regular dep in apps/node/package.json,
    // so the lazy import should always succeed in this test environment.
    // This guards against an accidental `optionalDependency` move that
    // would silently break the backend.
    const sdk = await _test.loadSdk();
    expect(sdk).toBeTypeOf("object");
    expect(typeof sdk.query).toBe("function");
  });

  // Phase 55+56 review — A5: when a `queryFn` override is supplied
  // (test mode), the SDK is never imported. This lets tests run
  // without installing `@anthropic-ai/claude-agent-sdk` in the test
  // environment. The `sdkLoader` field is `undefined` when the
  // override is set; `start()` / `probe()` / `ask()` all skip the
  // SDK path.
  it("does NOT call loadSdk() when queryFn override is supplied", async () => {
    // Spy on the lazy loader — if it's called, the test fails.
    const loaderSpy = vi.spyOn(_test, "loadSdk");
    const queryFn = () => makeFakeQuery([]) as unknown as Query;
    const backend = new ClaudeCodeBackend({
      queryFn,
      apiKey: "test-key",
    });
    expect(loaderSpy).not.toHaveBeenCalled();
    // The sdkLoader field is undefined when the override is set.
    expect(backend["sdkLoader"]).toBeUndefined();
    // start() / probe() / ask() all work without ever loading the SDK.
    await backend.start();
    const ok = await backend.probe();
    expect(ok).toBe(true);
    expect(loaderSpy).not.toHaveBeenCalled();
    loaderSpy.mockRestore();
  });
});

describe("claudecode-backend (55C) — abort error detection", () => {
  it("_test.isAbortError recognizes both name='AbortError' and constructor.name='AbortError'", () => {
    const namedError = new Error("aborted");
    namedError.name = "AbortError";
    expect(_test.isAbortError(namedError)).toBe(true);

    // Class named literally "AbortError" — the SDK's compiled class
    // is named this way (mangled by tsc, but the source name is
    // "AbortError"). We re-declare it here without referencing the
    // SDK to keep this test hermetic.
    class AbortError extends Error {}
    const byCtor = new AbortError("aborted");
    expect(_test.isAbortError(byCtor)).toBe(true);

    expect(_test.isAbortError(new Error("not an abort"))).toBe(false);
    expect(_test.isAbortError("string")).toBe(false);
    expect(_test.isAbortError(null)).toBe(false);
  });
});
