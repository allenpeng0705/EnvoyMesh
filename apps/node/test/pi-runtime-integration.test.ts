/**
 * Phase 49 — Pi runtime integration test (real subprocess).
 *
 * Spawns the actual bundled Pi CLI in RPC mode and verifies the readiness
 * probe + JSONL framing work against the real binary (which emits a
 * "Warning: Model ... not found" non-JSON preamble line on stdout).
 *
 * Gated on RUN_PI_TESTS=1 because:
 *   1. It needs the staged Pi sidecar at apps/tauri/src-tauri/resources/pi/
 *      (run `bash scripts/stage-tauri-pi-bundle.sh` first).
 *   2. It does NOT need a real API key — the readiness probe + framing are
 *      what we're testing, not model inference. We use a fake key; Pi will
 *      emit the model-warning line and then block on stdin, which is
 *      exactly the case the readiness fix handles.
 *
 * Run with: RUN_PI_TESTS=1 npx vitest run apps/node/test/pi-runtime-integration.test.ts
 */
import { describe, it, expect, beforeEach } from "vitest"
import { existsSync, rmSync } from "node:fs"
import { join } from "node:path"
import { PiRuntime, discoverPiCli, buildPiSpawnConfig } from "../src/pi-runtime.js"

const RUN_PI_TESTS = process.env.RUN_PI_TESTS === "1"
const describePi = RUN_PI_TESTS ? describe : describe.skip

const REPO_ROOT = join(__dirname, "..", "..", "..")

describePi("PiRuntime integration (real Pi subprocess)", () => {
  let discovery: { cliPath: string; version: string } | null

  beforeEach(() => {
    discovery = discoverPiCli(REPO_ROOT)
    if (!discovery) {
      throw new Error(
        "Pi sidecar not staged — run `bash scripts/stage-tauri-pi-bundle.sh` before this test.",
      )
    }
  })

  it("discovers the bundled Pi CLI at apps/tauri/src-tauri/resources/pi/", () => {
    expect(discovery).not.toBeNull()
    expect(existsSync(discovery!.cliPath)).toBe(true)
    expect(discovery!.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it("becomes ready even when Pi emits a non-JSON 'Warning:' preamble line", async () => {
    // This is the regression test for the readiness bug. With a fake API
    // key + a model name Pi doesn't recognize, Pi emits:
    //   "Warning: Model "..." not found for provider "anthropic". Using custom model id."
    // on stdout, then blocks on stdin. The old probe would hang waiting
    // for a JSON line and time out. The fix treats alive+quiet as ready.
    const spawnConfig = buildPiSpawnConfig(
      { mode: "anthropic-compatible", apiKey: "sk-fake-test-key", modelName: "claude-test-model" },
    )!
    const runtime = new PiRuntime({
      cliPath: discovery!.cliPath,
      version: discovery!.version,
      spawnConfig,
      readyTimeoutMs: 8_000,
      log: () => { /* silence noisy logs in test output */ },
    })

    try {
      // Should resolve within the grace window (~1s), not time out at 8s.
      const start = Date.now()
      await runtime.start()
      const elapsed = Date.now() - start
      expect(runtime.isReady).toBe(true)
      // Sanity: grace path should be well under the deadline.
      expect(elapsed).toBeLessThan(5_000)
    } finally {
      await runtime.stop()
    }
  })

  it("captures the non-JSON warning in the line buffer for diagnostics", async () => {
    const spawnConfig = buildPiSpawnConfig(
      { mode: "anthropic-compatible", apiKey: "sk-fake-test-key", modelName: "claude-test-model" },
    )!
    const warnings: string[] = []
    const runtime = new PiRuntime({
      cliPath: discovery!.cliPath,
      version: discovery!.version,
      spawnConfig,
      readyTimeoutMs: 8_000,
      // Pi emits the model-not-found warning on stderr, which the runtime
      // logs with the "stderr:" prefix. Capture both stdout-non-JSON and
      // stderr lines for the assertion.
      log: (_level, msg) => {
        if (msg.includes("not found") || msg.includes("custom model") || msg.includes("non-JSON")) {
          warnings.push(msg)
        }
      },
    })

    try {
      await runtime.start()
      // Pi should have emitted the model-not-found warning by now.
      expect(warnings.some((w) => w.includes("not found") || w.includes("custom model"))).toBe(true)
    } finally {
      await runtime.stop()
    }
  })

  it("stop() cleanly terminates the child process", async () => {
    const spawnConfig = buildPiSpawnConfig(
      { mode: "anthropic-compatible", apiKey: "sk-fake-test-key", modelName: "claude-test-model" },
    )!
    const runtime = new PiRuntime({
      cliPath: discovery!.cliPath,
      version: discovery!.version,
      spawnConfig,
      readyTimeoutMs: 8_000,
      log: () => {},
    })
    await runtime.start()
    expect(runtime.pid).toBeDefined()
    await runtime.stop()
    expect(runtime.isReady).toBe(false)
    expect(runtime.pid).toBeUndefined()
  })
})

// When the test is skipped, surface why in the output.
if (!RUN_PI_TESTS) {
  describe.skip("PiRuntime integration (real Pi subprocess) — set RUN_PI_TESTS=1 to run", () => {
    it("would spawn real Pi and verify readiness", () => {})
  })
}
