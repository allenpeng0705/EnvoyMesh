/**
 * Debounced vault → RAG incremental reindex watcher (Knowledge Phase 1).
 * Uses Node `fs.watch({ recursive: true })` — supported on macOS/Windows and
 * recent Node on Linux. Ignores internal / temp paths so RAG churn stays low.
 */
import { watch, type FSWatcher } from "node:fs";
import { relative, resolve, sep } from "node:path";

const IGNORE_DIR_NAMES = new Set([
  ".envoy",
  ".obsidian",
  ".git",
  "temp",
  "node_modules",
  ".trash",
]);

const IGNORE_FILE_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

export interface VaultRagWatcherOptions {
  vaultDir: string;
  /** Fired with vault-relative paths touched since the last flush (may be empty if unknown). */
  onChange: (relativePaths: string[]) => void;
  /** Default 3000ms — coalesce Obsidian/save bursts. */
  debounceMs?: number;
}

export interface VaultRagWatcherHandle {
  stop: () => void;
}

export function shouldIgnoreVaultWatchPath(vaultDir: string, absoluteOrRelative: string): boolean {
  const abs = absoluteOrRelative.startsWith(vaultDir)
    ? absoluteOrRelative
    : resolve(vaultDir, absoluteOrRelative);
  const rel = relative(vaultDir, abs);
  if (!rel || rel.startsWith("..")) return true;
  const parts = rel.split(/[/\\]/).filter(Boolean);
  for (const part of parts) {
    if (IGNORE_DIR_NAMES.has(part.toLowerCase())) return true;
  }
  const base = parts[parts.length - 1]?.toLowerCase() ?? "";
  if (IGNORE_FILE_NAMES.has(base)) return true;
  if (base.endsWith(".tmp") || base.endsWith(".swp") || base.startsWith(".")) {
    // Allow `.md` only when not a hidden dir; skip other dotted junk.
    if (!base.endsWith(".md")) return true;
  }
  return false;
}

export function createVaultRagWatcher(options: VaultRagWatcherOptions): VaultRagWatcherHandle {
  const vaultDir = resolve(options.vaultDir);
  const debounceMs = options.debounceMs ?? 3_000;
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let watcher: FSWatcher | null = null;

  const flush = () => {
    timer = null;
    if (stopped) return;
    const paths = [...pending];
    pending.clear();
    try {
      options.onChange(paths);
    } catch (err) {
      console.warn(
        "[vault-rag-watcher] onChange failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  };

  const schedule = (rel: string) => {
    if (shouldIgnoreVaultWatchPath(vaultDir, rel)) return;
    pending.add(rel.split(/[/\\]/).join("/"));
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
    timer.unref?.();
  };

  try {
    watcher = watch(vaultDir, { recursive: true }, (_event, filename) => {
      if (stopped || !filename) {
        // Some platforms omit filename — still schedule a full incremental pass.
        if (!filename) {
          pending.add("");
          if (timer) clearTimeout(timer);
          timer = setTimeout(flush, debounceMs);
          timer.unref?.();
        }
        return;
      }
      const name = typeof filename === "string" ? filename : String(filename);
      schedule(name.includes(sep) || name.includes("/") ? name : name);
    });
  } catch (err) {
    console.warn(
      "[vault-rag-watcher] fs.watch failed (incremental reindex disabled):",
      err instanceof Error ? err.message : String(err),
    );
    return {
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
    };
  }

  watcher.on("error", (err) => {
    console.warn(
      "[vault-rag-watcher] watch error:",
      err instanceof Error ? err.message : String(err),
    );
  });

  return {
    stop: () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
      try {
        watcher?.close();
      } catch {
        /* ignore */
      }
      watcher = null;
    },
  };
}
