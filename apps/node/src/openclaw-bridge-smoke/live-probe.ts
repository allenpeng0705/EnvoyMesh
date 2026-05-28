import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function resolveOpenClawRoot(workspaceRoot: string): string | null {
  const fromEnv = process.env.OPENCLAW_ROOT?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const sibling = join(workspaceRoot, "..", "openclaw");
  if (existsSync(join(sibling, "openclaw.mjs"))) {
    return sibling;
  }
  return null;
}

export async function syncOpenClawExtension(
  workspaceRoot: string,
  openclawRoot: string,
): Promise<void> {
  const script = join(workspaceRoot, "scripts/install-openclaw-extension.sh");
  if (!existsSync(script)) {
    throw new Error(`install script not found: ${script}`);
  }
  await execFileAsync("bash", [script, openclawRoot], { cwd: workspaceRoot });
}

export function assertOpenClawBuildReady(openclawRoot: string): void {
  const hasDist =
    existsSync(join(openclawRoot, "dist/index.js")) ||
    existsSync(join(openclawRoot, "dist/index.mjs"));
  if (!hasDist) {
    throw new Error(
      `OpenClaw at ${openclawRoot} is not built (missing dist/index.js). Run: cd ${openclawRoot} && pnpm install && pnpm build`,
    );
  }
}
