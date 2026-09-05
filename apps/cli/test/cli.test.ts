/**
 * EnvoyMesh CLI tests — verify all commands parse correctly and helpers work.
 * Uses exec to actually run the CLI binary and check output/exit codes.
 * @vitest-environment node
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const CLI = join(__dirname, "..", "src", "index.ts");
const TMP = join(__dirname, "..", "..", "..", "outputs", "cli-test");

function run(args: string, opts?: { cwd?: string; env?: Record<string, string> }): { out: string; code: number } {
  try {
    const out = execSync(`node --import tsx ${CLI} ${args}`, {
      cwd: opts?.cwd ?? join(__dirname, "..", "..", ".."),
      encoding: "utf-8",
      timeout: 30_000,
      env: { ...process.env, ...opts?.env },
    });
    return { out: out.trim(), code: 0 };
  } catch (err: any) {
    return { out: (err.stdout ?? "").toString().trim() + (err.stderr ?? "").toString().trim(), code: err.status ?? 1 };
  }
}

describe("CLI", () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterAll(() => {
    try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ok */ }
  });

  describe("help and version", () => {
    it("shows help with no args", () => {
      const { out, code } = run("");
      expect(code).toBe(0);
      expect(out).toContain("EnvoyMesh CLI");
      expect(out).toContain("Usage:");
    });

    it("shows help with --help", () => {
      const { out, code } = run("--help");
      expect(code).toBe(0);
      expect(out).toContain("Usage:");
    });

    it("shows help with help", () => {
      const { out, code } = run("help");
      expect(code).toBe(0);
      expect(out).toContain("Usage:");
    });

    it("shows version", () => {
      const { out, code } = run("version");
      expect(code).toBe(0);
      expect(out).toContain("EnvoyMesh");
      expect(out).toContain("Node");
    });

    it("shows version with -v", () => {
      const { out, code } = run("-v");
      expect(code).toBe(0);
      expect(out).toContain("EnvoyMesh");
    });
  });

  describe("setup", () => {
    // Never run bare `setup` in unit tests — it invokes scripts/setup.sh which
    // runs `pnpm install` and can delete node_modules/vitest mid-suite.
    it("setup --help wires to setup.sh without installing", () => {
      const { out, code } = run("setup --help", { cwd: TMP });
      expect(code).toBe(0);
      expect(out).toContain("Usage:");
      expect(out).not.toContain("setup.sh not found");
    });

    it("setup.sh exists at repo scripts path", () => {
      const setupSh = join(__dirname, "..", "..", "..", "scripts", "setup.sh");
      expect(existsSync(setupSh)).toBe(true);
      const { out, code } = run("setup --help");
      expect(code).toBe(0);
      expect(out).toContain("Usage:");
      expect(out).not.toContain("setup.sh not found");
    });
  });

  describe("status and doctor", () => {
    it("status shows health check", () => {
      const { out, code } = run("status");
      expect(code).toBe(0);
      expect(out).toContain("EnvoyMesh Status");
      // Should show at least some services (may be down)
      expect(out).toMatch(/Node|Bridge|Gateway/);
    });

    it("doctor shows diagnostics", () => {
      const { out, code } = run("doctor");
      expect(code).toBe(0);
      expect(out).toContain("EnvoyMesh Doctor");
      expect(out).toMatch(/✓|✗/);
    });
  });

  describe("identity", () => {
    it("shows identity when config exists", () => {
      const { out, code } = run("identity");
      expect(code).toBe(0);
      expect(out).toContain("Identity");
    });

    it("id alias works", () => {
      const { out, code } = run("id");
      expect(code).toBe(0);
      expect(out).toContain("Identity");
    });
  });

  describe("config", () => {
    it("shows bridge config", () => {
      const { out, code } = run("config");
      expect(code).toBe(0);
    });
  });

  describe("version", () => {
    it("shows versions", () => {
      const { out, code } = run("version");
      expect(code).toBe(0);
      expect(out).toContain("EnvoyMesh");
      expect(out).toContain("OpenClaw");
      expect(out).toContain("Node");
    });
  });

  describe("gateway", () => {
    it("gateway status reports", () => {
      const { out, code } = run("gateway status");
      expect(code).toBe(0);
      expect(out).toMatch(/running|not running/);
    });

    it("gateway with unknown subcommand shows usage", () => {
      const { out, code } = run("gateway unknown");
      expect(code).toBe(1);
      expect(out).toContain("Usage:");
    });

    it("gw alias works", () => {
      const { out, code } = run("gw status");
      expect(code).toBe(0);
      expect(out).toMatch(/running|not running/);
    });
  });

  describe("unknown command", () => {
    it("shows error for unknown command", () => {
      const { out, code } = run("nonexistent");
      expect(code).toBe(1);
      expect(out).toContain("Unknown command");
    });
  });

  describe("openclaw passthrough", () => {
    it("openclaw --version passes through", () => {
      const { out, code } = run("openclaw --version");
      expect(code).toBe(0);
      expect(out).toContain("OpenClaw");
    });

    it("oc alias works", () => {
      const { out, code } = run("oc --version");
      expect(code).toBe(0);
      expect(out).toContain("OpenClaw");
    });
  });
});

describe("CLI helpers (unit)", () => {
  // The CLI uses spawnSync — we can verify the helper logic by testing edge cases

  it("handles empty args gracefully", () => {
    const { out, code } = run("");
    expect(code).toBe(0);
    expect(out.length).toBeGreaterThan(0);
  });

  it("handles extra whitespace in args", () => {
    const { out, code } = run("  status  ");
    expect(code).toBe(0);
    expect(out).toContain("EnvoyMesh Status");
  });

  it("all commands are listed in help", () => {
    const { out } = run("help");
    const required = ["start", "stop", "restart", "status", "setup",
      "gateway", "doctor", "config", "chat", "discover", "version",
      "openclaw", "identity", "inbox", "send", "agent", "vault",
      "build", "test", "typecheck", "clean", "social", "tauri"];
    for (const cmd of required) {
      expect(out).toContain(cmd);
    }
  });
});

describe("CLI non-destructive commands", () => {
  it("discover returns without error", () => {
    const { code } = run("discover test");
    expect(code).toBe(0);
  });

  it("peers returns without error", () => {
    const { code } = run("peers");
    expect(code).toBe(0);
  });

  it("logs returns without error", () => {
    const { code } = run("logs");
    expect(code).toBe(0);
  });

  it("vault list returns without error", () => {
    const { out, code } = run("vault list");
    expect(code).toBe(0);
  });

  it("send without args shows usage", () => {
    const { out } = run("send");
    expect(out).toContain("Usage:");
  });

  it("agent without args shows usage", () => {
    const { out } = run("agent");
    expect(out).toContain("Usage:");
  });

  it("chat without args shows usage", () => {
    const { out } = run("chat");
    expect(out).toContain("Usage:");
  });
});
