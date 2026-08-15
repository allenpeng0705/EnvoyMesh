import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const stampScript = join(repoRoot, "scripts/openclaw-stage-stamp.mjs");

function stamp(dir: string): string {
  return execFileSync("node", [stampScript, dir], { encoding: "utf8" }).trim();
}

describe("openclaw-stage-stamp", () => {
  it("changes when package.json / entry.js change", async () => {
    const dir = await mkdtemp(join(tmpdir(), "oc-stamp-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "openclaw", version: "1.0.0" }));
    await writeFile(join(dir, "openclaw.mjs"), "export {}\n");
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "dist/entry.js"), "export const a = 1\n");

    const a = stamp(dir);
    expect(a).toContain("v=1.0.0");
    expect(a).toContain("entry=");

    await writeFile(join(dir, "dist/entry.js"), "export const a = 2\n");
    const b = stamp(dir);
    expect(b).not.toBe(a);
    expect(b).toContain("v=1.0.0");

    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "openclaw", version: "1.0.1" }));
    const c = stamp(dir);
    expect(c).not.toBe(b);
    expect(c).toContain("v=1.0.1");
  });

  it("is stable for identical trees", async () => {
    const dir = await mkdtemp(join(tmpdir(), "oc-stamp-stable-"));
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "openclaw", version: "9.9.9" }));
    await writeFile(join(dir, "openclaw.mjs"), "console.log(1)\n");
    await mkdir(join(dir, "dist"), { recursive: true });
    await writeFile(join(dir, "dist/entry.js"), "// entry\n");
    expect(stamp(dir)).toBe(stamp(dir));
  });
});
