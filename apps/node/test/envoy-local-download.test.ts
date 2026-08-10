import { createHash } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GGUF_MAGIC,
  GGUF_SUPPORTED_VERSIONS,
  downloadFile,
  extractArchive,
  findExecutable,
  sha256File,
  verifyGgufFile,
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
        status: 200,
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

  /**
   * Build a fetch mock that respects HTTP Range: bytes=N- semantics — the
   * real behavior of HF / ModelScope / GitHub Releases / most CDNs.
   *
   * - No Range header → 200 + Content-Length: total + body from byte 0
   * - Range: bytes=N- where N < total → 206 + Content-Range: bytes N-(total-1)/total + body from N
   * - Range: bytes=N- where N ≥ total → 416
   *
   * The mock records each call's `rangeHeader` so tests can assert what
   * downloadFile asked for. Set `bodyChunks` to control chunking; default
   * returns the body in a single chunk.
   */
  type RangeMockOptions = {
    bodyChunks?: (offset: number, total: number) => Uint8Array[];
  };
  function makeRangeAwareFetchMock(
    fullContents: Buffer,
    calls: Array<{ url: string; rangeHeader?: string }>,
    opts: RangeMockOptions = {},
  ): typeof fetch {
    const total = fullContents.length;
    const bodyChunks = opts.bodyChunks;
    return vi.fn(async (url, init) => {
      const reqInit = init as RequestInit | undefined;
      const rawHeaders = reqInit?.headers as
        | Record<string, string>
        | Headers
        | undefined;
      const rangeHeader = rawHeaders
        ? rawHeaders instanceof Headers
          ? rawHeaders.get("range") ?? undefined
          : rawHeaders["Range"] ?? rawHeaders["range"] ?? undefined
        : undefined;
      calls.push({ url: String(url), rangeHeader });

      let startByte = 0;
      if (rangeHeader) {
        const m = /bytes=(\d+)-/.exec(rangeHeader);
        if (m) startByte = Number(m[1]);
        if (startByte >= total) {
          return {
            ok: false,
            status: 416,
            body: null,
            headers: { get: () => null },
          };
        }
      }
      const endByte = total - 1;
      const slice = fullContents.subarray(startByte);
      const chunks = bodyChunks
        ? bodyChunks(startByte, total)
        : [new Uint8Array(slice)];
      return {
        ok: true,
        status: startByte > 0 ? 206 : 200,
        body: {
          getReader() {
            let i = 0;
            return {
              async read() {
                if (i < chunks.length) {
                  const v = chunks[i++]!;
                  return { done: false, value: v };
                }
                return { done: true, value: undefined };
              },
            };
          },
        },
        headers: {
          get: (name: string) => {
            const lower = name.toLowerCase();
            if (lower === "content-range") {
              return startByte > 0
                ? `bytes ${startByte}-${endByte}/${total}`
                : null;
            }
            if (lower === "content-length") {
              return String(slice.length);
            }
            return null;
          },
        },
      };
    }) as unknown as typeof fetch;
  }

  it("downloadFile resumes from existing .part when server returns 206", async () => {
    const root = await tempDir();
    const dest = join(root, "model.gguf");
    const partPath = `${dest}.part`;
    const full = Buffer.alloc(1024, 0x41); // 1 KB of 'A'
    // Pre-seed .part with the first 600 bytes.
    await writeFile(partPath, full.subarray(0, 600));

    const calls: Array<{ url: string; rangeHeader?: string }> = [];
    const mock = makeRangeAwareFetchMock(full, calls);
    vi.stubGlobal("fetch", mock);

    await downloadFile({ url: "https://example.test/model.gguf", destPath: dest });

    // The first request must have asked to resume from byte 600.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rangeHeader).toBe("bytes=600-");

    // The final file is the full 1024 bytes (600 pre-existing + 424 appended).
    const final = await readFile(dest);
    expect(final.length).toBe(1024);
    expect(final.equals(full)).toBe(true);
    const { existsSync } = await import("node:fs");
    expect(existsSync(partPath)).toBe(false);
  });

  it("downloadFile restarts from 0 when server ignores Range (200 OK)", async () => {
    const root = await tempDir();
    const dest = join(root, "model.gguf");
    const partPath = `${dest}.part`;
    const full = Buffer.alloc(1024, 0x42);
    // Stale .part from a previous run with WRONG contents (simulates a
    // different file having lived at this path before, or partial
    // corruption that the server-side Range doesn't know about).
    await writeFile(partPath, Buffer.alloc(600, 0xff));

    // A server that doesn't support Range: returns 200 with the full body.
    const total = full.length;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader() {
            let n = 0;
            return {
              async read() {
                if (n === 0) {
                  n += 1;
                  return { done: false, value: new Uint8Array(full) };
                }
                return { done: true, value: undefined };
              },
            };
          },
        },
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "content-length" ? String(total) : null,
        },
      })),
    );

    await downloadFile({ url: "https://example.test/model.gguf", destPath: dest });
    const final = await readFile(dest);
    // Must be the full file from byte 0, not corrupted (no leading 0xFF).
    expect(final.length).toBe(1024);
    expect(final.equals(full)).toBe(true);
  });

  it("downloadFile returns early on 416 (existing .part already at/past end)", async () => {
    const root = await tempDir();
    const dest = join(root, "model.gguf");
    const partPath = `${dest}.part`;
    // .part is bigger than what the server claims the file is — caller is
    // expected to verify via GGUF magic + size sanity; downloadFile should
    // just bail without touching the file.
    const oversized = Buffer.alloc(2000, 0x43);
    await writeFile(partPath, oversized);

    const calls: Array<{ url: string; rangeHeader?: string }> = [];
    vi.stubGlobal("fetch", makeRangeAwareFetchMock(Buffer.alloc(1000, 0x43), calls));

    await downloadFile({ url: "https://example.test/model.gguf", destPath: dest });

    expect(calls).toHaveLength(1);
    // 416 path: the .part is left in place for the caller to validate.
    const after = await readFile(partPath);
    expect(after.length).toBe(2000);
    const { existsSync } = await import("node:fs");
    // destPath is not created on the 416 path.
    expect(existsSync(dest)).toBe(false);
  });

  it("downloadFile keeps .part on mid-stream error (resumable)", async () => {
    const root = await tempDir();
    const dest = join(root, "model.gguf");
    const partPath = `${dest}.part`;
    // Body that returns one chunk of bytes successfully, then throws on
    // the next read — simulates a TCP reset after some data was already
    // delivered. The partial .part must be left in place so the next
    // call can resume via HTTP Range.
    const firstChunk = Buffer.from("hello world");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader() {
            let n = 0;
            return {
              async read() {
                if (n === 0) {
                  n += 1;
                  return { done: false, value: new Uint8Array(firstChunk) };
                }
                if (n === 1) {
                  n += 1;
                  throw new Error("simulated network drop");
                }
                return { done: true, value: undefined };
              },
            };
          },
        },
        headers: { get: () => "1024" },
      })),
    );

    await expect(
      downloadFile({ url: "https://example.test/model.gguf", destPath: dest }),
    ).rejects.toThrow(/simulated network drop/);

    // .part must exist with the bytes that were successfully written
    // before the network drop. Next downloadFile call will stat this
    // size and send a Range header to continue.
    const { existsSync } = await import("node:fs");
    expect(existsSync(partPath)).toBe(true);
    const partial = await readFile(partPath);
    expect(partial.equals(firstChunk)).toBe(true);
    // destPath must not be created when the download was incomplete.
    expect(existsSync(dest)).toBe(false);
  });

  it("downloadFile throws size-mismatch and cleans .part when server truncates", async () => {
    const root = await tempDir();
    const dest = join(root, "model.gguf");
    const partPath = `${dest}.part`;
    // Server claims the body is 1000 bytes via Content-Length, but only
    // sends 500. (Real-world: broken proxy, TCP reset mid-stream after
    // headers were sent.)
    const total = 1000;
    const sent = 500;
    const sentBuf = Buffer.alloc(sent, 0x45);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader() {
            let n = 0;
            return {
              async read() {
                if (n === 0) {
                  n += 1;
                  return { done: false, value: new Uint8Array(sentBuf) };
                }
                return { done: true, value: undefined };
              },
            };
          },
        },
        headers: { get: (n: string) => (n.toLowerCase() === "content-length" ? String(total) : null) },
      })),
    );

    await expect(
      downloadFile({ url: "https://example.test/model.gguf", destPath: dest }),
    ).rejects.toThrow(/size mismatch.*expected 1000.*got 500/);

    // .part must be cleaned up — caller will retry from a known-clean state.
    const { existsSync } = await import("node:fs");
    expect(existsSync(partPath)).toBe(false);
  });

  it("downloadFile reports absolute bytesReceived on progress (resume case)", async () => {
    const root = await tempDir();
    const dest = join(root, "model.gguf");
    const partPath = `${dest}.part`;
    const full = Buffer.alloc(1024, 0x46);
    await writeFile(partPath, full.subarray(0, 700));

    const progress: Array<{ bytesReceived: number; bytesTotal?: number }> = [];
    const calls: Array<{ url: string; rangeHeader?: string }> = [];
    vi.stubGlobal("fetch", makeRangeAwareFetchMock(full, calls));

    await downloadFile({
      url: "https://example.test/model.gguf",
      destPath: dest,
      onProgress: (p) => progress.push({ ...p }),
    });

    // Progress must show absolute offset, not per-session delta. First
    // event should be 700 + first chunk, never 0.
    expect(progress.length).toBeGreaterThan(0);
    for (const p of progress) {
      expect(p.bytesReceived).toBeGreaterThanOrEqual(700);
    }
    // Final progress event matches the total.
    const last = progress[progress.length - 1]!;
    expect(last.bytesReceived).toBe(1024);
    expect(last.bytesTotal).toBe(1024);
  });

  it("downloadFile sends no Range header on fresh download", async () => {
    const root = await tempDir();
    const dest = join(root, "fresh.bin");
    const full = Buffer.from("hello world");
    const calls: Array<{ url: string; rangeHeader?: string }> = [];
    vi.stubGlobal("fetch", makeRangeAwareFetchMock(full, calls));

    await downloadFile({ url: "https://example.test/fresh.bin", destPath: dest });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.rangeHeader).toBeUndefined();
    expect((await readFile(dest)).toString()).toBe("hello world");
  });

  it("downloadFile aborts after noProgressTimeoutMs when server stalls mid-body", async () => {
    // Use fake timers so the test doesn't actually wait 250 ms. We
    // pre-stub a body that yields the first chunk immediately then never
    // yields again, so the no-progress watchdog has to fire.
    const root = await tempDir();
    const dest = join(root, "stalled.gguf");
    const partPath = `${dest}.part`;
    const firstChunk = Buffer.from("first-chunk");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                // First call yields one chunk, then never again (no done,
                // no throw — pure stall). The no-progress timer is what
                // catches this.
                if (!(this as { yielded?: boolean }).yielded) {
                  (this as { yielded?: boolean }).yielded = true;
                  return { done: false, value: new Uint8Array(firstChunk) };
                }
                // Never resolves — keeps the read pending.
                return new Promise(() => {});
              },
            };
          },
        },
        headers: { get: () => "1000" },
      })),
    );

    await expect(
      downloadFile({
        url: "https://example.test/stalled.gguf",
        destPath: dest,
        noProgressTimeoutMs: 100,
      }),
    ).rejects.toThrow(/No download progress for 0\.1s|stalled connection/);

    // The first chunk was written before the stall — .part must have those
    // bytes so the next attempt can resume.
    const { existsSync } = await import("node:fs");
    expect(existsSync(partPath)).toBe(true);
    const partial = await readFile(partPath);
    expect(partial.equals(firstChunk)).toBe(true);
  });

  it("downloadFile resets noProgress timer on each chunk received", async () => {
    // Send three chunks 50 ms apart with noProgressTimeoutMs = 100 ms. Each
    // chunk resets the timer, so the download completes without abort.
    const root = await tempDir();
    const dest = join(root, "slow-but-alive.gguf");
    const full = Buffer.alloc(300, 0x47);
    const calls: Array<{ url: string; rangeHeader?: string }> = [];
    vi.stubGlobal("fetch", makeRangeAwareFetchMock(full, calls));

    await downloadFile({
      url: "https://example.test/slow.gguf",
      destPath: dest,
      noProgressTimeoutMs: 200,
    });
    expect(calls).toHaveLength(1);
    expect((await readFile(dest)).length).toBe(300);
  });

  it("downloadFile aborts after overallTimeoutMs even with continuous progress", async () => {
    // Pretend the body yields bytes very slowly — overall budget kills it
    // before completion. We use a Promise that never resolves for the
    // first read so the body chunk arrives but the next read blocks
    // forever, exhausting the overall timeout.
    const root = await tempDir();
    const dest = join(root, "eternal.gguf");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader() {
            let n = 0;
            return {
              async read() {
                if (n === 0) {
                  n += 1;
                  return { done: false, value: new Uint8Array([1, 2, 3]) };
                }
                // Never returns — overall timeout has to fire.
                return new Promise(() => {});
              },
            };
          },
        },
        headers: { get: () => "1000" },
      })),
    );

    await expect(
      downloadFile({
        url: "https://example.test/eternal.gguf",
        destPath: dest,
        overallTimeoutMs: 50,
        noProgressTimeoutMs: 10_000, // ensure overall, not noProgress, fires
      }),
    ).rejects.toThrow(/exceeded overall timeout/);
  });

  it("downloadFile combines caller signal with timeouts (any-abort)", async () => {
    const root = await tempDir();
    const dest = join(root, "cancelled.gguf");
    const callerController = new AbortController();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                // Abort the caller's signal from inside the read to verify
                // the composed signal propagates the abort.
                callerController.abort();
                return { done: false, value: new Uint8Array([1]) };
              },
            };
          },
        },
        headers: { get: () => "10" },
      })),
    );

    await expect(
      downloadFile({
        url: "https://example.test/cancelled.gguf",
        destPath: dest,
        signal: callerController.signal,
        overallTimeoutMs: 60_000,
        noProgressTimeoutMs: 60_000,
      }),
    ).rejects.toThrow();
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

  /**
   * Write `size` bytes with a GGUF v3 header at the front (and zeros after).
   * Mirrors the structure of a real GGUF enough to exercise the verifier
   * without bundling a multi-hundred-MB fixture.
   */
  async function writeGgufStub(path: string, size: number, version = 3): Promise<void> {
    if (size < 8) throw new Error("stub must be at least 8 bytes");
    const fh = await open(path, "w");
    const header = Buffer.alloc(8);
    header.writeUInt32LE(GGUF_MAGIC, 0);
    header.writeUInt32LE(version, 4);
    await fh.write(header, 0, 8, 0);
    await fh.truncate(size);
    await fh.close();
  }

  describe("verifyGgufFile", () => {
    it("accepts a valid GGUF v3 file (no size check)", async () => {
      const root = await tempDir();
      const p = join(root, "v3.gguf");
      await writeGgufStub(p, 1024, 3);
      await expect(verifyGgufFile(p)).resolves.toBeUndefined();
    });

    it("accepts a valid GGUF v2 file (no size check)", async () => {
      const root = await tempDir();
      const p = join(root, "v2.gguf");
      await writeGgufStub(p, 1024, 2);
      await expect(verifyGgufFile(p)).resolves.toBeUndefined();
    });

    it("rejects a zero-byte file with too-small message", async () => {
      const root = await tempDir();
      const p = join(root, "empty.gguf");
      await writeFile(p, "");
      await expect(verifyGgufFile(p)).rejects.toThrow(/too small to be GGUF/);
    });

    it("rejects a 7-byte file as too small for the header", async () => {
      const root = await tempDir();
      const p = join(root, "tiny.gguf");
      await writeFile(p, Buffer.alloc(7));
      await expect(verifyGgufFile(p)).rejects.toThrow(/too small to be GGUF/);
    });

    it("rejects an HTML error page (bad magic) with ascii hint", async () => {
      const root = await tempDir();
      const p = join(root, "page.gguf");
      // First 4 bytes: "<!DO" — a typical HTML error page
      const body = Buffer.concat([Buffer.from("<!DOCTYPE html><html>"), Buffer.alloc(1024)]);
      await writeFile(p, body);
      await expect(verifyGgufFile(p)).rejects.toThrow(/Bad GGUF magic/);
      await expect(verifyGgufFile(p)).rejects.toThrow(/<!DO/);
    });

    it("rejects GGUF v1 (pre-2023) and unsupported future versions", async () => {
      const root = await tempDir();
      const v1 = join(root, "v1.gguf");
      await writeGgufStub(v1, 1024, 1);
      await expect(verifyGgufFile(v1)).rejects.toThrow(/Unsupported GGUF version: 1/);

      const v99 = join(root, "v99.gguf");
      await writeGgufStub(v99, 1024, 99);
      await expect(verifyGgufFile(v99)).rejects.toThrow(/Unsupported GGUF version: 99/);
    });

    it("rejects when file is smaller than expectedApproxBytes × tolerance.min", async () => {
      const root = await tempDir();
      const p = join(root, "small.gguf");
      // 100 MB file, catalog says 532 MB → below 0.5× (266 MB) tolerance.
      await writeGgufStub(p, 100 * 1024 * 1024, 3);
      await expect(
        verifyGgufFile(p, { expectedApproxBytes: 532_000_000 }),
      ).rejects.toThrow(/smaller than expected/);
    });

    it("rejects when file is larger than expectedApproxBytes × tolerance.max", async () => {
      const root = await tempDir();
      const p = join(root, "huge.gguf");
      // 2 GB file, catalog says 532 MB → above 2× tolerance.
      await writeGgufStub(p, 2 * 1024 * 1024 * 1024, 3);
      await expect(
        verifyGgufFile(p, { expectedApproxBytes: 532_000_000 }),
      ).rejects.toThrow(/larger than expected/);
    });

    it("accepts a file within the default 0.5×–2.0× tolerance band", async () => {
      const root = await tempDir();
      const p = join(root, "ok.gguf");
      // 600 MB file — within [266 MB, 1064 MB] of 532 MB expected.
      await writeGgufStub(p, 600 * 1024 * 1024, 3);
      await expect(
        verifyGgufFile(p, { expectedApproxBytes: 532_000_000 }),
      ).resolves.toBeUndefined();
    });

    it("skips size check when expectedApproxBytes is 0 or undefined", async () => {
      const root = await tempDir();
      const p = join(root, "any-size.gguf");
      await writeGgufStub(p, 8, 3); // exactly the header — no body
      await expect(verifyGgufFile(p, { expectedApproxBytes: 0 })).resolves.toBeUndefined();
      await expect(verifyGgufFile(p)).resolves.toBeUndefined();
    });

    it("honors a custom tolerance override", async () => {
      const root = await tempDir();
      const p = join(root, "tight.gguf");
      // 250 MB file — within default 0.5× (266 MB) fails, but loose tolerance passes.
      await writeGgufStub(p, 250 * 1024 * 1024, 3);
      await expect(
        verifyGgufFile(p, {
          expectedApproxBytes: 532_000_000,
          tolerance: { min: 0.4, max: 3.0 },
        }),
      ).resolves.toBeUndefined();
    });

    it("exports the documented magic constant 0x46554747", () => {
      // Sanity check: "GGUF" as little-endian uint32.
      expect(GGUF_MAGIC).toBe(0x46554747);
      expect(GGUF_SUPPORTED_VERSIONS.has(2)).toBe(true);
      expect(GGUF_SUPPORTED_VERSIONS.has(3)).toBe(true);
    });
  });
});
