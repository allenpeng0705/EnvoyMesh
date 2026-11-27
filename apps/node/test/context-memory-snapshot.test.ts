import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContextMemoryRuntime } from "../src/context-memory-runtime.js";

describe("context-memory snapshot.enabled", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("reports enabled true after applySettings(enabled)", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-snap-"));
    dirs.push(profile);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => undefined,
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    expect(rt.snapshot().enabled).toBe(true);
    expect(rt.snapshot().status).toBe("ready");
  });
});
