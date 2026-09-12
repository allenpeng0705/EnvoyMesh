/**
 * Resolve Ext Agent CLI binaries when GUI / Tauri / non-login shells strip
 * user PATH entries (e.g. `~/.npm-global/bin` from `npm i -g`, or conda
 * env bins like `/opt/anaconda3/envs/pytorch/bin/aider`).
 *
 * Symptom: user has `codex` / `aider` in their terminal, but Ext Agent
 * Settings shows "Install …" because the home-node process cannot
 * `command -v` that binary.
 */

import { existsSync, readdirSync } from "node:fs";
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

export interface CondaExtAgentBinDirsOptions {
  /** Override `process.env.CONDA_PREFIX`. */
  condaPrefix?: string | null;
  /** Directory existence check (tests). Default: `existsSync`. */
  exists?: (p: string) => boolean;
  /** List env names under `<root>/envs` (tests). Default: `readdirSync`. */
  listEnvs?: (envsDir: string) => string[];
}

/**
 * Conda / Miniconda / Miniforge bin dirs (active prefix + common installs).
 * Used only for absolute-path lookup — not prepended wholesale to PATH
 * (that would mix unrelated env packages into every spawn).
 */
export function condaExtAgentBinDirs(
  home = homedir(),
  opts: CondaExtAgentBinDirsOptions = {},
): string[] {
  const exists = opts.exists ?? existsSync;
  const listEnvs =
    opts.listEnvs ??
    ((envsDir: string) => {
      try {
        return readdirSync(envsDir);
      } catch {
        return [];
      }
    });
  const dirs: string[] = [];
  const seen = new Set<string>();
  const push = (dir: string) => {
    if (!dir || seen.has(dir)) return;
    seen.add(dir);
    dirs.push(dir);
  };

  const prefix = (opts.condaPrefix ?? process.env.CONDA_PREFIX)?.trim();
  if (prefix) push(join(prefix, "bin"));

  const roots: string[] = [];
  if (home) {
    roots.push(
      join(home, "anaconda3"),
      join(home, "miniconda3"),
      join(home, "miniforge3"),
      join(home, "mambaforge"),
    );
  }
  if (process.platform === "darwin" || process.platform === "linux") {
    roots.push("/opt/anaconda3", "/opt/miniconda3", "/opt/miniforge3");
  }
  if (process.platform === "win32" && home) {
    roots.push(
      join(home, "anaconda3"),
      join(home, "miniconda3"),
      join(home, "AppData", "Local", "anaconda3"),
      join(home, "AppData", "Local", "miniconda3"),
    );
  }

  for (const root of roots) {
    if (!exists(root)) continue;
    push(join(root, "bin"));
    const envsDir = join(root, "envs");
    if (!exists(envsDir)) continue;
    for (const name of listEnvs(envsDir)) {
      if (!name || name.startsWith(".")) continue;
      push(join(envsDir, name, "bin"));
    }
  }
  return dirs;
}

/**
 * Absolute path to `command` if found on PATH, well-known user bins, or
 * conda env bins. Returns `null` when not found.
 */
export function resolveExtAgentBinary(
  command: string,
  opts?: {
    envPath?: string;
    home?: string;
    exists?: (p: string) => boolean;
    condaPrefix?: string | null;
    listCondaEnvs?: (envsDir: string) => string[];
  },
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

  const searchDirs = [
    ...pathDirs,
    ...commonExtAgentBinDirs(opts?.home),
    ...condaExtAgentBinDirs(opts?.home, {
      condaPrefix: opts?.condaPrefix,
      exists,
      listEnvs: opts?.listCondaEnvs,
    }),
  ];

  for (const dir of searchDirs) {
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
