import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readdir, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";

import type { EhRevertTurnResult, EhTurnReview } from "@envoymesh/api";

const execFileAsync = promisify(execFile);
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const MAX_DIFF_BYTES = 256 * 1024;
const MAX_PERSISTED_CHECKPOINTS = 50;

interface BaselineFile { exists: boolean; bytes?: Buffer }

export interface EhPendingCheckpoint {
  checkpointId: string;
  turnId: string;
  chatId?: string;
  cwd: string;
  head?: string;
  dirty: Map<string, BaselineFile>;
}

export interface EhCompletedCheckpoint extends EhPendingCheckpoint {
  review: EhTurnReview;
  completedHashes: Map<string, string | null>;
}

interface PersistedCheckpoint {
  version: 1;
  checkpointId: string;
  turnId: string;
  chatId?: string;
  cwd: string;
  head?: string;
  review: EhTurnReview;
  baselines: Record<string, { exists: boolean; base64?: string }>;
  completedHashes: Record<string, string | null>;
}

function checkpointDir(profileDir: string): string {
  return resolve(profileDir, "envoy-harness", "checkpoints");
}

function checkpointFile(profileDir: string, turnId: string): string {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(turnId)) throw new Error("envoy_harness_invalid_turn_id");
  return resolve(checkpointDir(profileDir), `${turnId}.json`);
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_DIFF_BYTES * 2,
  });
  return result.stdout;
}

function safeRelative(cwd: string, input: string): string | undefined {
  const absolute = isAbsolute(input) ? resolve(input) : resolve(cwd, input);
  const rel = relative(cwd, absolute);
  if (
    !rel ||
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel) ||
    rel === ".git" ||
    rel.startsWith(".git/")
  ) return undefined;
  return rel.replaceAll("\\", "/");
}

async function bytesOrMissing(path: string): Promise<BaselineFile> {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error("envoy_harness_checkpoint_symlink");
    return { exists: true, bytes: await readFile(path) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}

async function safePath(cwd: string, rel: string): Promise<string> {
  const root = await realpath(cwd);
  const absolute = resolve(root, rel);
  const parent = await realpath(dirname(absolute));
  if (parent !== root && !parent.startsWith(`${root}/`)) {
    throw new Error("envoy_harness_checkpoint_path_escape");
  }
  return absolute;
}

function hash(file: BaselineFile): string | null {
  return file.exists && file.bytes ? createHash("sha256").update(file.bytes).digest("hex") : null;
}

function turnDiff(path: string, before: BaselineFile, after: BaselineFile): string | undefined {
  const beforeBytes = before.bytes ?? Buffer.alloc(0);
  const afterBytes = after.bytes ?? Buffer.alloc(0);
  if (beforeBytes.includes(0) || afterBytes.includes(0)) return undefined;
  const oldLines = beforeBytes.toString("utf8").split("\n");
  const newLines = afterBytes.toString("utf8").split("\n");
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
  const removed = oldLines.slice(prefix, oldLines.length - suffix);
  const added = newLines.slice(prefix, newLines.length - suffix);
  const header = `--- a/${path}\n+++ b/${path}\n@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@\n`;
  return `${header}${removed.map((line) => `-${line}`).join("\n")}${removed.length && added.length ? "\n" : ""}${added.map((line) => `+${line}`).join("\n")}`.slice(0, MAX_DIFF_BYTES);
}

function porcelainPaths(status: string): string[] {
  const paths: string[] = [];
  const entries = status.split("\0");
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    if (entry.length < 4) continue;
    paths.push(entry.slice(3));
    const statusCode = entry.slice(0, 2);
    if (statusCode.includes("R") || statusCode.includes("C")) index++;
  }
  return paths;
}

export async function createEhTurnCheckpoint(
  cwd: string,
  turnId: string,
  chatId?: string,
): Promise<EhPendingCheckpoint | undefined> {
  try {
    const normalizedCwd = await realpath(cwd);
    const head = (await git(normalizedCwd, ["rev-parse", "HEAD"])).trim();
    const status = await git(normalizedCwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const dirty = new Map<string, BaselineFile>();
    let total = 0;
    for (const rawPath of porcelainPaths(status)) {
      const rel = safeRelative(normalizedCwd, rawPath);
      if (!rel || dirty.has(rel)) continue;
      const snapshot = await bytesOrMissing(await safePath(normalizedCwd, rel));
      total += snapshot.bytes?.byteLength ?? 0;
      if (total > MAX_SNAPSHOT_BYTES) return undefined;
      dirty.set(rel, snapshot);
    }
    return { checkpointId: randomUUID(), turnId, ...(chatId ? { chatId } : {}), cwd: normalizedCwd, head, dirty };
  } catch {
    return undefined;
  }
}

async function baselineFor(checkpoint: EhPendingCheckpoint, rel: string): Promise<BaselineFile> {
  const dirty = checkpoint.dirty.get(rel);
  if (dirty) return dirty;
  try {
    const { stdout } = await execFileAsync("git", ["show", `${checkpoint.head}:${rel}`], {
      cwd: checkpoint.cwd,
      encoding: "buffer",
      maxBuffer: MAX_SNAPSHOT_BYTES,
    });
    return { exists: true, bytes: Buffer.from(stdout) };
  } catch {
    return { exists: false };
  }
}

export async function completeEhTurnCheckpoint(
  checkpoint: EhPendingCheckpoint,
  changedFiles: readonly string[],
): Promise<EhCompletedCheckpoint> {
  const files = [];
  const completedHashes = new Map<string, string | null>();
  const runtimePaths = new Set(changedFiles.flatMap((input) => {
    const path = safeRelative(checkpoint.cwd, input);
    return path ? [path] : [];
  }));
  let candidates = [...runtimePaths];
  try {
    const status = await git(checkpoint.cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    candidates = [...new Set([...candidates, ...porcelainPaths(status)])];
  } catch {
    // Runtime-observed paths still provide a safe checkpoint fallback.
  }
  for (const input of candidates) {
    const path = safeRelative(checkpoint.cwd, input);
    if (!path) continue;
    const before = await baselineFor(checkpoint, path);
    const after = await bytesOrMissing(await safePath(checkpoint.cwd, path));
    if (hash(before) === hash(after)) continue;
    const revertible = runtimePaths.has(path);
    if (revertible) {
      checkpoint.dirty.set(path, before);
      completedHashes.set(path, hash(after));
    }
    const diff = turnDiff(path, before, after);
    files.push({
      path,
      status: !after.exists ? "deleted" as const : !before.exists ? "added" as const : "modified" as const,
      attribution: revertible ? "runtime" as const : "workspace" as const,
      revertible,
      ...(diff ? { diff } : {}),
    });
  }
  return {
    ...checkpoint,
    completedHashes,
    review: {
      turnId: checkpoint.turnId,
      ...(checkpoint.chatId ? { chatId: checkpoint.chatId } : {}),
      checkpointId: checkpoint.checkpointId,
      files,
      canRevert: completedHashes.size > 0,
      ...(files.length > 0 && completedHashes.size === 0
        ? { revertBlockedReason: "changes_not_attributed_to_runtime" }
        : {}),
    },
  };
}

export async function revertEhTurnCheckpoint(
  checkpoint: EhCompletedCheckpoint,
): Promise<EhRevertTurnResult> {
  if (!checkpoint.review.canRevert || checkpoint.completedHashes.size === 0) {
    return {
      reverted: false,
      files: [],
      reason: checkpoint.review.revertBlockedReason ?? "no_runtime_attributed_changes",
    };
  }
  const conflicts: string[] = [];
  for (const [path, expected] of checkpoint.completedHashes) {
    const current = await bytesOrMissing(await safePath(checkpoint.cwd, path));
    if (hash(current) !== expected) conflicts.push(path);
  }
  if (conflicts.length > 0) {
    return { reverted: false, files: [], conflicts, reason: "files_changed_after_turn" };
  }
  const reverted: string[] = [];
  for (const path of checkpoint.completedHashes.keys()) {
    const baseline = checkpoint.dirty.get(path)!;
    const absolute = await safePath(checkpoint.cwd, path);
    if (baseline.exists && baseline.bytes) await writeFile(absolute, baseline.bytes);
    else {
      try { await unlink(absolute); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    reverted.push(path);
  }
  return { reverted: true, files: reverted };
}

/** Remove files from the pending review without changing disk. */
export function acceptEhTurnFiles(
  checkpoint: EhCompletedCheckpoint,
  paths: readonly string[],
): EhCompletedCheckpoint {
  const pathSet = new Set(paths);
  for (const path of paths) {
    checkpoint.completedHashes.delete(path);
    checkpoint.dirty.delete(path);
  }
  checkpoint.review = {
    ...checkpoint.review,
    files: checkpoint.review.files.filter((file) => !pathSet.has(file.path)),
    canRevert: checkpoint.completedHashes.size > 0,
    ...(checkpoint.completedHashes.size === 0
      ? { revertBlockedReason: undefined }
      : {}),
  };
  return checkpoint;
}

export async function revertEhTurnFiles(
  checkpoint: EhCompletedCheckpoint,
  paths: readonly string[],
): Promise<EhRevertTurnResult> {
  const targets = paths.filter((path) => checkpoint.completedHashes.has(path));
  if (targets.length === 0) {
    return { reverted: false, files: [], reason: "no_revertible_files" };
  }
  const conflicts: string[] = [];
  for (const path of targets) {
    const expected = checkpoint.completedHashes.get(path)!;
    const current = await bytesOrMissing(await safePath(checkpoint.cwd, path));
    if (hash(current) !== expected) conflicts.push(path);
  }
  if (conflicts.length > 0) {
    return { reverted: false, files: [], conflicts, reason: "files_changed_after_turn" };
  }
  const reverted: string[] = [];
  for (const path of targets) {
    const baseline = checkpoint.dirty.get(path)!;
    const absolute = await safePath(checkpoint.cwd, path);
    if (baseline.exists && baseline.bytes) await writeFile(absolute, baseline.bytes);
    else {
      try { await unlink(absolute); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    reverted.push(path);
    checkpoint.completedHashes.delete(path);
    checkpoint.dirty.delete(path);
  }
  const revertedSet = new Set(reverted);
  checkpoint.review = {
    ...checkpoint.review,
    files: checkpoint.review.files.filter((file) => !revertedSet.has(file.path)),
    canRevert: checkpoint.completedHashes.size > 0,
    ...(checkpoint.completedHashes.size === 0
      ? { revertBlockedReason: undefined }
      : {}),
  };
  return { reverted: true, files: reverted };
}

export async function persistEhTurnCheckpoint(
  profileDir: string,
  checkpoint: EhCompletedCheckpoint,
): Promise<void> {
  const baselines: PersistedCheckpoint["baselines"] = {};
  for (const path of checkpoint.completedHashes.keys()) {
    const baseline = checkpoint.dirty.get(path)!;
    baselines[path] = {
      exists: baseline.exists,
      ...(baseline.bytes ? { base64: baseline.bytes.toString("base64") } : {}),
    };
  }
  const payload: PersistedCheckpoint = {
    version: 1,
    checkpointId: checkpoint.checkpointId,
    turnId: checkpoint.turnId,
    ...(checkpoint.chatId ? { chatId: checkpoint.chatId } : {}),
    cwd: checkpoint.cwd,
    ...(checkpoint.head ? { head: checkpoint.head } : {}),
    review: checkpoint.review,
    baselines,
    completedHashes: Object.fromEntries(checkpoint.completedHashes),
  };
  const dir = checkpointDir(profileDir);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = checkpointFile(profileDir, checkpoint.turnId);
  const temp = `${target}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(payload), { mode: 0o600 });
  await rename(temp, target);
  const entries = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  if (entries.length > MAX_PERSISTED_CHECKPOINTS) {
    const dated = await Promise.all(entries.map(async (name) => ({ name, mtime: (await stat(resolve(dir, name))).mtimeMs })));
    dated.sort((a, b) => b.mtime - a.mtime);
    await Promise.all(dated.slice(MAX_PERSISTED_CHECKPOINTS).map(({ name }) => unlink(resolve(dir, name))));
  }
}

export async function loadEhTurnCheckpoint(
  profileDir: string,
  turnId: string,
): Promise<EhCompletedCheckpoint | undefined> {
  try {
    const parsed = JSON.parse(await readFile(checkpointFile(profileDir, turnId), "utf8")) as PersistedCheckpoint;
    if (parsed.version !== 1 || parsed.turnId !== turnId || !parsed.review || !parsed.baselines || !parsed.completedHashes) return undefined;
    const dirty = new Map<string, BaselineFile>();
    for (const [path, value] of Object.entries(parsed.baselines)) {
      if (!safeRelative(parsed.cwd, path)) return undefined;
      dirty.set(path, { exists: value.exists === true, ...(value.base64 ? { bytes: Buffer.from(value.base64, "base64") } : {}) });
    }
    return {
      checkpointId: parsed.checkpointId,
      turnId,
      ...(parsed.chatId ? { chatId: parsed.chatId } : {}),
      cwd: parsed.cwd,
      ...(parsed.head ? { head: parsed.head } : {}),
      dirty,
      review: parsed.review,
      completedHashes: new Map(Object.entries(parsed.completedHashes)),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    return undefined;
  }
}

export async function listEhTurnCheckpoints(
  profileDir: string,
  scope: { chatId?: string; cwd: string },
): Promise<EhCompletedCheckpoint[]> {
  try {
    const scopedCwd = await realpath(scope.cwd).catch(() => resolve(scope.cwd));
    const dir = checkpointDir(profileDir);
    const entries = (await readdir(dir)).filter((name) => name.endsWith(".json"));
    const loaded = await Promise.all(entries.map((name) => loadEhTurnCheckpoint(profileDir, name.slice(0, -5))));
    return loaded
      .filter((checkpoint): checkpoint is EhCompletedCheckpoint => checkpoint !== undefined)
      .filter((checkpoint) => {
        if (checkpoint.cwd !== scopedCwd) return false;
        return scope.chatId
          ? checkpoint.chatId === scope.chatId
          : checkpoint.chatId === undefined;
      });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    return [];
  }
}

export async function deletePersistedEhTurnCheckpoint(profileDir: string, turnId: string): Promise<void> {
  try { await unlink(checkpointFile(profileDir, turnId)); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
