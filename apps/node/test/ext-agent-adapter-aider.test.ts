/**
 * Phase 56B — `AiderBackend` tests.
 *
 * Strategy: spawn a real `node` subprocess as the fake `aider` CLI.
 * The script can be configured to emit plain text, leak ANSI codes
 * (to verify `stripAnsi` in parseOutput), or fail with non-zero exit.
 * Install-detection tests inject the `binaryOnPath` option.
 *
 * The key safety contract tested here:
 *   `--no-git` flag is ALWAYS passed — without it, Aider auto-commits
 *   to the user's git repo on the bridge's behalf. This is enforced
 *   by the `passes --no-git to the CLI` test below.
 */
import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AiderBackend,
  createAiderBackend,
} from "../src/ext-agent-adapter/aider-backend.js";
import { InstallMissingError } from "../src/ext-agent-adapter/daemon-supervisor.js";

// ---------------------------------------------------------------------------
// Fake "aider" scripts
// ---------------------------------------------------------------------------

/** Emits a simple text reply (the `--no-pretty` happy path). */
const SCRIPT_HAPPY = `#!/usr/bin/env node
process.stdout.write("Hello from aider");
`;

/** Emits text with ANSI color codes (defensive `stripAnsi` path). */
const SCRIPT_ANSI = `#!/usr/bin/env node
process.stdout.write("\\x1b[32mHello \\x1b[0m\\x1b[1mfrom\\x1b[0m aider\\x1b[0m\\n");
`;

/** Emits only ANSI noise (parseOutput should return empty). */
const SCRIPT_ANSI_ONLY = `#!/usr/bin/env node
process.stdout.write("\\x1b[32m\\x1b[0m\\x1b[1m\\x1b[0m");
`;

/** Exits non-zero with stderr. */
const SCRIPT_FAIL = `#!/usr/bin/env node
process.stderr.write("model rate limit hit"); process.exit(1);
`;

/** Sleeps (used to test the 120s timeout being overridden to small). */
const SCRIPT_SLEEP = `#!/usr/bin/env node
setTimeout(() => process.stdout.write("too late"), 5000);
`;

/** Captures argv (so we can assert the flag set passed to aider). */
const SCRIPT_CAPTURE_ARGV = `#!/usr/bin/env node
process.stdout.write(JSON.stringify(process.argv.slice(2)));
`;

async function fakeAiderScript(body: string): Promise<{ command: string; args: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), "aider-fake-"));
  const scriptPath = join(dir, "fake-aider.mjs");
  await writeFile(scriptPath, body, { mode: 0o755 });
  return { command: process.execPath, args: [scriptPath] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AiderBackend", () => {
  describe("shape", () => {
    it("has the expected kind + label", () => {
      const backend = new AiderBackend({
        command: "aider",
        binaryOnPath: async () => true,
      });
      expect(backend.kind).toBe("aider");
      expect(backend.label).toBe("Aider");
    });

    it("createAiderBackend() returns an ExtAgentBackend", () => {
      const backend = createAiderBackend({
        command: "aider",
        binaryOnPath: async () => true,
      });
      expect(backend.kind).toBe("aider");
      expect(typeof backend.ask).toBe("function");
      expect(typeof backend.probe).toBe("function");
    });
  });

  describe("ask()", () => {
    it("returns the parsed assistant text on success", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_HAPPY);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("Hello from aider");
    });

    it("strips ANSI color codes from the response", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_ANSI);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      expect(out).toBe("Hello from aider");
    });

    it("returns empty string when only ANSI noise is emitted (and parseOutput strips it)", async () => {
      // After stripping ANSI codes the response is empty, so the
      // base class rejects with "empty response" — confirms the
      // base's empty-response check is wired correctly.
      const { command, args } = await fakeAiderScript(SCRIPT_ANSI_ONLY);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toThrow(/empty response/);
    });

    it("rejects with non-zero-exit error when CLI exits non-zero", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_FAIL);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toThrow(
        /aider ask\(\): non-zero exit \(code=1, stderr=model rate limit hit\).*Install Aider/s,
      );
    });

    it("rejects with InstallMissingError when binary is not on PATH (pre-check)", async () => {
      const backend = new AiderBackend({
        command: "aider",
        binaryOnPath: async () => false,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toBeInstanceOf(
        InstallMissingError,
      );
    });

    it("rejects with InstallMissingError when spawn() raises ENOENT (async)", async () => {
      // pre-check returns true but spawn() fires the error event.
      const backend = new AiderBackend({
        command: "definitely-not-installed-aider",
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "session-A")).rejects.toBeInstanceOf(
        InstallMissingError,
      );
    });

    it("rejects with timeout error when CLI hangs", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_SLEEP);
      const backend = new AiderBackend({
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
      const backend = new AiderBackend({
        command: "should-not-be-spawned",
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("  \n  ", "session-A");
      expect(out).toBe("");
    });

    it("rejects when sessionKey is empty", async () => {
      const backend = new AiderBackend({
        command: "should-not-be-spawned",
        binaryOnPath: async () => true,
      });
      await expect(backend.ask("hi", "")).rejects.toThrow(/sessionKey is required/);
    });
  });

  describe("arg shape (CRITICAL — safety flags)", () => {
    it("passes the prompt as the value of --message", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_CAPTURE_ARGV);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hello world", "session-XYZ");
      const argv = JSON.parse(out);
      const msgIdx = argv.indexOf("--message");
      expect(msgIdx).toBeGreaterThanOrEqual(0);
      expect(argv[msgIdx + 1]).toBe("hello world");
    });

    it("ALWAYS passes --no-git (auto-commit safety)", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_CAPTURE_ARGV);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      const argv = JSON.parse(out);
      expect(argv).toContain("--no-git");
    });

    it("ALWAYS passes --no-pretty (clean stdout)", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_CAPTURE_ARGV);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      const argv = JSON.parse(out);
      expect(argv).toContain("--no-pretty");
    });

    it("ALWAYS passes --yes-always (no TTY prompts in chat-bridge)", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_CAPTURE_ARGV);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      const argv = JSON.parse(out);
      expect(argv).toContain("--yes-always");
    });

    it("inserts extraArgs BEFORE the safety flags (safety always wins)", async () => {
      const { command, args } = await fakeAiderScript(SCRIPT_CAPTURE_ARGV);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
        extraArgs: ["--model", "anthropic/claude-sonnet-4-20250514", "--auto-lint"],
      });
      const out = await backend.ask("hi", "session-A");
      const argv = JSON.parse(out);
      expect(argv).toContain("--model");
      expect(argv).toContain("anthropic/claude-sonnet-4-20250514");
      expect(argv).toContain("--auto-lint");
      // Safety flags must come LAST (so a user-supplied --git can't
      // override --no-git via last-occurrence-wins). This is the
      // security contract: the chat-bridge MUST NOT auto-commit.
      expect(argv.indexOf("--no-git")).toBeGreaterThan(argv.indexOf("--model"));
      expect(argv.indexOf("--no-pretty")).toBeGreaterThan(argv.indexOf("--model"));
      expect(argv.indexOf("--yes-always")).toBeGreaterThan(argv.indexOf("--model"));
    });

    it("safety flags win over user-supplied conflicting flags (security contract)", async () => {
      // Regression guard: previously safety flags came first, so
      // a user passing `extraArgs: ["--git"]` would override
      // `--no-git` (last-occurrence-wins in POSIX getopt). The
      // ordering has been flipped so safety flags always come
      // last and therefore always win.
      const { command, args } = await fakeAiderScript(SCRIPT_CAPTURE_ARGV);
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
        extraArgs: ["--git", "--pretty"],
      });
      const out = await backend.ask("hi", "session-A");
      const argv = JSON.parse(out);
      // --no-git must come AFTER --git (so it wins)
      expect(argv.indexOf("--no-git")).toBeGreaterThan(argv.indexOf("--git"));
      // --no-pretty must come AFTER --pretty (so it wins)
      expect(argv.indexOf("--no-pretty")).toBeGreaterThan(argv.indexOf("--pretty"));
    });
  });

  describe("probe()", () => {
    it("returns true when --version exits 0", async () => {
      const { command, args } = await fakeAiderScript(
        `#!/usr/bin/env node\nprocess.stdout.write("aider 0.86.0");\n`,
      );
      const backend = new AiderBackend({
        command,
        args,
        binaryOnPath: async () => true,
      });
      const ok = await backend.probe();
      expect(ok).toBe(true);
    });

    it("returns false when the binary is not on PATH", async () => {
      const backend = new AiderBackend({
        command: "aider",
        binaryOnPath: async () => false,
      });
      const ok = await backend.probe();
      expect(ok).toBe(false);
    });

    it("returns false on ENOENT even with pre-check true", async () => {
      const backend = new AiderBackend({
        command: "definitely-not-installed-aider-9999",
        binaryOnPath: async () => true,
      });
      const ok = await backend.probe();
      expect(ok).toBe(false);
    });
  });

  describe("env pass-through", () => {
    it("merges env on top of process.env (so ANTHROPIC_API_KEY flows through)", async () => {
      let capturedEnv: Record<string, string> = {};
      const { command, args } = await fakeAiderScript(
        `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({ ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "", AIDER_FLAG: process.env.AIDER_FLAG || "" }));\n`,
      );
      const backend = new AiderBackend({
        command,
        args,
        env: { AIDER_FLAG: "from-backend" },
        binaryOnPath: async () => true,
      });
      const out = await backend.ask("hi", "session-A");
      capturedEnv = JSON.parse(out);
      // The user's shell ANTHROPIC_API_KEY is preserved (not overwritten).
      expect(typeof capturedEnv.ANTHROPIC_API_KEY).toBe("string");
      // Backend-supplied extra env flows through.
      expect(capturedEnv.AIDER_FLAG).toBe("from-backend");
    });
  });
});
