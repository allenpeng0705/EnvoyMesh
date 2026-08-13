/**
 * Phase 56A — `CursorAgentBackend` tests.
 *
 * Strategy: spawn a real `node` subprocess as the fake `cursor-agent`
 * CLI. The script can be configured to emit JSON (the happy path),
 * plain text (older versions that ignore --output json), or fail
 * with non-zero exit (parseOutput re-throws). Install-detection
 * tests inject the `binaryOnPath` option to simulate the missing
 * binary case.
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CursorAgentBackend,
  createCursorAgentBackend,
} from "../src/ext-agent-adapter/cursor-agent-backend.js";
import { InstallMissingError } from "../src/ext-agent-adapter/daemon-supervisor.js";

// ---------------------------------------------------------------------------
// Fake "cursor-agent" scripts
// ---------------------------------------------------------------------------

/** Emits the canonical JSON shape `{ result, session_id }`. */
const SCRIPT_HAPPY_JSON = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  result: "hello from cursor",
  session_id: "sess-123",
}) + "\\n");
`;

/** Emits plain text (older versions that ignore `--output json`). */
const SCRIPT_PLAIN_TEXT = `#!/usr/bin/env node
process.stdout.write("plain text reply from cursor\\n");
`;

/** Emits JSON with a different field name (`text` instead of `result`). */
const SCRIPT_TEXT_FIELD = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  text: "reply in text field",
  session_id: "sess-456",
}) + "\\n");
`;

/** Emits malformed JSON (starts with `{` but not parseable). */
const SCRIPT_BAD_JSON = `#!/usr/bin/env node
process.stdout.write("{ this is not valid json }");
`;

/** Exits non-zero. */
const SCRIPT_FAIL = `#!/usr/bin/env node
process.stderr.write("model overloaded"); process.exit(2);
`;

/** Sleeps (used to test timeout). */
const SCRIPT_SLEEP = `#!/usr/bin/env node
setTimeout(() => process.stdout.write("too late"), 5000);
`;

/** Captures argv and emits it (so we can assert the flag set). */
const SCRIPT_CAPTURE_ARGV = `#!/usr/bin/env node
process.stdout.write(JSON.stringify(process.argv.slice(2)));
`;

async function fakeCursorScript(body: string): Promise<{ command: string; args: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), "cursor-fake-"));
  const scriptPath = join(dir, "fake-cursor-agent.mjs");
  await writeFile(scriptPath, body, { mode: 0o755 });
  return { command: process.execPath, args: [scriptPath] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CursorAgentBackend", () => {
  describe("shape", () => {
    it("has the expected kind + label", () => {
      const backend = new CursorAgentBackend({
        command: "cursor-agent",
        binaryOnPath: async () => true,
      });
      expect(backend.kind).toBe("cursor");
      expect(backend.label).toBe("Cursor CLI");
    });

    it("createCursorAgentBackend() returns an ExtAgentBackend", () => {
      const backend = createCursorAgentBackend({
        command: "cursor-agent",
        binaryOnPath: async () => true,
      });
      expect(backend.kind).toBe("cursor");
      expect(typeof backend.ask).toBe("function");
      expect(typeof backend.probe).toBe("function");
    });
  });

  describe("ask()", () => {
    it("parses JSON `{ result, session_id }` shape and returns `result`", async () => {
      const { command, args } = await fakeCursorScript(SCRIPT_HAPPY_JSON);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("hello from cursor");
    });

    it("falls back to plain text when stdout is not JSON", async () => {
      const { command, args } = await fakeCursorScript(SCRIPT_PLAIN_TEXT);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("plain text reply from cursor");
    });

    it("accepts JSON with `text` field instead of `result`", async () => {
      const { command, args } = await fakeCursorScript(SCRIPT_TEXT_FIELD);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("reply in text field");
    });

    it("falls back to raw text when JSON is malformed", async () => {
      const { command, args } = await fakeCursorScript(SCRIPT_BAD_JSON);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("{ this is not valid json }");
    });

    it("rejects with non-zero-exit error when CLI exits non-zero", async () => {
      // Regression guard: previously a non-zero exit with an "error
      // text" on stdout would be returned as a successful answer
      // (parseOutput would happily return the stderr-derived text).
      // The base class now rejects with the exit code + stderr +
      // install hint so the user can self-diagnose.
      const { command, args } = await fakeCursorScript(SCRIPT_FAIL);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toThrow(
        /cursor ask\(\): non-zero exit \(code=2, stderr=model overloaded\).*Install the Cursor CLI/s,
      );
    });

    it("rejects with InstallMissingError when binary is not on PATH (pre-check)", async () => {
      const backend = new CursorAgentBackend({
        command: "cursor-agent",
        binaryOnPath: async () => false,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toBeInstanceOf(
        InstallMissingError,
      );
    });

    it("rejects with InstallMissingError when spawn() raises ENOENT (async)", async () => {
      // pre-check returns true but spawn() fires the error event.
      const backend = new CursorAgentBackend({
        command: "definitely-not-installed-cursor",
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toBeInstanceOf(
        InstallMissingError,
      );
    });

    it("rejects with timeout error when CLI hangs", async () => {
      const { command, args } = await fakeCursorScript(SCRIPT_SLEEP);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
        requestTimeoutMs: 200,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toThrow(
        /timed out after 200ms/,
      );
    }, 5_000);

    it("returns empty string for empty prompt", async () => {
      const backend = new CursorAgentBackend({
        command: "should-not-be-spawned",
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("  \n  ", "session-A");
      expect(out).toBe("");
    });

    it("rejects when sessionKey is empty", async () => {
      const backend = new CursorAgentBackend({
        command: "should-not-be-spawned",
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "")).rejects.toThrow(/sessionKey is required/);
    });
  });

  describe("arg shape", () => {
    it("passes --print --output-format json --trust and a positional prompt", async () => {
      const { command, args } = await fakeCursorScript(SCRIPT_CAPTURE_ARGV);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hello world", "session-XYZ");
      const argv = JSON.parse(out);
      expect(argv).toContain("--print");
      expect(argv).toContain("--output-format");
      expect(argv).toContain("json");
      expect(argv).toContain("--trust");
      expect(argv).not.toContain("--prompt");
      expect(argv).not.toContain("--output");
      expect(argv[argv.length - 1]).toBe("hello world");
    });

    it("inserts extraArgs before the positional prompt", async () => {
      const { command, args } = await fakeCursorScript(SCRIPT_CAPTURE_ARGV);
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
        extraArgs: ["--model", "gpt-5"],
      });
      const out = await backend.ask("hi", "session-A");
      const argv = JSON.parse(out) as string[];
      expect(argv).toContain("--model");
      expect(argv).toContain("gpt-5");
      expect(argv.indexOf("--model")).toBeGreaterThan(argv.indexOf("--print"));
      expect(argv.indexOf("--model")).toBeLessThan(argv.length - 1);
      expect(argv[argv.length - 1]).toBe("hi");
    });
  });

  describe("probe()", () => {
    it("returns true when --version exits 0", async () => {
      const { command, args } = await fakeCursorScript(
        `#!/usr/bin/env node\nprocess.stdout.write("cursor-agent 0.5.0");\n`,
      );
      const backend = new CursorAgentBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const ok = await backend.probe();
      expect(ok).toBe(true);
    });

    it("returns false when the binary is not on PATH", async () => {
      const backend = new CursorAgentBackend({
        command: "cursor-agent",
        binaryOnPath: async () => false,
      });
      const ok = await backend.probe();
      expect(ok).toBe(false);
    });

    it("returns false on ENOENT even with pre-check true", async () => {
      const backend = new CursorAgentBackend({
        command: "definitely-not-installed-cursor-9999",
        binaryOnPath: async () => true,
      });
      const ok = await backend.probe();
      expect(ok).toBe(false);
    });
  });
});
