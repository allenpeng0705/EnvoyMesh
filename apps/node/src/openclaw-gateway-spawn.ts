import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveBundledOpenClawDir, resolveStandaloneOpenClawBinary } from "./bundled-paths.js";

export function ensureOpenClawEntryBootstrap(ocDir: string): void {
  const entryPath = join(ocDir, "dist", "entry.js");
  // Always overwrite. The stub must call runCli directly because tsx sets
  // process.argv[1] to tsx/cli.mjs, which makes src/entry.ts's isMainModule
  // guard return false (skipping all side effects).
  mkdirSync(join(ocDir, "dist"), { recursive: true });
  writeFileSync(
    entryPath,
    [
      "// EnvoyMesh bootstrap — calls runCli directly.",
      "// We can't import src/entry.ts because its isMainModule guard checks",
      "// process.argv[1], which under tsx points to tsx/cli.mjs, not entry.ts.",
      "// So we import runCli and call it ourselves.",
      `import { runCli } from "../src/cli/run-main.ts";`,
      `runCli(process.argv).catch((err) => {`,
      `  console.error("[entry] Fatal error:", err);`,
      `  process.exit(1);`,
      `});`,
      "",
    ].join("\n"),
    "utf-8",
  );
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
