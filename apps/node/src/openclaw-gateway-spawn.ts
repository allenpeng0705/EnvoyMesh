import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveBundledOpenClawDir, resolveStandaloneOpenClawBinary } from "./bundled-paths.js";

export function ensureOpenClawEntryBootstrap(ocDir: string): void {
  const entryPath = join(ocDir, "dist", "entry.js");
  if (existsSync(entryPath)) {
    return;
  }
  mkdirSync(join(ocDir, "dist"), { recursive: true });
  writeFileSync(
    entryPath,
    [
      "// EnvoyMesh bootstrap — re-exports the gateway from TS source.",
      "// openclaw.mjs loads this file; tsx handles .ts resolution.",
      `export * from "../src/cli/run-main.ts";`,
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
