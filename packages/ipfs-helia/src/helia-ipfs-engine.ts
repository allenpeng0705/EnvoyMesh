/**
 * Helia engine lifecycle — profile blockstore dir marker, no libp2p daemon.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readHeliaPackageVersionSync } from "./helia-version.js";

export interface HeliaIpfsEngineStatus {
  available: boolean;
  running: boolean;
  managed: boolean;
  heliaVersion?: string;
  blocksPath?: string;
  errorHint?: string;
}

export function resolveHeliaBlocksPath(profileDir: string): string {
  return join(profileDir, "helia-blocks");
}

export async function ensureHeliaIpfsReady(input: { profileDir: string }): Promise<void> {
  await mkdir(resolveHeliaBlocksPath(input.profileDir), { recursive: true });
}

export function getHeliaIpfsEngineStatus(profileDir: string): HeliaIpfsEngineStatus {
  const blocksPath = resolveHeliaBlocksPath(profileDir);
  try {
    return {
      available: true,
      running: false,
      managed: false,
      heliaVersion: readHeliaPackageVersionSync(),
      blocksPath,
    };
  } catch (err) {
    return {
      available: false,
      running: false,
      managed: false,
      blocksPath,
      errorHint: err instanceof Error ? err.message : "Helia engine unavailable",
    };
  }
}
