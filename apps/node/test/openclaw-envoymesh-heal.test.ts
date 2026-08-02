import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureOpenClawEnvoyMeshExtension } from "../src/openclaw-gateway-spawn.js";

const dirs: string[] = [];

afterEach(async () => {
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true });
  }
});

async function tempDir(prefix: string): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

async function writeIndex(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.js"), "export default {}\n", "utf8");
  await writeFile(join(dir, "openclaw.plugin.json"), "{}\n", "utf8");
}

describe("ensureOpenClawEnvoyMeshExtension", () => {
  it("reports present when both roots already have index.js", async () => {
    const oc = await tempDir("oc-heal-");
    await writeIndex(join(oc, "extensions", "envoymesh"));
    await writeIndex(join(oc, "dist", "extensions", "envoymesh"));
    const r = ensureOpenClawEnvoyMeshExtension(oc);
    expect(r.ok).toBe(true);
    expect(r.source).toBe("present");
  });

  it("restores from sibling seed when extensions/envoymesh is missing", async () => {
    const root = await tempDir("oc-seed-");
    const oc = join(root, "openclaw");
    const seed = join(root, "openclaw-envoymesh");
    await mkdir(oc, { recursive: true });
    await writeIndex(seed);

    const r = ensureOpenClawEnvoyMeshExtension(oc);
    expect(r.ok).toBe(true);
    expect(r.source).toContain("openclaw-envoymesh");
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(oc, "extensions", "envoymesh", "index.js"))).toBe(true);
    expect(existsSync(join(oc, "dist", "extensions", "envoymesh", "index.js"))).toBe(true);
  });

  it("mirrors dist/extensions into extensions when seed is absent", async () => {
    const oc = await tempDir("oc-mirror-");
    await writeIndex(join(oc, "dist", "extensions", "envoymesh"));
    const r = ensureOpenClawEnvoyMeshExtension(oc);
    expect(r.ok).toBe(true);
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(oc, "extensions", "envoymesh", "index.js"))).toBe(true);
  });

  it("fails clearly when nothing can be restored", async () => {
    const oc = await tempDir("oc-empty-");
    await mkdir(oc, { recursive: true });
    const r = ensureOpenClawEnvoyMeshExtension(oc);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no envoymesh/i);
  });
});
