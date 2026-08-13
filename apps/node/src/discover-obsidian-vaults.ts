/**
 * Discover Obsidian vault folders on the home node.
 * Primary: Obsidian's own obsidian.json vault registry.
 * Fallback: shallow scan of common user folders for a `.obsidian` marker.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { resolveHomeFsDirectory } from "./home-fs.js";

export interface DiscoverObsidianVaultsResult {
  paths: string[];
  /** Where candidates came from (for diagnostics / UI). */
  sources: Array<{ path: string; source: "obsidian.json" | "scan" }>;
}

function obsidianConfigCandidates(home: string): string[] {
  return [
    // macOS
    path.join(home, "Library", "Application Support", "obsidian", "obsidian.json"),
    // Linux (and Flatpak-ish)
    path.join(home, ".config", "obsidian", "obsidian.json"),
    path.join(
      home,
      ".var",
      "app",
      "md.obsidian.Obsidian",
      "config",
      "obsidian",
      "obsidian.json",
    ),
    // Windows
    path.join(home, "AppData", "Roaming", "obsidian", "obsidian.json"),
  ];
}

function isObsidianVaultDir(abs: string): boolean {
  try {
    return existsSync(path.join(abs, ".obsidian")) && statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

/** Parse vault paths from Obsidian's obsidian.json. */
export function parseObsidianJsonVaultPaths(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];
  const vaults = (parsed as { vaults?: unknown }).vaults;
  if (!vaults || typeof vaults !== "object") return [];
  const out: string[] = [];
  for (const entry of Object.values(vaults as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const p = (entry as { path?: unknown }).path;
    if (typeof p !== "string" || !p.trim()) continue;
    out.push(p.trim());
  }
  return out;
}

function readVaultsFromObsidianJson(home: string): string[] {
  const found: string[] = [];
  for (const configPath of obsidianConfigCandidates(home)) {
    if (!existsSync(configPath)) continue;
    let raw: string;
    try {
      raw = readFileSync(configPath, "utf8");
    } catch {
      continue;
    }
    for (const p of parseObsidianJsonVaultPaths(raw)) {
      const abs = resolveHomeFsDirectory(p);
      if (abs && isObsidianVaultDir(abs) && !found.includes(abs)) found.push(abs);
    }
  }
  return found;
}

const SCAN_SKIP = new Set([
  "Library",
  "node_modules",
  ".git",
  ".Trash",
  "AppData",
  "Applications",
  "Movies",
  "Music",
  "Pictures",
  "Downloads",
]);

/**
 * Shallow BFS under start roots looking for dirs that contain `.obsidian`.
 * Caps breadth/depth so home scans stay cheap.
 */
export function scanForObsidianVaultMarkers(
  startRoots: string[],
  opts?: { maxDepth?: number; maxDirs?: number },
): string[] {
  const maxDepth = opts?.maxDepth ?? 3;
  const maxDirs = opts?.maxDirs ?? 400;
  const found: string[] = [];
  const queue: Array<{ dir: string; depth: number }> = [];
  let visited = 0;

  for (const root of startRoots) {
    const abs = resolveHomeFsDirectory(root);
    if (!abs) continue;
    queue.push({ dir: abs, depth: 0 });
  }

  while (queue.length > 0 && visited < maxDirs) {
    const { dir, depth } = queue.shift()!;
    visited += 1;
    if (isObsidianVaultDir(dir) && !found.includes(dir)) {
      found.push(dir);
      // Don't descend into a vault's children.
      continue;
    }
    if (depth >= maxDepth) continue;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith(".") || SCAN_SKIP.has(name)) continue;
      const full = path.join(dir, name);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      queue.push({ dir: full, depth: depth + 1 });
    }
  }
  return found;
}

function defaultScanRoots(home: string): string[] {
  return [
    home,
    path.join(home, "Documents"),
    path.join(home, "Desktop"),
    path.join(home, "Obsidian"),
    path.join(home, "iCloud Drive", "Obsidian"),
    path.join(home, "Library", "Mobile Documents", "iCloud~md~obsidian", "Documents"),
    path.join(home, "OneDrive", "Documents"),
  ];
}

/**
 * Discover existing Obsidian vault directories on this machine (owner-only use).
 */
export function discoverObsidianVaults(): DiscoverObsidianVaultsResult {
  const home = path.resolve(homedir());
  const sources: DiscoverObsidianVaultsResult["sources"] = [];
  const paths: string[] = [];

  const add = (abs: string, source: "obsidian.json" | "scan") => {
    if (!abs || paths.includes(abs)) return;
    paths.push(abs);
    sources.push({ path: abs, source });
  };

  for (const p of readVaultsFromObsidianJson(home)) {
    add(p, "obsidian.json");
  }

  // Also pick up vaults that exist on disk but are not in obsidian.json yet.
  for (const p of scanForObsidianVaultMarkers(defaultScanRoots(home), {
    maxDepth: 2,
    maxDirs: 250,
  })) {
    add(p, "scan");
  }

  return { paths, sources };
}
