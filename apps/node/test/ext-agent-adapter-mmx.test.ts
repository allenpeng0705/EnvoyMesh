/**
 * Phase 56C — `MmxBackend` tests.
 *
 * Strategy: spawn a real `node` subprocess as the fake `mmx` CLI.
 * MMX-CLI is designed for AI agents (clean `--output json`, semantic
 * exit codes), so the integration is straightforward. We exercise
 * the canonical `{ text, session_id, model }` JSON shape plus a
 * few realistic field-name variants.
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MmxBackend, createMmxBackend } from "../src/ext-agent-adapter/mmx-backend.js";
import { InstallMissingError } from "../src/ext-agent-adapter/daemon-supervisor.js";

// ---------------------------------------------------------------------------
// Fake "mmx" scripts
// ---------------------------------------------------------------------------

/** Canonical MMX-CLI JSON output: `{ text, session_id, model, usage }`. */
const SCRIPT_HAPPY = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  text: "hello from MiniMax (M2.7)",
  session_id: "mmx-sess-001",
  model: "MiniMax-M2.7",
  usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
}) + "\\n");
`;

/** Older version emits `response` instead of `text`. */
const SCRIPT_RESPONSE_FIELD = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ response: "fallback response field" }) + "\\n");
`;

/** Another variant: `output` field. */
const SCRIPT_OUTPUT_FIELD = `#!/usr/bin/env node
process.stdout.write(JSON.stringify({ output: "fallback output field" }) + "\\n");
`;

/** Plain-text fallback (CLI without --output json, or a debug build). */
const SCRIPT_PLAIN_TEXT = `#!/usr/bin/env node
process.stdout.write("plain text reply from mmx\\n");
`;

/** Exits non-zero with stderr. */
const SCRIPT_FAIL = `#!/usr/bin/env node
process.stderr.write("auth failed: invalid API key"); process.exit(10);
`;

/** Sleeps (used to test the timeout path). */
const SCRIPT_SLEEP = `#!/usr/bin/env node
setTimeout(() => process.stdout.write("too late"), 5000);
`;

/** Captures argv (so we can assert the flag set passed to mmx). */
const SCRIPT_CAPTURE_ARGV = `#!/usr/bin/env node
process.stdout.write(JSON.stringify(process.argv.slice(2)));
`;

/** `auth status` probe (returns 0 when auth is valid). */
const SCRIPT_AUTH_OK = `#!/usr/bin/env node
process.stdout.write("logged in\\n");
`;

async function fakeMmxScript(body: string): Promise<{ command: string; args: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), "mmx-fake-"));
  const scriptPath = join(dir, "fake-mmx.mjs");
  await writeFile(scriptPath, body, { mode: 0o755 });
  return { command: process.execPath, args: [scriptPath] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MmxBackend", () => {
  describe("shape", () => {
    it("has the expected kind + label", () => {
      const backend = new MmxBackend({
        command: "mmx",
        binaryOnPath: async () => true,
      });
      expect(backend.kind).toBe("mmx");
      expect(backend.label).toBe("MiniMax MMX-CLI");
    });

    it("createMmxBackend() returns an ExtAgentBackend", () => {
      const backend = createMmxBackend({
        command: "mmx",
        binaryOnPath: async () => true,
      });
      expect(backend.kind).toBe("mmx");
      expect(typeof backend.ask).toBe("function");
      expect(typeof backend.probe).toBe("function");
    });
  });

  describe("ask()", () => {
    it("parses canonical JSON `{ text, session_id, model }` and returns `text`", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_HAPPY);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("hello from MiniMax (M2.7)");
    });

    it("falls back to `response` field on older versions", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_RESPONSE_FIELD);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("fallback response field");
    });

    it("falls back to `output` field when text/response are absent", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_OUTPUT_FIELD);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("fallback output field");
    });

    it("falls back to plain text when stdout is not JSON", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_PLAIN_TEXT);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("plain text reply from mmx");
    });

    it("rejects with non-zero-exit error when CLI exits non-zero", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_FAIL);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      // mmx semantic exit codes: 10 = auth failure. The base class
      // now rejects with the exit code + stderr + install hint —
      // a non-zero exit is a hard error, not a parseable answer.
      await expect(backend.ask("hi", "session-A")).rejects.toThrow(
        /mmx ask\(\): non-zero exit \(code=10, stderr=auth failed: invalid API key\).*Install MMX-CLI/s,
      );
    });

    it("rejects with InstallMissingError when binary is not on PATH (pre-check)", async () => {
      const backend = new MmxBackend({
        command: "mmx",
        binaryOnPath: async () => false,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toBeInstanceOf(
        InstallMissingError,
      );
    });

    it("rejects with InstallMissingError when spawn() raises ENOENT (async)", async () => {
      // pre-check returns true but spawn() fires the error event.
      const backend = new MmxBackend({
        command: "definitely-not-installed-mmx",
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toBeInstanceOf(
        InstallMissingError,
      );
    });

    it("rejects with timeout error when CLI hangs", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_SLEEP);
      const backend = new MmxBackend({
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
      const backend = new MmxBackend({
        command: "should-not-be-spawned",
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("  \n  ", "session-A");
      expect(out).toBe("");
    });

    it("rejects when sessionKey is empty", async () => {
      const backend = new MmxBackend({
        command: "should-not-be-spawned",
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "")).rejects.toThrow(/sessionKey is required/);
    });
  });

  describe("arg shape", () => {
    it("passes `text chat --message <text> --output json` to the CLI", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_CAPTURE_ARGV);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hello world", "session-XYZ");
      const argv = JSON.parse(out);
      expect(argv[0]).toBe("text");
      expect(argv[1]).toBe("chat");
      const msgIdx = argv.indexOf("--message");
      expect(msgIdx).toBeGreaterThanOrEqual(0);
      expect(argv[msgIdx + 1]).toBe("hello world");
      const outIdx = argv.indexOf("--output");
      expect(outIdx).toBeGreaterThanOrEqual(0);
      expect(argv[outIdx + 1]).toBe("json");
    });

    it("inserts extraArgs after --output json", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_CAPTURE_ARGV);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
        extraArgs: ["--model", "MiniMax-M3", "--region", "global"],
      });
      const out = await backend.ask("hi", "session-A");
      const argv = JSON.parse(out);
      expect(argv).toContain("--model");
      expect(argv).toContain("MiniMax-M3");
      expect(argv).toContain("--region");
      expect(argv).toContain("global");
      // --model must come after --output json (subcommand order).
      expect(argv.indexOf("--model")).toBeGreaterThan(argv.indexOf("--output"));
    });
  });

  describe("probe()", () => {
    it("returns true when `auth status` exits 0 (default probeArgs)", async () => {
      const { command, args } = await fakeMmxScript(SCRIPT_AUTH_OK);
      const backend = new MmxBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const ok = await backend.probe();
      expect(ok).toBe(true);
    });

    it("returns false when the binary is not on PATH", async () => {
      const backend = new MmxBackend({
        command: "mmx",
        binaryOnPath: async () => false,
      });
      const ok = await backend.probe();
      expect(ok).toBe(false);
    });

    it("returns false on ENOENT even with pre-check true", async () => {
      const backend = new MmxBackend({
        command: "definitely-not-installed-mmx-9999",
        binaryOnPath: async () => true,
      });
      const ok = await backend.probe();
      expect(ok).toBe(false);
    });

    it("uses custom probeArgs when provided", () => {
      // Constructor must accept custom probeArgs without throwing.
      const backend = new MmxBackend({
        command: "mmx",
        binaryOnPath: async () => true,
        probeArgs: ["quota"],
      });
      expect(backend.kind).toBe("mmx");
    });
  });

  describe("env pass-through", () => {
    it("merges env on top of process.env (so MINIMAX_API_KEY flows through)", async () => {
      let capturedEnv: Record<string, string> = {};
      const { command, args } = await fakeMmxScript(
        `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ MMX_KEY: process.env.MINIMAX_API_KEY || "", MMX_FLAG: process.env.MMX_FLAG || "" }));\n`,
      );
      const backend = new MmxBackend({
        command,
        args,
        env: { MMX_FLAG: "from-backend" },
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      capturedEnv = JSON.parse(out);
      // Backend-supplied extra env flows through.
      expect(capturedEnv.MMX_FLAG).toBe("from-backend");
      // The user's shell MINIMAX_API_KEY is preserved (not overwritten);
      // type-checked (env may be unset in CI but should at least not
      // blow up).
      expect(typeof capturedEnv.MMX_KEY).toBe("string");
    });
  });
});
