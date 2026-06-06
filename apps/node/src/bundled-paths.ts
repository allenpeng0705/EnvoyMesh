import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Resolve pre-installed skill files shipped with EnvoyMesh (repo or Tauri bundle).
 * Runtime ClawHub installs go to `<profile>/openclaw-workspace/skills/` instead.
 */
export function resolveBundledSkillsDir(nodeCwd: string): string {
  const fromEnv = process.env.ENVOYMESH_BUNDLED_SKILLS_DIR?.trim();
  if (fromEnv) {
    return resolve(fromEnv);
  }
  return resolve(nodeCwd, "skills");
}

function tauriResourceDir(): string | undefined {
  const dir = process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim();
  return dir || undefined;
}

function isOpenClawTree(dir: string): boolean {
  return existsSync(join(dir, "openclaw.mjs")) || existsSync(join(dir, "package.json"));
}

/**
 * Resolve the OpenClaw gateway tree (monorepo packages/openclaw or Tauri resources/openclaw).
 */
export function resolveBundledOpenClawDir(nodeCwd: string): string | null {
  const fromEnv = process.env.ENVOYMESH_OPENCLAW_DIR?.trim();
  if (fromEnv && isOpenClawTree(fromEnv)) {
    return resolve(fromEnv);
  }

  const resourceDir = tauriResourceDir();
  if (resourceDir) {
    for (const candidate of [
      join(resourceDir, "openclaw"),
      join(resourceDir, "resources", "openclaw"),
    ]) {
      if (isOpenClawTree(candidate)) {
        return resolve(candidate);
      }
    }
  }

  let wsRoot = resolve(nodeCwd);
  if (!existsSync(join(wsRoot, "packages", "openclaw", "openclaw.mjs"))) {
    wsRoot = resolve(wsRoot, "..", "..");
  }
  const monorepoDir = join(wsRoot, "packages", "openclaw");
  if (isOpenClawTree(monorepoDir)) {
    return resolve(monorepoDir);
  }

  return null;
}

/** Standalone OpenClaw binary staged by fetch-openclaw-sidecar.sh (gateway fallback). */
export function resolveStandaloneOpenClawBinary(nodeCwd: string): string | null {
  const resourceDir = tauriResourceDir();
  const candidates: string[] = [];
  if (resourceDir) {
    candidates.push(join(resourceDir, "openclaw", "openclaw"));
    candidates.push(join(resourceDir, "resources", "openclaw", "openclaw"));
  }
  candidates.push(
    resolve(nodeCwd, "..", "openclaw", "openclaw"),
    resolve(nodeCwd, "..", "..", "..", "apps", "tauri", "src-tauri", "resources", "openclaw", "openclaw"),
  );
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
