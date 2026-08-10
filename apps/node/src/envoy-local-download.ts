/**
 * Download + extract helpers for Envoy Local runtime/models (Phase 54).
 */
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

const execFileAsync = promisify(execFile);

/** Read result shape — kept local to avoid the `ReadableStream` DOM lib needing to be in scope. */
interface StreamReadResult {
  done: boolean;
  value?: Uint8Array;
}

/**
 * Race a stream read against an AbortSignal so timeout / cancel can
 * interrupt a stuck `reader.read()`. The fetch()'s built-in signal only
 * aborts the request, not an already-in-flight read on the body — a server
 * that returns headers then never sends more bytes leaves us hanging.
 */
async function readWithSignal(
  reader: { read(): Promise<StreamReadResult>; cancel?(): Promise<void> },
  signal: AbortSignal,
): Promise<StreamReadResult> {
  if (signal.aborted) {
    const err = new Error(`Aborted: ${signal.reason ?? "unknown"}`);
    err.name = "AbortError";
    throw err;
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      // Tell the stream to release resources. cancel() is best-effort;
      // the in-flight read still needs the explicit reject below to
      // unblock the consumer. Use optional-call in case the reader is a
      // test mock that doesn't implement cancel().
      reader.cancel?.().catch(() => undefined);
      const err = new Error(`Aborted: ${signal.reason ?? "unknown"}`);
      err.name = "AbortError";
      reject(err);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

export interface DownloadFileProgress {
  bytesReceived: number;
  bytesTotal?: number;
}

export async function downloadFile(params: {
  url: string;
  destPath: string;
  onProgress?: (p: DownloadFileProgress) => void;
  signal?: AbortSignal;
  /**
   * Hard time budget for the whole download. Default 30 min. Survives a
   * half-open TCP connection that fetch itself wouldn't notice. Combined
   * with `params.signal` (cancel-on-disable) via `AbortSignal.any`.
   */
  overallTimeoutMs?: number;
  /**
   * Abort if no bytes received for this long. Default 5 min. Catches a
   * stalled server that returns 200 with `Content-Length: 1000` then sends
   * 0 bytes. Reset on every successful `reader.read()`.
   */
  noProgressTimeoutMs?: number;
}): Promise<void> {
  const overallTimeoutMs = params.overallTimeoutMs ?? 30 * 60 * 1000;
  const noProgressTimeoutMs = params.noProgressTimeoutMs ?? 5 * 60 * 1000;

  await mkdir(dirname(params.destPath), { recursive: true });
  const tmpPath = `${params.destPath}.part`;

  // Compose an AbortController that fires when ANY of these abort:
  //   1. The caller's signal (cancel-on-disable, user click)
  //   2. overallTimeoutMs (whole-download budget)
  //   3. noProgressController (no bytes for noProgressTimeoutMs — set below)
  // The fetch + subsequent reader.read() are tied to this composed signal.
  const overallController = new AbortController();
  let overallTimer: ReturnType<typeof setTimeout> | undefined;
  const noProgressController = new AbortController();
  let noProgressTimer: ReturnType<typeof setTimeout> | undefined;
  const composedSignal = params.signal
    ? AbortSignal.any([params.signal, overallController.signal, noProgressController.signal])
    : AbortSignal.any([overallController.signal, noProgressController.signal]);

  const clearTimers = (): void => {
    if (overallTimer) clearTimeout(overallTimer);
    if (noProgressTimer) clearTimeout(noProgressTimer);
    overallTimer = undefined;
    noProgressTimer = undefined;
  };

  const armOverall = (): void => {
    if (overallTimer) clearTimeout(overallTimer);
    overallTimer = setTimeout(() => {
      overallController.abort(
        new Error(`Download exceeded overall timeout of ${Math.round(overallTimeoutMs / 1000)}s`),
      );
    }, overallTimeoutMs);
    overallTimer.unref?.();
  };

  const armNoProgress = (): void => {
    if (noProgressTimer) clearTimeout(noProgressTimer);
    noProgressTimer = setTimeout(() => {
      noProgressController.abort(
        new Error(
          `No download progress for ${Math.round(noProgressTimeoutMs / 1000)}s (stalled connection)`,
        ),
      );
    }, noProgressTimeoutMs);
    noProgressTimer.unref?.();
  };

  armOverall();
  armNoProgress();

  // Resume support: if a previous attempt left a `.part` file on disk, ask
  // the server to continue from that offset via `Range: bytes=N-`. Big GGUF
  // models (4B+ = 2-7 GB) can otherwise lose tens of minutes to a network
  // blip, laptop sleep, or node restart. Most CDNs (HF, ModelScope,
  // hf-mirror, GitHub Releases) honor Range; those that don't return 200
  // and we restart from 0.
  let existingSize = 0;
  try {
    const partStat = await stat(tmpPath);
    if (partStat.size > 0) existingSize = partStat.size;
  } catch {
    // No .part file — fresh download.
  }

  const headers: Record<string, string> = {
    "User-Agent": "EnvoyMesh-EnvoyLocal/1.0",
  };
  if (existingSize > 0) {
    headers["Range"] = `bytes=${existingSize}-`;
  }

  let res: Response;
  try {
    res = await fetch(params.url, {
      signal: composedSignal,
      redirect: "follow",
      headers,
    });
  } catch (err) {
    // Fetch-level errors include the abort reasons we set above. Re-throw
    // the original AbortError so the caller can match against the reason
    // message if they want to distinguish cancel vs timeout vs stall.
    clearTimers();
    throw err;
  }

  // 416 Range Not Satisfiable: existingSize ≥ server's idea of total. Don't
  // touch the file — caller validates via GGUF magic / size / sha256. If
  // the file is genuinely complete, the rename below is skipped and the
  // .part just sits there (we could rm it, but it's the caller's job to
  // decide based on verification).
  if (res.status === 416) {
    clearTimers();
    return;
  }
  if (!res.ok && res.status !== 206) {
    clearTimers();
    throw new Error(`Download failed HTTP ${res.status} for ${params.url}`);
  }
  if (!res.body) {
    clearTimers();
    throw new Error(`Download failed: empty body for ${params.url}`);
  }

  // Resolve total size: Content-Range (resume) > Content-Length (full).
  let bytesTotal: number | undefined;
  const contentRange = res.headers.get("content-range");
  if (contentRange) {
    const m = /\/(\d+)/.exec(contentRange);
    if (m) bytesTotal = Number(m[1]);
  } else {
    const cl = res.headers.get("content-length");
    if (cl) bytesTotal = Number(cl);
  }

  // Server ignored our Range header (200 OK instead of 206): the response
  // body is the full file from byte 0, so appending to .part would corrupt
  // it. Open in write mode (truncates) and treat as a fresh download.
  const startFromZero = res.status === 200 && existingSize > 0;
  const append = existingSize > 0 && !startFromZero;

  const file = createWriteStream(tmpPath, { flags: append ? "a" : "w" });
  if (startFromZero) existingSize = 0;
  let bytesReceived = existingSize;
  const reader = res.body.getReader();
  try {
    for (;;) {
      // Race the read against composedSignal so the noProgress / overall
      // timers (and the caller's signal) can interrupt a stuck read. A
      // stalled server that returns Content-Length then sends zero bytes
      // would otherwise leave us awaiting reader.read() forever.
      const { done, value } = await readWithSignal(reader, composedSignal);
      if (done) break;
      if (!value) continue;
      bytesReceived += value.byteLength;
      await new Promise<void>((resolve, reject) => {
        file.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
      });
      // Successful chunk — reset the no-progress watchdog.
      armNoProgress();
      params.onProgress?.({
        bytesReceived,
        ...(Number.isFinite(bytesTotal) ? { bytesTotal } : {}),
      });
    }
    await new Promise<void>((resolve, reject) => {
      file.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
  } catch (err) {
    file.destroy();
    clearTimers();
    // Keep .part in place on error so the next attempt can resume.
    // Mid-stream network errors leave the partial file valid for Range.
    throw err;
  } finally {
    clearTimers();
  }

  // Sanity-check final size against the server's claim. Catches a proxy
  // that lies about Content-Range or truncates the body mid-200.
  if (typeof bytesTotal === "number" && Number.isFinite(bytesTotal) && bytesTotal > 0) {
    if (bytesReceived !== bytesTotal) {
      await rm(tmpPath, { force: true });
      throw new Error(
        `Download size mismatch for ${params.url}: ` +
          `expected ${bytesTotal} bytes, got ${bytesReceived}`,
      );
    }
  }

  await rename(tmpPath, params.destPath);
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/**
 * GGUF v3 file format — https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
 * First 8 bytes: magic (4) + version (4 little-endian uint32). Supported
 * versions: 2 and 3 (v1 is pre-2023 and never shipped by unsloth/bartowski).
 */
export const GGUF_MAGIC = 0x46554747; // "GGUF" little-endian
export const GGUF_SUPPORTED_VERSIONS: ReadonlySet<number> = new Set([2, 3]);

/** Multiplier tolerance band for the optional size-sanity check. */
export const DEFAULT_GGUF_SIZE_TOLERANCE = { min: 0.5, max: 2.0 };

export interface VerifyGgufFileOptions {
  /**
   * Approximate size in bytes from the catalog. When set, the file must be
   * within `tolerance` of this number. Defends against zip-bomb style mirrors
   * and truncated downloads that the 50 MB minimum can't catch.
   */
  expectedApproxBytes?: number;
  /** Override the default 0.5×–2.0× tolerance band. */
  tolerance?: { min: number; max: number };
}

/**
 * Verify a file is structurally a valid GGUF (magic + version) and (when
 * `expectedApproxBytes` is provided) within a size tolerance band.
 *
 * Throws on any failure. Cheap: reads the first 8 bytes plus one stat. The
 * point is defense-in-depth for downloads where the catalog has no sha256
 * pin (most curated entries today) — a malicious / corrupted mirror that
 * returns an HTML error page, a tiny stub, or a 50 GB bogus file gets caught
 * here before the sidecar wastes minutes trying to load it.
 *
 * Catches:
 *  - Non-GGUF files (HTTP error pages, JSON, tar archives) — bad magic
 *  - Pre-2023 GGUF v1 dumps or future-incompatible versions — version check
 *  - Truncated downloads that pass the 50 MB minimum — size below tolerance
 *  - Zip-bomb / padding attacks — size above tolerance
 *
 * Does NOT catch:
 *  - A GGUF that opens cleanly but contains garbage tensors (use sha256)
 *  - A different but equally-valid quant (e.g. user asked Q4_K_M and got Q5_K_M)
 *    — this is a catalog/hf-search concern, not a file-format one
 */
export async function verifyGgufFile(
  path: string,
  opts: VerifyGgufFileOptions = {},
): Promise<void> {
  const file = await open(path, "r");
  try {
    const st = await file.stat();
    if (st.size < 8) {
      throw new Error(
        `File too small to be GGUF (${st.size} bytes; need at least 8 for the header)`,
      );
    }
    const header = Buffer.alloc(8);
    const { bytesRead } = await file.read(header, 0, 8, 0);
    if (bytesRead < 8) {
      throw new Error(`Failed to read GGUF header (got ${bytesRead} of 8 bytes)`);
    }
    const magic = header.readUInt32LE(0);
    if (magic !== GGUF_MAGIC) {
      const gotHex = magic.toString(16).padStart(8, "0");
      // First 4 ASCII bytes when printable, e.g. "<!DO" for HTML.
      const gotAscii = header
        .subarray(0, 4)
        .toString("ascii")
        .replace(/[^\x20-\x7e]/g, "?");
      throw new Error(
        `Bad GGUF magic: expected 0x${GGUF_MAGIC.toString(16)} ("GGUF"), ` +
          `got 0x${gotHex} ("${gotAscii}") — file is not a GGUF`,
      );
    }
    const version = header.readUInt32LE(4);
    if (!GGUF_SUPPORTED_VERSIONS.has(version)) {
      throw new Error(
        `Unsupported GGUF version: ${version} (supported: 2, 3)`,
      );
    }
    if (opts.expectedApproxBytes != null && opts.expectedApproxBytes > 0) {
      const tolerance = opts.tolerance ?? DEFAULT_GGUF_SIZE_TOLERANCE;
      const minBytes = Math.floor(opts.expectedApproxBytes * tolerance.min);
      const maxBytes = Math.ceil(opts.expectedApproxBytes * tolerance.max);
      if (st.size < minBytes) {
        throw new Error(
          `GGUF smaller than expected: ${st.size} bytes < ${minBytes} ` +
            `(${tolerance.min}× of catalog ~${opts.expectedApproxBytes} bytes) — likely truncated`,
        );
      }
      if (st.size > maxBytes) {
        throw new Error(
          `GGUF larger than expected: ${st.size} bytes > ${maxBytes} ` +
            `(${tolerance.max}× of catalog ~${opts.expectedApproxBytes} bytes) — likely corrupted or padded`,
        );
      }
    }
  } finally {
    await file.close().catch(() => undefined);
  }
}

export async function extractArchive(params: {
  archivePath: string;
  destDir: string;
}): Promise<void> {
  await mkdir(params.destDir, { recursive: true });
  const lower = params.archivePath.toLowerCase();
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) {
    await execFileAsync("tar", ["-xzf", params.archivePath, "-C", params.destDir], {
      timeout: 120_000,
    });
    return;
  }
  if (lower.endsWith(".zip")) {
    // Windows 10+ and macOS/Linux bsdtar/gnu tar can extract zip.
    await execFileAsync("tar", ["-xf", params.archivePath, "-C", params.destDir], {
      timeout: 180_000,
    });
    return;
  }
  throw new Error(`Unsupported archive type: ${params.archivePath}`);
}

export async function findExecutable(
  rootDir: string,
  names: string[],
): Promise<string | null> {
  const { readdir } = await import("node:fs/promises");
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name === ".git") continue;
        stack.push(full);
      } else if (ent.isFile() && names.includes(ent.name)) {
        return full;
      }
    }
  }
  return null;
}

export async function ensureMinFreeBytes(
  dir: string,
  minBytes: number,
): Promise<void> {
  // Best-effort: skip hard fail if statfs unavailable.
  try {
    const { statfs } = await import("node:fs/promises");
    const s = await statfs(dir);
    const free = Number(s.bfree) * Number(s.bsize);
    if (Number.isFinite(free) && free < minBytes) {
      throw new Error(
        `Not enough free disk space under ${dir} (need ~${Math.ceil(minBytes / (1024 * 1024))} MB)`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Not enough free disk")) throw err;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return existsSync(path);
  }
}
