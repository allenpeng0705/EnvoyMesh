import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createContextMemoryRuntime } from "../src/context-memory-runtime.js";
import type { OvManagedDriver } from "../src/context-memory-ov-managed.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function waitForStatus(
  rt: { status: () => string },
  want: string,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (rt.status() === want) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`timed out waiting for status=${want} (got ${rt.status()})`);
}

describe("context-memory managed OpenViking (OV-DL)", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("blank endpoint → installing then ready; disable stops driver", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-ovdl-"));
    dirs.push(profile);
    let stopCount = 0;
    const driver: OvManagedDriver = {
      async ensureRunning({ signal, onProgress }) {
        onProgress({ phase: "download", progress: 0.2 });
        await new Promise((r) => setTimeout(r, 40));
        if (signal.aborted) {
          const err = new Error("cancelled");
          err.name = "AbortError";
          throw err;
        }
        onProgress({ phase: "start", progress: 0.8 });
        return { endpoint: "http://ov.managed.test", port: 19001, backend: "docker" };
      },
      async stop() {
        stopCount++;
      },
    };
    const ovFetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("ov.managed.test") && (u.endsWith("/ready") || u.endsWith("/health"))) {
        return jsonResponse(200, { ready: true });
      }
      return jsonResponse(404, {});
    });

    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "openviking" }),
      ovFetch: ovFetch as typeof fetch,
      ovManagedDriver: driver,
    });

    const applyP = rt.applySettings({ enabled: true, backend: "openviking" });
    await applyP;
    expect(rt.status()).toBe("installing");
    expect(rt.snapshot().managed).toBe(true);
    expect(rt.snapshot().installPhase).toBeTruthy();

    await waitForStatus(rt, "ready");
    expect(rt.snapshot().summary).toMatch(/managed/i);
    expect(await rt.recallForTurn("x")).toBe(""); // search not stubbed → soft empty after throw... actually search throws 404
    // soft-fail empty is fine

    // Poll/sync must not restart while ready
    await rt.applySettings({ enabled: true, backend: "openviking" });
    expect(rt.status()).toBe("ready");

    await rt.applySettings({ enabled: false, backend: "openviking" });
    expect(rt.status()).toBe("off");
    expect(stopCount).toBeGreaterThan(0);
  });

  it("cancel mid-install on disable", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-ovdl-cancel-"));
    dirs.push(profile);
    let ensureStarted = false;
    let sawAbort = false;
    const driver: OvManagedDriver = {
      async ensureRunning({ signal }) {
        ensureStarted = true;
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, 2000);
          signal.addEventListener(
            "abort",
            () => {
              sawAbort = true;
              clearTimeout(t);
              const err = new Error("cancelled");
              err.name = "AbortError";
              reject(err);
            },
            { once: true },
          );
        });
        return { endpoint: "http://ov.managed.test", port: 1, backend: "docker" };
      },
      async stop() {},
    };
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "openviking" }),
      ovManagedDriver: driver,
    });
    await rt.applySettings({ enabled: true, backend: "openviking" });
    expect(rt.status()).toBe("installing");
    expect(ensureStarted).toBe(true);
    await rt.applySettings({ enabled: false });
    expect(rt.status()).toBe("off");
    expect(sawAbort).toBe(true);
  });

  it("error stays until retryManagedInstall", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-ovdl-retry-"));
    dirs.push(profile);
    let attempts = 0;
    const driver: OvManagedDriver = {
      async ensureRunning() {
        attempts++;
        if (attempts === 1) throw new Error("simulated download failure");
        return { endpoint: "http://ov.managed.test", port: 19002, backend: "venv" };
      },
      async stop() {},
    };
    const ovFetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("ov.managed.test") && (u.endsWith("/ready") || u.endsWith("/health"))) {
        return jsonResponse(200, { ready: true });
      }
      return jsonResponse(404, {});
    });
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "openviking" }),
      ovFetch: ovFetch as typeof fetch,
      ovManagedDriver: driver,
    });
    await rt.applySettings({ enabled: true, backend: "openviking" });
    await waitForStatus(rt, "error");
    expect(attempts).toBe(1);
    await rt.applySettings({ enabled: true, backend: "openviking" });
    expect(rt.status()).toBe("error");
    expect(attempts).toBe(1);

    await rt.retryManagedInstall();
    expect(rt.status()).toBe("installing");
    await waitForStatus(rt, "ready");
    expect(attempts).toBe(2);
  });

  it("BYO with endpoint never uses managed driver", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-ovdl-byo-"));
    dirs.push(profile);
    const ensure = vi.fn();
    const driver: OvManagedDriver = {
      ensureRunning: ensure,
      async stop() {},
    };
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({
        enabled: true,
        backend: "openviking",
        endpoint: "http://127.0.0.1:1",
      }),
      ovManagedDriver: driver,
    });
    await rt.applySettings({
      enabled: true,
      backend: "openviking",
      endpoint: "http://127.0.0.1:1",
    });
    expect(rt.status()).toBe("error");
    expect(ensure).not.toHaveBeenCalled();
    expect(rt.snapshot().managed).toBe(false);
  });

  it("stale install completion cannot overwrite a newer attempt", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-ovdl-stale-"));
    dirs.push(profile);
    let attempts = 0;
    const driver: OvManagedDriver = {
      async ensureRunning({ signal }) {
        attempts++;
        if (attempts === 1) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 5_000);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                const err = new Error("cancelled");
                err.name = "AbortError";
                reject(err);
              },
              { once: true },
            );
          });
          return { endpoint: "http://ov.stale.test", port: 1, backend: "docker" };
        }
        return { endpoint: "http://ov.fresh.test", port: 2, backend: "docker" };
      },
      async stop() {},
    };
    const ovFetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("ov.fresh.test") && (u.endsWith("/ready") || u.endsWith("/health"))) {
        return jsonResponse(200, { ready: true });
      }
      if (u.includes("ov.stale.test")) {
        // If stale ever probed, fail loudly via wrong status later.
        return jsonResponse(503, { needs_models: true });
      }
      return jsonResponse(404, {});
    });
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "openviking" }),
      ovFetch: ovFetch as typeof fetch,
      ovManagedDriver: driver,
    });
    await rt.applySettings({ enabled: true, backend: "openviking" });
    expect(rt.status()).toBe("installing");
    await rt.retryManagedInstall();
    expect(rt.status()).toBe("installing");
    await waitForStatus(rt, "ready");
    expect(attempts).toBe(2);
    expect(rt.status()).toBe("ready");
    expect(rt.snapshot().summary).toMatch(/managed/i);
  });
});

describe("execFileAbortable", () => {
  it("kills a long-running command on abort", async () => {
    const { execFileAbortable } = await import("../src/context-memory-ov-managed.js");
    const ac = new AbortController();
    const started = Date.now();
    const run = execFileAbortable(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], {
      signal: ac.signal,
      timeoutMs: 60_000,
    });
    await new Promise((r) => setTimeout(r, 50));
    ac.abort();
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
