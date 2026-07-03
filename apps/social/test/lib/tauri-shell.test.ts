/** @vitest-environment jsdom */
import { describe, expect, it, vi, afterEach } from "vitest";
import { isTauriShell, restartTauriNodeProcess } from "../../src/lib/tauri-shell.js";

describe("tauri-shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as Window & { __TAURI__?: unknown }).__TAURI__;
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("isTauriShell is false without Tauri globals", () => {
    expect(isTauriShell()).toBe(false);
  });

  it("isTauriShell is true when invoke is present", () => {
    (window as Window & { __TAURI__?: { core?: { invoke?: () => Promise<void> } } }).__TAURI__ = {
      core: { invoke: vi.fn().mockResolvedValue(undefined) },
    };
    expect(isTauriShell()).toBe(true);
  });

  it("isTauriShell is true when __TAURI_INTERNALS__.invoke is present", () => {
    (window as Window & { __TAURI_INTERNALS__?: { invoke?: () => Promise<void> } }).__TAURI_INTERNALS__ = {
      invoke: vi.fn().mockResolvedValue(undefined),
    };
    expect(isTauriShell()).toBe(true);
  });

  it("restartTauriNodeProcess invokes restart_node_process", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as Window & { __TAURI__?: { core?: { invoke?: typeof invoke } } }).__TAURI__ = {
      core: { invoke },
    };
    const result = await restartTauriNodeProcess();
    expect(result).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledWith("restart_node_process");
  });

  it("restartTauriNodeProcess returns not-tauri outside shell", async () => {
    const result = await restartTauriNodeProcess();
    expect(result).toEqual({ ok: false, reason: "not-tauri" });
  });
});
