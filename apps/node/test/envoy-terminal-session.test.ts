/**
 * U4+ — ensureEnvoyTerminalSession: project requirement, spawn argv/role,
 * reuse-by-cwd, and the TUI-bin resolution.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ensureEnvoyTerminalSession,
  envoySessionTitle,
  resolveEnvoyHarnessTuiBin,
} from "../src/envoy-terminal-session.js";

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "envoy-terminal-"));
  process.env.ENVOY_HARNESS_TUI_BIN = "/fake/envoy-harness-tui.js";
});

afterAll(async () => {
  delete process.env.ENVOY_HARNESS_TUI_BIN;
  await rm(dir, { recursive: true, force: true });
});

function fakeManager() {
  const created: Array<Record<string, unknown>> = [];
  const sessions: Array<Record<string, unknown>> = [];
  const findSessionByCwd = vi.fn(() => undefined);
  const listSessionsByRole = vi.fn(() => []);
  const closeTerminalSession = vi.fn(async () => undefined);
  const createTerminalSession = vi.fn(async (params: {
    title: string;
    cwd: string;
    role: string;
    command: string;
    args: string[];
    env: Record<string, string>;
  }) => {
    const summary = {
      sessionId: "envoy-1",
      title: params.title,
      cwd: params.cwd,
      role: params.role,
      command: params.command,
      args: params.args,
      state: "running",
      createdAt: "2026-08-23T00:00:00.000Z",
      lastActivityAt: "2026-08-23T00:00:00.000Z",
      shell: params.command,
    };
    created.push(params);
    sessions.push(summary);
    return summary;
  });
  return {
    manager: {
      findSessionByCwd,
      listSessionsByRole,
      closeTerminalSession,
      createTerminalSession,
    } as never,
    created,
    findSessionByCwd,
    createTerminalSession,
  };
}

const deps = {
  loadConfig: async () => ({ piEnabled: true, modelProviders: {} }),
  saveProjectPath: vi.fn(async () => undefined),
  resolveRuntimeConfig: async () => ({
    provider: "deepseek",
    model: "deepseek:deepseek-chat",
    apiKey: "sk-test",
  }),
};

describe("ensureEnvoyTerminalSession", () => {
  it("requires a project folder", async () => {
    const { manager } = fakeManager();
    const result = await ensureEnvoyTerminalSession(manager, deps, {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("needs_project");
  });

  it("spawns the TUI with provider/model + the project cwd + role", async () => {
    const { manager, created, createTerminalSession } = fakeManager();
    const result = await ensureEnvoyTerminalSession(manager, deps, {
      projectPath: dir,
    });
    expect(result.ok).toBe(true);
    expect(createTerminalSession).toHaveBeenCalled();
    const params = created[0];
    expect(params?.role).toBe("envoy-harness");
    expect(params?.cwd).toBe(dir);
    expect(params?.args).toContain("--provider");
    expect(params?.args).toContain("deepseek");
    expect(params?.args).toContain("--model");
    // The bare model name (not "<provider>:<model>").
    expect(params?.args).toContain("deepseek-chat");
    expect(params?.args).not.toContain("deepseek:deepseek-chat");
    expect((params?.env as Record<string, string>).DEEPSEEK_API_KEY).toBe(
      "sk-test",
    );
    expect(deps.saveProjectPath).toHaveBeenCalledWith(dir);
  });

  it("reuses a running session for the same folder", async () => {
    const { manager, findSessionByCwd, createTerminalSession } = fakeManager();
    findSessionByCwd.mockReturnValue({
      sessionId: "envoy-existing",
      title: "Envoy · x",
      cwd: dir,
      state: "running",
    });
    const result = await ensureEnvoyTerminalSession(manager, deps, {
      projectPath: dir,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session?.sessionId).toBe("envoy-existing");
    expect(createTerminalSession).not.toHaveBeenCalled();
  });

  it("passes the OpenAI-compatible endpoint into the spawn env", async () => {
    const { manager, created } = fakeManager();
    await ensureEnvoyTerminalSession(
      manager,
      {
        ...deps,
        resolveRuntimeConfig: async () => ({
          provider: "openai",
          model: "openai:MiniMax-M3",
          apiKey: "sk-test",
          endpoint: "https://api.minimaxi.com/v1",
        }),
      },
      { projectPath: dir },
    );
    const params = created[0];
    expect((params?.env as Record<string, string>).OPENAI_API_KEY).toBe(
      "sk-test",
    );
    expect((params?.env as Record<string, string>).OPENAI_BASE_URL).toBe(
      "https://api.minimaxi.com/v1",
    );
  });
});

describe("envoySessionTitle + TUI bin resolution", () => {
  it("titles sessions `Envoy · <folder>`", () => {
    expect(envoySessionTitle("/projects/my-app")).toBe("Envoy · my-app");
  });

  it("honors ENVOY_HARNESS_TUI_BIN", () => {
    expect(resolveEnvoyHarnessTuiBin()).toBe("/fake/envoy-harness-tui.js");
  });

  it("resolves TUI from ENVOYMESH_NODE_BUNDLE_DIR node_modules", async () => {
    const prev = process.env.ENVOY_HARNESS_TUI_BIN;
    const prevBundle = process.env.ENVOYMESH_NODE_BUNDLE_DIR;
    delete process.env.ENVOY_HARNESS_TUI_BIN;
    const bundle = await mkdtemp(join(tmpdir(), "envoy-tui-bundle-"));
    const bin = join(
      bundle,
      "node_modules/@envoymesh/envoy-harness-tui/dist/bin.js",
    );
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(join(bundle, "node_modules/@envoymesh/envoy-harness-tui/dist"), {
      recursive: true,
    });
    await writeFile(bin, "// fake tui\n");
    process.env.ENVOYMESH_NODE_BUNDLE_DIR = bundle;
    try {
      expect(resolveEnvoyHarnessTuiBin()).toBe(bin);
    } finally {
      if (prev !== undefined) process.env.ENVOY_HARNESS_TUI_BIN = prev;
      else delete process.env.ENVOY_HARNESS_TUI_BIN;
      if (prevBundle !== undefined) process.env.ENVOYMESH_NODE_BUNDLE_DIR = prevBundle;
      else delete process.env.ENVOYMESH_NODE_BUNDLE_DIR;
      await rm(bundle, { recursive: true, force: true });
    }
  });
});
