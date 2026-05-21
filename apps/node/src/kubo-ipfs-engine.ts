/**
 * Managed Kubo daemon lifecycle (Option C) — isolated IPFS_PATH, lazy start on export.
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import {
  kuboCliAvailableSync,
  kuboDaemonReadySync,
  kuboSpawnEnv,
  kuboSpawnSync,
  readKuboVersionSync,
  resolveIpfsApiPort,
  resolveIpfsExe,
  resolveIpfsPath,
} from "./kubo-ipfs-cli.js";

export interface KuboIpfsEngineStatus {
  available: boolean;
  running: boolean;
  /** True when EnvoyMesh spawned the daemon for this process lifetime. */
  managed: boolean;
  kuboVersion?: string;
  ipfsPath?: string;
  errorHint?: string;
}

let managedDaemonChild: ChildProcess | null = null;
let managedWeSpawned = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function userFacingEngineMissingHint(): string {
  return "IPFS engine is not available. Restart EnvoyMesh or reinstall the desktop app with IPFS support.";
}

async function ensureRepoInitialized(ipfsPath: string): Promise<void> {
  await mkdir(ipfsPath, { recursive: true });
  const configPath = join(ipfsPath, "config");
  if (existsSync(configPath)) return;

  const init = kuboSpawnSync(["init"], ipfsPath);
  if (init.status !== 0) {
    const detail = (init.stderr || init.stdout).trim();
    throw new Error(detail || "IPFS engine failed to initialize its local repository");
  }

  const apiPort = resolveIpfsApiPort();
  const gatewayPort = apiPort + 1;
  kuboSpawnSync(["config", "Addresses.API", `/ip4/127.0.0.1/tcp/${apiPort}`], ipfsPath);
  kuboSpawnSync(["config", "Addresses.Gateway", `/ip4/127.0.0.1/tcp/${gatewayPort}`], ipfsPath);
  kuboSpawnSync(["config", "--json", "Routing.Type", "none"], ipfsPath);
}

async function waitForDaemonReady(ipfsPath: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (kuboDaemonReadySync(ipfsPath)) return true;
    await sleep(200);
  }
  return false;
}

/**
 * Ensure Kubo CLI exists, repo is initialized, and the API is reachable — starting a managed daemon if needed.
 */
export async function ensureKuboIpfsReady(input: { profileDir: string }): Promise<void> {
  const ipfsPath = resolveIpfsPath(input.profileDir);
  if (!kuboCliAvailableSync(ipfsPath)) {
    throw new Error(userFacingEngineMissingHint());
  }

  await ensureRepoInitialized(ipfsPath);

  if (kuboDaemonReadySync(ipfsPath)) return;

  if (!managedDaemonChild || managedDaemonChild.exitCode !== null) {
    const exe = resolveIpfsExe();
    managedDaemonChild = spawn(exe, ["daemon"], {
      env: kuboSpawnEnv(ipfsPath),
      stdio: "ignore",
      detached: false,
    });
    managedWeSpawned = true;
    managedDaemonChild.on("error", () => {
      /* readiness polling surfaces failures */
    });
  }

  const ready = await waitForDaemonReady(ipfsPath, 30_000);
  if (!ready) {
    throw new Error("IPFS engine did not start in time. Try again or restart EnvoyMesh.");
  }
}

export function getKuboIpfsEngineStatus(profileDir: string): KuboIpfsEngineStatus {
  const ipfsPath = resolveIpfsPath(profileDir);
  if (!kuboCliAvailableSync(ipfsPath)) {
    return {
      available: false,
      running: false,
      managed: false,
      ipfsPath,
      errorHint: userFacingEngineMissingHint(),
    };
  }

  const running = kuboDaemonReadySync(ipfsPath);
  return {
    available: true,
    running,
    managed: managedWeSpawned && running,
    kuboVersion: readKuboVersionSync(ipfsPath),
    ipfsPath,
  };
}

export async function shutdownKuboIpfsEngine(): Promise<void> {
  if (!managedDaemonChild) return;
  const child = managedDaemonChild;
  managedDaemonChild = null;
  managedWeSpawned = false;
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** @internal test helper */
export function _resetKuboIpfsEngineForTests(): void {
  managedDaemonChild = null;
  managedWeSpawned = false;
}

process.on("exit", () => {
  if (managedDaemonChild?.pid != null && managedDaemonChild.exitCode === null) {
    try {
      process.kill(managedDaemonChild.pid, "SIGTERM");
    } catch {
      /* best-effort when the node process exits */
    }
  }
});
