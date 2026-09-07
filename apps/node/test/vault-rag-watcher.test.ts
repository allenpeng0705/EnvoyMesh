import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createVaultRagWatcher,
  shouldIgnoreVaultWatchPath,
} from "../src/vault-rag-watcher.js";

describe("vault-rag-watcher", () => {
  const stops: Array<() => void> = [];
  afterEach(() => {
    for (const stop of stops.splice(0)) stop();
  });

  it("ignores .envoy / temp / junk paths", () => {
    const vault = "/tmp/vault-root";
    expect(shouldIgnoreVaultWatchPath(vault, ".envoy/meta.json")).toBe(true);
    expect(shouldIgnoreVaultWatchPath(vault, "temp/staging.bin")).toBe(true);
    expect(shouldIgnoreVaultWatchPath(vault, "notes/.DS_Store")).toBe(true);
    expect(shouldIgnoreVaultWatchPath(vault, "notes/hello.md")).toBe(false);
    expect(shouldIgnoreVaultWatchPath(vault, "chat/out/a1/voice-note.wav")).toBe(true);
    expect(shouldIgnoreVaultWatchPath(vault, "profile/thumbnail.jpg")).toBe(true);
  });

  it("debounces bursts into one onChange", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoy-vault-watch-"));
    await mkdir(join(dir, "notes"), { recursive: true });
    const onChange = vi.fn();
    const handle = createVaultRagWatcher({
      vaultDir: dir,
      debounceMs: 80,
      onChange,
    });
    stops.push(handle.stop);

    await writeFile(join(dir, "notes", "a.md"), "# a\n", "utf8");
    await writeFile(join(dir, "notes", "b.md"), "# b\n", "utf8");
    await new Promise((r) => setTimeout(r, 200));
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(3);
  });
});
