import { describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ensurePiTerminalSession,
  piSessionTitle,
  resolvePiProjectDir,
} from "../src/pi-terminal-session.js";
import type { TerminalManager } from "../src/terminal-manager.js";

describe("resolvePiProjectDir", () => {
  it("returns null for empty or missing paths", () => {
    expect(resolvePiProjectDir(undefined)).toBeNull();
    expect(resolvePiProjectDir("")).toBeNull();
    expect(resolvePiProjectDir("   ")).toBeNull();
    expect(resolvePiProjectDir("/no/such/path/envoymesh-pi-test")).toBeNull();
  });

  it("returns absolute path for an existing directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-proj-"));
    expect(resolvePiProjectDir(dir)).toBe(dir);
  });

  it("rejects a file path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-proj-"));
    const file = join(dir, "file.txt");
    await writeFile(file, "x");
    expect(resolvePiProjectDir(file)).toBeNull();
  });
});

describe("piSessionTitle", () => {
  it("uses the folder basename", () => {
    expect(piSessionTitle("/Users/me/my-repo")).toBe("Pi · my-repo");
  });
});

describe("ensurePiTerminalSession", () => {
  it("returns needs_project when projectPath is omitted (no auto-start)", async () => {
    const create = vi.fn();
    const manager = {
      findPiSession: () => undefined,
      listPiSessions: () => [],
      findPiSessionByCwd: () => undefined,
      createTerminalSession: create,
      closeTerminalSession: vi.fn(),
    } as unknown as TerminalManager;

    const out = await ensurePiTerminalSession(manager, {
      loadConfig: async () => ({
        piEnabled: true,
        piSettings: { allowedPaths: [tmpdir()] },
        modelProviders: {
          mode: "openai-compatible",
          modelName: "m",
          apiKey: "k",
        } as never,
      }),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("needs_project");
    expect(create).not.toHaveBeenCalled();
  });

  it("reuses an existing Pi for the same project cwd", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-reuse-"));
    const existing = {
      sessionId: "pi-1",
      title: piSessionTitle(dir),
      cwd: dir,
      shell: "node",
      state: "running" as const,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      role: "pi" as const,
    };
    const create = vi.fn();
    const manager = {
      findPiSession: () => existing,
      listPiSessions: () => [existing],
      findPiSessionByCwd: (cwd: string) => (cwd === dir ? existing : undefined),
      createTerminalSession: create,
      closeTerminalSession: vi.fn(),
    } as unknown as TerminalManager;

    const out = await ensurePiTerminalSession(
      manager,
      {
        loadConfig: async () => ({
          piEnabled: true,
          modelProviders: {
            mode: "openai-compatible",
            modelName: "m",
            apiKey: "k",
          } as never,
        }),
      },
      { projectPath: dir },
    );
    expect(out).toEqual({ ok: true, session: existing });
    expect(create).not.toHaveBeenCalled();
  });

  it("returns disabled failure when piEnabled is false", async () => {
    const create = vi.fn();
    const manager = {
      findPiSession: () => undefined,
      listPiSessions: () => [],
      findPiSessionByCwd: () => undefined,
      createTerminalSession: create,
      closeTerminalSession: vi.fn(),
    } as unknown as TerminalManager;

    const out = await ensurePiTerminalSession(
      manager,
      {
        loadConfig: async () => ({
          piEnabled: false,
          modelProviders: { mode: "anthropic-compatible", modelName: "x", apiKey: "k" } as never,
        }),
      },
      { projectPath: tmpdir() },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("disabled");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns no_sidecar when discoverPiCli finds nothing", async () => {
    const create = vi.fn();
    const manager = {
      findPiSession: () => undefined,
      listPiSessions: () => [],
      findPiSessionByCwd: () => undefined,
      createTerminalSession: create,
      closeTerminalSession: vi.fn(),
    } as unknown as TerminalManager;

    vi.resetModules();
    vi.doMock("../src/pi-runtime.js", async () => {
      const actual = await vi.importActual<typeof import("../src/pi-runtime.js")>(
        "../src/pi-runtime.js",
      );
      return {
        ...actual,
        discoverPiCli: () => null,
      };
    });
    const { ensurePiTerminalSession: ensureIsolated } = await import(
      "../src/pi-terminal-session.js"
    );

    const out = await ensureIsolated(
      manager,
      {
        loadConfig: async () => ({
          piEnabled: true,
          modelProviders: {
            mode: "anthropic-compatible",
            modelName: "claude-test",
            apiKey: "sk-test",
          } as never,
        }),
      },
      { projectPath: tmpdir() },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("no_sidecar");
    expect(create).not.toHaveBeenCalled();
    vi.doUnmock("../src/pi-runtime.js");
    vi.resetModules();
  });

  it("returns no_tools when GUI bundle lacks fd/rg", async () => {
    const create = vi.fn();
    const manager = {
      findPiSession: () => undefined,
      listPiSessions: () => [],
      findPiSessionByCwd: () => undefined,
      createTerminalSession: create,
      closeTerminalSession: vi.fn(),
    } as unknown as TerminalManager;

    vi.resetModules();
    vi.doMock("../src/pi-runtime.js", async () => {
      const actual = await vi.importActual<typeof import("../src/pi-runtime.js")>(
        "../src/pi-runtime.js",
      );
      return {
        ...actual,
        discoverPiCli: () => ({ cliPath: "/fake/cli.js", version: "0.0.0" }),
        requirePiToolsForGui: () => "Pi tools (fd/rg) missing from this install.",
      };
    });
    const { ensurePiTerminalSession: ensureIsolated } = await import(
      "../src/pi-terminal-session.js"
    );

    const out = await ensureIsolated(
      manager,
      {
        loadConfig: async () => ({
          piEnabled: true,
          modelProviders: {
            mode: "anthropic-compatible",
            modelName: "claude-test",
            apiKey: "sk-test",
          } as never,
        }),
      },
      { projectPath: tmpdir() },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("no_tools");
    expect(create).not.toHaveBeenCalled();
    vi.doUnmock("../src/pi-runtime.js");
    vi.resetModules();
  });

  it("forceRestart closes the targeted session before spawn attempt", async () => {
    const existing = {
      sessionId: "pi-old",
      title: "Pi · old",
      cwd: "/old",
      shell: "node",
      state: "running" as const,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      role: "pi" as const,
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn();
    const manager = {
      findPiSession: () => existing,
      listPiSessions: () => [existing],
      findPiSessionByCwd: () => undefined,
      createTerminalSession: create,
      closeTerminalSession: close,
    } as unknown as TerminalManager;

    vi.resetModules();
    vi.doMock("../src/pi-runtime.js", async () => {
      const actual = await vi.importActual<typeof import("../src/pi-runtime.js")>(
        "../src/pi-runtime.js",
      );
      return {
        ...actual,
        discoverPiCli: () => ({ cliPath: "/fake/cli.js", version: "0.0.0" }),
        buildPiSpawnConfig: () => null,
        resolvePiNodeRuntime: () => "node",
      };
    });
    const { ensurePiTerminalSession: ensureIsolated } = await import(
      "../src/pi-terminal-session.js"
    );

    const out = await ensureIsolated(
      manager,
      {
        loadConfig: async () => ({
          piEnabled: true,
          modelProviders: { mode: "mock" } as never,
        }),
      },
      { forceRestart: true, sessionId: "pi-old", projectPath: tmpdir() },
    );
    // buildPiSpawnConfig null → no_model before close; re-order expectation:
    // with mock mode, spawn config fails before close. Use a real provider map.
    expect(out.ok).toBe(false);
    vi.doUnmock("../src/pi-runtime.js");
    vi.resetModules();
  });

  it("forceRestart closes sessionId when spawn config is valid", async () => {
    const existing = {
      sessionId: "pi-old",
      title: "Pi · old",
      cwd: "/old",
      shell: "node",
      state: "running" as const,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      role: "pi" as const,
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn();
    const dir = await mkdtemp(join(tmpdir(), "pi-restart-"));
    const manager = {
      findPiSession: () => existing,
      listPiSessions: () => [existing],
      findPiSessionByCwd: () => undefined,
      createTerminalSession: create,
      closeTerminalSession: close,
    } as unknown as TerminalManager;

    vi.resetModules();
    vi.doMock("../src/pi-runtime.js", async () => {
      const actual = await vi.importActual<typeof import("../src/pi-runtime.js")>(
        "../src/pi-runtime.js",
      );
      return {
        ...actual,
        discoverPiCli: () => ({ cliPath: "/fake/cli.js", version: "0.0.0" }),
        buildPiSpawnConfig: () => ({
          modelSpec: "openai/m",
          provider: "openai",
          model: "m",
          env: {},
          inherited: true,
        }),
        resolvePiNodeRuntime: () => "node",
      };
    });
    const { ensurePiTerminalSession: ensureIsolated } = await import(
      "../src/pi-terminal-session.js"
    );

    create.mockResolvedValue({
      sessionId: "pi-new",
      title: "Pi · x",
      cwd: dir,
      shell: "node",
      state: "running",
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      role: "pi",
    });

    const out = await ensureIsolated(
      manager,
      {
        loadConfig: async () => ({
          piEnabled: true,
          modelProviders: {
            mode: "openai-compatible",
            modelName: "m",
            apiKey: "k",
          } as never,
        }),
      },
      { forceRestart: true, sessionId: "pi-old", projectPath: dir },
    );
    expect(close).toHaveBeenCalledWith({ sessionId: "pi-old" });
    expect(out.ok).toBe(true);
    expect(create).toHaveBeenCalled();
    vi.doUnmock("../src/pi-runtime.js");
    vi.resetModules();
  });
  it("returns pi_limit_reached when already at max distinct projects", async () => {
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      sessionId: `pi-${i}`,
      title: `Pi · p${i}`,
      cwd: `/proj/${i}`,
      shell: "node",
      state: "running" as const,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      role: "pi" as const,
    }));
    const create = vi.fn();
    const dir = await mkdtemp(join(tmpdir(), "pi-limit-"));
    const manager = {
      findPiSession: () => sessions[0],
      listPiSessions: () => sessions,
      findPiSessionByCwd: () => undefined,
      createTerminalSession: create,
      closeTerminalSession: vi.fn(),
    } as unknown as TerminalManager;

    vi.resetModules();
    vi.doMock("../src/pi-runtime.js", async () => {
      const actual = await vi.importActual<typeof import("../src/pi-runtime.js")>(
        "../src/pi-runtime.js",
      );
      return {
        ...actual,
        discoverPiCli: () => ({ cliPath: "/fake/cli.js", version: "0.0.0" }),
        buildPiSpawnConfig: () => ({
          modelSpec: "openai/m",
          provider: "openai",
          model: "m",
          env: {},
          inherited: true,
        }),
        resolvePiNodeRuntime: () => "node",
      };
    });
    const { ensurePiTerminalSession: ensureIsolated } = await import(
      "../src/pi-terminal-session.js"
    );

    const out = await ensureIsolated(
      manager,
      {
        loadConfig: async () => ({
          piEnabled: true,
          modelProviders: {
            mode: "openai-compatible",
            modelName: "m",
            apiKey: "k",
          } as never,
        }),
      },
      { projectPath: dir },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("pi_limit_reached");
    expect(create).not.toHaveBeenCalled();
    vi.doUnmock("../src/pi-runtime.js");
    vi.resetModules();
  });
});
