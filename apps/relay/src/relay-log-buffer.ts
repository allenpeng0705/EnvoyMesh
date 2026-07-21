/**
 * Bounded relay logging: in-memory ring for the admin UI + size/age-rotated file.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type RelayLogLevel = "log" | "warn" | "error";

export interface RelayLogEntry {
  ts: string;
  level: RelayLogLevel;
  message: string;
}

export interface RelayLogBufferOptions {
  maxLines?: number;
  logDir?: string;
  maxBytes?: number;
  retainDays?: number;
  /** When false, skip wrapping console (tests). Default true. */
  installConsoleHooks?: boolean;
}

export interface RelayLogBuffer {
  append(level: RelayLogLevel, message: string): void;
  tail(limit?: number, level?: RelayLogLevel | "all"): RelayLogEntry[];
  clear(options?: { truncateFile?: boolean }): void;
  size(): number;
  dispose(): void;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack ?? a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function createRelayLogBuffer(options: RelayLogBufferOptions = {}): RelayLogBuffer {
  const maxLines = options.maxLines ?? 2000;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const retainDays = options.retainDays ?? 7;
  const logDir = options.logDir;
  const ring: RelayLogEntry[] = [];
  let filePath: string | undefined;

  if (logDir) {
    mkdirSync(logDir, { recursive: true });
    filePath = join(logDir, "relay.log");
  }

  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  function pruneRotatedFiles(): void {
    if (!logDir) return;
    const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000;
    let entries: string[] = [];
    try {
      entries = readdirSync(logDir);
    } catch {
      return;
    }
    for (const name of entries) {
      if (!/^relay\.log\.\d+$/.test(name)) continue;
      const full = join(logDir, name);
      try {
        const st = statSync(full);
        if (st.mtimeMs < cutoff) unlinkSync(full);
      } catch {
        /* ignore */
      }
    }
  }

  function rotateIfNeeded(): void {
    if (!filePath || !existsSync(filePath)) return;
    let size = 0;
    try {
      size = statSync(filePath).size;
    } catch {
      return;
    }
    if (size < maxBytes) return;
    const stamp = Date.now();
    const rotated = `${filePath}.${stamp}`;
    try {
      renameSync(filePath, rotated);
    } catch {
      return;
    }
    pruneRotatedFiles();
  }

  function writeFileLine(entry: RelayLogEntry): void {
    if (!filePath) return;
    rotateIfNeeded();
    const line = `${entry.ts} [${entry.level}] ${entry.message}\n`;
    try {
      appendFileSync(filePath, line, "utf8");
    } catch {
      /* never crash the relay on log I/O */
    }
  }

  function append(level: RelayLogLevel, message: string): void {
    const entry: RelayLogEntry = {
      ts: new Date().toISOString(),
      level,
      message,
    };
    ring.push(entry);
    while (ring.length > maxLines) ring.shift();
    writeFileLine(entry);
  }

  if (options.installConsoleHooks !== false) {
    console.log = (...args: unknown[]) => {
      append("log", formatArgs(args));
      original.log(...args);
    };
    console.warn = (...args: unknown[]) => {
      append("warn", formatArgs(args));
      original.warn(...args);
    };
    console.error = (...args: unknown[]) => {
      append("error", formatArgs(args));
      original.error(...args);
    };
  }

  return {
    append,
    tail(limit = 200, level: RelayLogLevel | "all" = "all"): RelayLogEntry[] {
      const filtered =
        level === "all" ? ring : ring.filter((e) => e.level === level);
      return filtered.slice(-Math.max(1, limit));
    },
    clear(opts?: { truncateFile?: boolean }): void {
      ring.length = 0;
      if (opts?.truncateFile !== false && filePath) {
        try {
          writeFileSync(filePath, "", "utf8");
        } catch {
          /* ignore */
        }
      }
    },
    size(): number {
      return ring.length;
    },
    dispose(): void {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
    },
  };
}
