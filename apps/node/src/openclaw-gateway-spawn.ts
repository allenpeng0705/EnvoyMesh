import { spawn, type ChildProcess } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { resolveBundledOpenClawDir, resolveStandaloneOpenClawBinary } from "./bundled-paths.js";

function tauriResourceDir(): string | undefined {
  const dir = process.env.TAURI_RESOURCE_DIR?.trim() || process.env.TAURI_APP_RESOURCES_DIR?.trim();
  return dir || undefined;
}

/**
 * Restore extensions/envoymesh (and dist/extensions mirror) when missing.
 *
 * Sources (first hit wins):
 *   1. Sibling seed resources/openclaw-envoymesh (staged every desktop build)
 *   2. dist/extensions/envoymesh or dist-runtime/extensions/envoymesh
 *
 * Idempotent. Called before validateOpenClawTree so a stale OpenClaw cache
 * or install-time strip does not hard-fail the gateway.
 */
export function ensureOpenClawEnvoyMeshExtension(ocDir: string): {
  ok: boolean;
  source?: string;
  reason?: string;
} {
  const primary = join(ocDir, "extensions", "envoymesh", "index.js");
  const distPrimary = join(ocDir, "dist", "extensions", "envoymesh", "index.js");
  if (existsSync(primary) && existsSync(distPrimary)) {
    return { ok: true, source: "present" };
  }

  const candidates: string[] = [];
  const resourceDir = tauriResourceDir();
  if (resourceDir) {
    candidates.push(join(resourceDir, "openclaw-envoymesh"));
    candidates.push(join(resourceDir, "resources", "openclaw-envoymesh"));
  }
  // Sibling of the openclaw tree (Tauri resources layout).
  candidates.push(join(ocDir, "..", "openclaw-envoymesh"));
  candidates.push(join(ocDir, "dist", "extensions", "envoymesh"));
  candidates.push(join(ocDir, "dist-runtime", "extensions", "envoymesh"));
  candidates.push(join(ocDir, "extensions", "envoymesh"));

  let src: string | undefined;
  for (const c of candidates) {
    if (existsSync(join(c, "index.js"))) {
      src = c;
      break;
    }
  }
  if (!src) {
    return {
      ok: false,
      reason: "no envoymesh seed or mirror with index.js found",
    };
  }

  const installInto = (dest: string) => {
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) {
      rmSync(dest, { recursive: true, force: true });
    }
    cpSync(src!, dest, { recursive: true });
  };

  try {
    if (!existsSync(primary)) {
      installInto(join(ocDir, "extensions", "envoymesh"));
    }
    if (!existsSync(distPrimary)) {
      installInto(join(ocDir, "dist", "extensions", "envoymesh"));
    }
    const runtimeRoot = join(ocDir, "dist-runtime");
    if (existsSync(runtimeRoot)) {
      const runtimeExt = join(runtimeRoot, "extensions", "envoymesh", "index.js");
      if (!existsSync(runtimeExt)) {
        installInto(join(runtimeRoot, "extensions", "envoymesh"));
      }
    }
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (!existsSync(primary)) {
    return { ok: false, reason: `heal from ${src} did not produce ${primary}` };
  }
  return { ok: true, source: src };
}

/**
 * Pre-flight check: verify the OpenClaw tree has all critical files needed
 * for the gateway to start.  Returns `{ ok: true }` or `{ ok: false; missing }`
 * with a list of missing/invalid paths.
 *
 * This catches packaging failures early — before spawning — so the user
 * gets a clear, actionable error instead of a cryptic ERR_MODULE_NOT_FOUND.
 */
export function validateOpenClawTree(ocDir: string): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];

  // 1. dist/entry.js must exist and be a proper compiled build (not a stub)
  const entryPath = join(ocDir, "dist", "entry.js");
  if (!existsSync(entryPath)) {
    missing.push("dist/entry.js (compiled gateway entry)");
  } else {
    try {
      const content = readFileSync(entryPath, "utf-8");
      if (content.startsWith("// EnvoyMesh bootstrap")) {
        missing.push("dist/entry.js (is a stub, not a compiled build)");
      }
    } catch {
      missing.push("dist/entry.js (not readable)");
    }
  }

  // 2. node_modules/openclaw/package.json — resolves "openclaw/*" imports
  if (!existsSync(join(ocDir, "node_modules", "openclaw", "package.json"))) {
    missing.push("node_modules/openclaw (required for plugin-sdk imports)");
  }

  // 3. extensions/envoymesh/index.js — compiled EnvoyMesh channel extension
  if (!existsSync(join(ocDir, "extensions", "envoymesh", "index.js"))) {
    missing.push("extensions/envoymesh/index.js (compiled EnvoyMesh channel extension)");
  }

  // 4. dist/config/config.js — config module imported by gateway runtime
  if (!existsSync(join(ocDir, "dist", "config", "config.js"))) {
    missing.push("dist/config/config.js (gateway config module)");
  }

  // 5. openclaw.mjs — gateway entry point
  if (!existsSync(join(ocDir, "openclaw.mjs"))) {
    missing.push("openclaw.mjs (gateway entry script)");
  }

  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

/**
 * Ensure dist/entry.js exists and is runnable. Behavior:
 * - If a proper compiled entry.js already exists (imports compiled JS chunks),
 *   leave it alone — it's the production bundle and works without src/.
 * - If entry.js is missing or is itself a stub (references run-main), write a
 *   fresh stub. The stub prefers the compiled CLI path; falls back to the .ts
 *   source path for dev mode.
 *
 * In Tauri bundles (detected via TAURI_RESOURCE_DIR or TAURI_APP_RESOURCES_DIR
 * env vars), the .ts fallback is NOT used because src/ is excluded from the
 * bundle.  If dist/cli/run-main.js is also missing, this throws an error
 * instead of writing a guaranteed-to-fail stub.
 */
export function ensureOpenClawEntryBootstrap(ocDir: string): void {
  const entryPath = join(ocDir, "dist", "entry.js");

  // Check for an existing proper compiled entry.js (not a stub we wrote).
  // Our stubs always start with "// EnvoyMesh bootstrap".
  if (existsSync(entryPath)) {
    try {
      const existing = readFileSync(entryPath, "utf-8");
      const isStub = existing.startsWith("// EnvoyMesh bootstrap");
      if (!isStub) {
        // Proper compiled bundle — don't overwrite.
        return;
      }
    } catch {
      // If we can't read it, fall through and rewrite.
    }
  }

  // Write stub. Must call runCli directly because tsx sets process.argv[1]
  // to tsx/cli.mjs, which makes src/entry.ts's isMainModule guard return
  // false (skipping all side effects).
  // Prefer the compiled JS path (works in Tauri bundles without src/);
  // fall back to the .ts source path (dev mode with tsx).
  mkdirSync(join(ocDir, "dist"), { recursive: true });
  const compiledCli = join(ocDir, "dist", "cli", "run-main.js");
  const isTauriBundle =
    existsSync(join(ocDir, "..", "resources")) ||
    !!process.env.TAURI_RESOURCE_DIR ||
    !!process.env.TAURI_APP_RESOURCES_DIR;

  if (existsSync(compiledCli)) {
    writeFileSync(
      entryPath,
      [
        "// EnvoyMesh bootstrap — calls runCli directly.",
        `import { runCli } from "./cli/run-main.js";`,
        `runCli(process.argv).catch((err) => {`,
        `  console.error("[entry] Fatal error:", err);`,
        `  process.exit(1);`,
        `});`,
        "",
      ].join("\n"),
      "utf-8",
    );
  } else if (!isTauriBundle) {
    // Dev mode: safe to reference .ts source (tsx will transpile).
    writeFileSync(
      entryPath,
      [
        "// EnvoyMesh bootstrap — calls runCli directly.",
        `import { runCli } from "../src/cli/run-main.ts";`,
        `runCli(process.argv).catch((err) => {`,
        `  console.error("[entry] Fatal error:", err);`,
        `  process.exit(1);`,
        `});`,
        "",
      ].join("\n"),
      "utf-8",
    );
  } else {
    // Tauri bundle with no compiled CLI — we cannot write a working stub.
    // Throw an error so the caller surfaces a clear message instead of
    // writing a stub that is guaranteed to crash.
    throw new Error(
      `OpenClaw dist/entry.js is missing and neither dist/cli/run-main.js ` +
        `nor src/cli/run-main.ts is available (Tauri bundle). ` +
        `Reinstall the app or rebuild the desktop bundle.`,
    );
  }
}

export type SpawnOpenClawGatewayParams = {
  nodeCwd: string;
  gatewayPort: number;
  gatewayEnv: Record<string, string>;
};

export function spawnOpenClawGateway(params: SpawnOpenClawGatewayParams): ChildProcess {
  const ocDir = resolveBundledOpenClawDir(params.nodeCwd);
  if (!ocDir) {
    throw new Error(
      "OpenClaw not found — run ./scripts/setup.sh (dev) or rebuild the desktop bundle with OpenClaw staged",
    );
  }

  // Heal envoymesh channel before validation — seed/mirror can restore a
  // tree that lost extensions/envoymesh during OpenClaw cache reuse or install.
  const heal = ensureOpenClawEnvoyMeshExtension(ocDir);
  if (heal.ok && heal.source && heal.source !== "present") {
    console.info(`[openclaw] restored envoymesh extension from ${heal.source}`);
  }

  // Pre-flight validation: check critical files before spawning.
  const validation = validateOpenClawTree(ocDir);
  if (!validation.ok) {
    const healHint =
      heal.ok || !heal.reason
        ? ""
        : `\n  (envoymesh heal also failed: ${heal.reason})`;
    throw new Error(
      `OpenClaw tree is incomplete (missing ${validation.missing.length} item(s)). ` +
        `Reinstall the app or rebuild the desktop bundle.\n` +
        `  Missing:\n    ${validation.missing.join("\n    ")}` +
        healHint,
    );
  }

  ensureOpenClawEntryBootstrap(ocDir);

  const gatewayArgs = [
    "gateway",
    "--port",
    String(params.gatewayPort),
    "--bind",
    "loopback",
    "--auth",
    "none",
    "--allow-unconfigured",
  ];

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...params.gatewayEnv,
    OPENCLAW_BUNDLED_PLUGINS_DIR: resolve(ocDir, "extensions"),
  };

  const nodeExe = process.env.ENVOYMESH_NODE_EXE?.trim() || process.execPath;
  const tsxCli = join(ocDir, "node_modules", "tsx", "dist", "cli.mjs");
  const openclawMjs = join(ocDir, "openclaw.mjs");
  const distEntry = join(ocDir, "dist", "entry.js");

  // Preferred path: run openclaw.mjs directly under Node.js when a compiled
  // dist/entry.js exists.  openclaw.mjs imports dist/entry.js, so tsx is not
  // needed.  This works in Tauri bundles where tsx is pruned by pnpm --prod.
  if (existsSync(openclawMjs)) {
    let hasProperBuild = false;
    if (existsSync(distEntry)) {
      try {
        const content = readFileSync(distEntry, "utf-8");
        hasProperBuild = !content.startsWith("// EnvoyMesh bootstrap");
      } catch { /* not readable */ }
    }
    if (hasProperBuild) {
      return spawn(nodeExe, [openclawMjs, ...gatewayArgs], {
        cwd: ocDir,
        stdio: ["ignore", "pipe", "pipe"],
        env,
      });
    }
  }

  // Dev path: use tsx to transpile .ts sources at runtime.
  if (existsSync(tsxCli) && existsSync(openclawMjs)) {
    return spawn(nodeExe, [tsxCli, openclawMjs, ...gatewayArgs], {
      cwd: ocDir,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
  }

  const standalone = resolveStandaloneOpenClawBinary(params.nodeCwd);
  if (standalone) {
    return spawn(standalone, [...gatewayArgs], {
      cwd: ocDir,
      stdio: ["ignore", "pipe", "pipe"],
      env,
    });
  }

  return spawn("pnpm", ["exec", "tsx", "openclaw.mjs", ...gatewayArgs], {
    cwd: ocDir,
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
}
