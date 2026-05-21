/**
 * Kubo CLI resolution and subprocess helpers (Option B: ENVOYMESH_IPFS_EXE sidecar).
 */
import { spawnSync } from "node:child_process";

const DEFAULT_ENVOY_IPFS_API_PORT = 5017;

export function resolveIpfsExe(): string {
  const fromEnv = process.env.ENVOYMESH_IPFS_EXE?.trim();
  return fromEnv || "ipfs";
}

export function resolveIpfsPath(profileDir?: string): string {
  const fromEnv = process.env.ENVOYMESH_IPFS_PATH?.trim();
  if (fromEnv) return fromEnv;
  const profile = profileDir ?? process.env.ENVOYMESH_PROFILE?.trim() ?? "./data/default";
  return `${profile.replace(/\/$/, "")}/ipfs-kubo`;
}

export function resolveIpfsApiPort(): number {
  const raw = process.env.ENVOYMESH_IPFS_API_PORT?.trim();
  if (!raw) return DEFAULT_ENVOY_IPFS_API_PORT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_ENVOY_IPFS_API_PORT;
}

export function kuboSpawnEnv(ipfsPath: string): NodeJS.ProcessEnv {
  return { ...process.env, IPFS_PATH: ipfsPath };
}

export interface KuboSpawnSyncResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
}

export function kuboSpawnSync(
  args: readonly string[],
  ipfsPath: string,
  options?: { maxBuffer?: number },
): KuboSpawnSyncResult {
  const r = spawnSync(resolveIpfsExe(), [...args], {
    encoding: "utf8",
    shell: false,
    env: kuboSpawnEnv(ipfsPath),
    maxBuffer: options?.maxBuffer,
  });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    error: r.error as NodeJS.ErrnoException | undefined,
  };
}

export function kuboCliAvailableSync(ipfsPath: string): boolean {
  const r = kuboSpawnSync(["version", "-n"], ipfsPath);
  return r.status === 0 && r.stdout.trim().length > 0 && r.error?.code !== "ENOENT";
}

export function readKuboVersionSync(ipfsPath: string): string {
  const r = kuboSpawnSync(["version", "-n"], ipfsPath);
  if (r.status !== 0) return "unknown";
  return r.stdout.trim() || "unknown";
}

export function kuboDaemonReadySync(ipfsPath: string): boolean {
  const r = kuboSpawnSync(["id"], ipfsPath);
  return r.status === 0 && !r.error;
}
