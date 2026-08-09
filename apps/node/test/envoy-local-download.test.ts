import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadFile,
  extractArchive,
  findExecutable,
  sha256File,
} from "../src/envoy-local-download.js";

const execFileAsync = promisify(execFile);

describe("envoy-local-download", () => {
  const temps: string[] = [];

  afterEach(async () => {
    vi.unstubAllGlobals();
    const { rm } = await import("node:fs/promises");
    for (const dir of temps.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function tempDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "envoy-local-dl-"));
    temps.push(dir);
    return dir;
  }

  it("findExecutable locates a nested llama-server binary", async () => {
    const root = await tempDir();
    const nested = join(root, "bin", "release");
    await mkdir(nested, { recursive: true });
    const exe = join(nested, "llama-server");
    await writeFile(exe, "#!/bin/sh\n", { mode: 0o755 });
    expect(await findExecutable(root, ["llama-server"])).toBe(exe);
  });

  it("sha256File matches node crypto digest", async () => {
    const root = await tempDir();
    const path = join(root, "a.bin");
    const body = Buffer.from("envoy-local-checksum");
    await writeFile(path, body);
    const expected = createHash("sha256").update(body).digest("hex");
    expect(await sha256File(path)).toBe(expected);
  });

  it("downloadFile writes atomically and cleans .part on failure", async () => {
    const root = await tempDir();
    const dest = join(root, "asset.bin");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        body: {
          getReader() {
            let n = 0;
            return {
              async read() {
                if (n === 0) {
                  n += 1;
                  return { done: false, value: new Uint8Array([1, 2, 3]) };
                }
                return { done: true, value: undefined };
              },
            };
          },
        },
        headers: { get: () => "3" },
      })),
    );

    await downloadFile({ url: "https://example.test/a.bin", destPath: dest });
    expect(await readFile(dest)).toEqual(Buffer.from([1, 2, 3]));
    const { existsSync } = await import("node:fs");
    expect(existsSync(`${dest}.part`)).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 503,
        body: null,
        headers: { get: () => null },
      })),
    );
    await expect(
      downloadFile({ url: "https://example.test/fail.bin", destPath: join(root, "fail.bin") }),
    ).rejects.toThrow(/HTTP 503/);
  });

  it("extractArchive unpacks tar.gz into destDir", async () => {
    const root = await tempDir();
    const srcDir = join(root, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "hello.txt"), "hi");
    const archive = join(root, "a.tar.gz");
    await execFileAsync("tar", ["-czf", archive, "-C", srcDir, "."]);
    const dest = join(root, "out");
    await extractArchive({ archivePath: archive, destDir: dest });
    expect(await readFile(join(dest, "hello.txt"), "utf8")).toBe("hi");
  });
});
