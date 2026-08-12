/**
 * Resolve Ext Agent CLI binaries when GUI / Tauri / non-login shells strip
 * user PATH entries (e.g. `~/.npm-global/bin` from `npm i -g`).
 *
 * Symptom: user has `codex` in their terminal, but Ext Agent Settings shows
 * "Install `codex` CLI…" because the home-node process cannot `command -v codex`.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, dirname, join } from "node:path";

/** Well-known user/global bin dirs checked after `$PATH`. */
export function commonExtAgentBinDirs(home = homedir()): string[] {
  const dirs: string[] = [];
  if (home) {
    dirs.push(
      join(home, ".npm-global", "bin"),
      join(home, ".local", "bin"),
      join(home, ".cargo", "bin"),
      // fnm / nvm style globals sometimes land here
      join(home, ".nvm", "current", "bin"),
    );
  }
  if (process.platform === "darwin") {
    dirs.push("/opt/homebrew/bin", "/usr/local/bin");
  } else if (process.platform === "win32") {
    if (home) {
      dirs.push(join(home, "AppData", "Roaming", "npm"));
    }
  } else {
    dirs.push("/usr/local/bin");
  }
  // Bundled Node next to ENVOYMESH_NODE_EXE (Tauri) — shebang helpers live nearby.
  const nodeExe = process.env.ENVOYMESH_NODE_EXE?.trim();
  if (nodeExe) {
    dirs.unshift(dirname(nodeExe));
  }
  return dirs;
}

/**
 * Absolute path to `command` if found on PATH or in {@link commonExtAgentBinDirs}.
 * Returns `null` when not found.
 */
export function resolveExtAgentBinary(
  command: string,
  opts?: { envPath?: string; home?: string; exists?: (p: string) => boolean },
): string | null {
  const name = command.trim();
  if (!name) return null;
  // Already absolute / relative path with separators — trust caller after exists.
  const exists = opts?.exists ?? existsSync;
  if (name.includes("/") || name.includes("\\")) {
    return exists(name) ? name : null;
  }

  const pathEnv = opts?.envPath ?? process.env.PATH ?? process.env.Path ?? "";
  const pathDirs = pathEnv.split(delimiter).filter(Boolean);
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const dir of [...pathDirs, ...commonExtAgentBinDirs(opts?.home)]) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    if (process.platform === "win32") {
      candidates.push(join(dir, `${name}.cmd`), join(dir, `${name}.exe`), join(dir, name));
    } else {
      candidates.push(join(dir, name));
    }
  }

  for (const c of candidates) {
    if (exists(c)) return c;
  }
  return null;
}

/** True when {@link resolveExtAgentBinary} finds the command. */
export function isExtAgentBinaryAvailable(command: string): boolean {
  return resolveExtAgentBinary(command) != null;
}

/**
 * Prepend common Ext Agent bin dirs to `env.PATH` so child spawns
 * (`command -v`, `codex app-server`, shebangs) see npm-global installs.
 */
export function augmentPathForExtAgentBins(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const key = process.platform === "win32" && env.Path && !env.PATH ? "Path" : "PATH";
  const current = env[key] ?? "";
  const extras = commonExtAgentBinDirs().filter((d) => {
    if (!d || !existsSync(d)) return false;
    // Avoid duplicating dirs already present.
    return !current.split(delimiter).includes(d);
  });
  if (extras.length === 0) return env;
  return {
    ...env,
    [key]: [...extras, current].filter(Boolean).join(delimiter),
  };
}

/**
 * Mutate `process.env.PATH` once at home-node startup so Ext Agent probes
 * and supervisors inherit npm-global / Homebrew bins under Tauri GUI PATH.
 */
export function ensureProcessPathHasExtAgentBins(): void {
  const next = augmentPathForExtAgentBins(process.env);
  if (next.PATH && next.PATH !== process.env.PATH) {
    process.env.PATH = next.PATH;
  }
  if (next.Path && next.Path !== process.env.Path) {
    process.env.Path = next.Path;
  }
}
