import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { resolveEnvoyMeshPath } from "./node-config.js";

export type BootstrapPresetRegistry = Map<string, string[]>;

export function mergeBootstrapPresetYamlFiles(paths: string[], into: BootstrapPresetRegistry): void {
  for (const rawPath of paths) {
    const path = resolveEnvoyMeshPath(rawPath);
    let fileRaw: string;
    try {
      fileRaw = readFileSync(path, "utf8");
    } catch {
      throw new Error(`Unable to read bootstrap presets file: ${rawPath}`);
    }

    let parsed: unknown;
    try {
      parsed = parse(fileRaw);
    } catch {
      throw new Error(`Invalid YAML in bootstrap presets file: ${path}`);
    }

    if (!isRecord(parsed)) {
      throw new Error(`Invalid bootstrap presets file at ${path}: root must be an object`);
    }

    for (const [nameRaw, peersRaw] of Object.entries(parsed)) {
      const name = nameRaw.trim();
      if (!isValidPresetName(name)) {
        throw new Error(`Invalid bootstrap preset name in ${path}: ${nameRaw}`);
      }
      if (!Array.isArray(peersRaw) || peersRaw.some((entry) => typeof entry !== "string")) {
        throw new Error(`Invalid bootstrap preset peers for ${name} in ${path}: expected string[]`);
      }
      const peers = peersRaw.map((entry) => entry.trim()).filter(Boolean);
      if (peers.length === 0) {
        throw new Error(`Invalid bootstrap preset peers for ${name} in ${path}: empty list`);
      }
      into.set(name, dedupePeers([...(into.get(name) ?? []), ...peers]));
    }
  }
}

function isValidPresetName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,64}$/.test(name);
}

function dedupePeers(peers: string[]): string[] {
  return [...new Set(peers)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
