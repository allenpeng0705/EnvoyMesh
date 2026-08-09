/**
 * Download + extract helpers for Envoy Local runtime/models (Phase 54).
 */
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

const execFileAsync = promisify(execFile);

export interface DownloadFileProgress {
  bytesReceived: number;
  bytesTotal?: number;
}

export async function downloadFile(params: {
  url: string;
  destPath: string;
  onProgress?: (p: DownloadFileProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  await mkdir(dirname(params.destPath), { recursive: true });
  const tmpPath = `${params.destPath}.part`;
  await rm(tmpPath, { force: true });

  const res = await fetch(params.url, {
    signal: params.signal,
    redirect: "follow",
    headers: { "User-Agent": "EnvoyMesh-EnvoyLocal/1.0" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed HTTP ${res.status} for ${params.url}`);
  }

  const totalHeader = res.headers.get("content-length");
  const bytesTotal = totalHeader ? Number(totalHeader) : undefined;
  let bytesReceived = 0;

  const reader = res.body.getReader();
  const file = createWriteStream(tmpPath);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      bytesReceived += value.byteLength;
      await new Promise<void>((resolve, reject) => {
        file.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()));
      });
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
    await rm(tmpPath, { force: true });
    throw err;
  }

  await rename(tmpPath, params.destPath);
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
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
