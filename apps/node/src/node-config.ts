import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parse } from "yaml";

export interface NodeYamlConfig {
  profile?: string;
  listen?: string[];
  discovery?: {
    profile?: "lan-fast" | "wan-default";
    connectivityStrict?: boolean;
    mdns?: boolean;
    dht?: boolean;
    dhtClientMode?: boolean;
    relay?: boolean;
    relayServer?: boolean;
    autonat?: boolean;
    dcutr?: boolean;
    p2pDebug?: boolean;
    bootstrapPresets?: Array<"public-libp2p" | "public-libp2p-am6" | "public-libp2p-am7">;
    bootstrapPeers?: string[];
  };
}

export function loadNodeYamlConfig(configPath: string): NodeYamlConfig {
  const resolvedPath = resolveConfigPath(configPath);
  let raw: string;
  try {
    raw = readFileSync(resolvedPath, "utf8");
  } catch {
    throw new Error(`Unable to read config file: ${configPath}`);
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch {
    throw new Error(`Invalid YAML in config file: ${resolvedPath}`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`Invalid node config at ${resolvedPath}: root must be an object`);
  }

  return parseNodeYamlConfig(parsed, resolvedPath);
}

function parseNodeYamlConfig(parsed: Record<string, unknown>, configPath: string): NodeYamlConfig {
  const output: NodeYamlConfig = {};
  if (parsed.profile !== undefined) {
    output.profile = parseString(parsed.profile, configPath, "profile");
  }
  if (parsed.listen !== undefined) {
    output.listen = parseStringArray(parsed.listen, configPath, "listen");
  }
  if (parsed.discovery !== undefined) {
    if (!isRecord(parsed.discovery)) {
      throw new Error(`Invalid node config at ${configPath}: discovery must be an object`);
    }
    output.discovery = parseDiscoveryConfig(parsed.discovery, configPath);
  }
  return output;
}

function parseDiscoveryConfig(parsed: Record<string, unknown>, configPath: string): NodeYamlConfig["discovery"] {
  const output: NonNullable<NodeYamlConfig["discovery"]> = {};

  if (parsed.profile !== undefined) {
    if (parsed.profile !== "lan-fast" && parsed.profile !== "wan-default") {
      throw new Error(
        `Invalid node config at ${configPath}: discovery.profile must be lan-fast or wan-default`,
      );
    }
    output.profile = parsed.profile;
  }

  if (parsed.bootstrapPresets !== undefined) {
    const presets = parseStringArray(parsed.bootstrapPresets, configPath, "discovery.bootstrapPresets");
    for (const preset of presets) {
      if (preset !== "public-libp2p" && preset !== "public-libp2p-am6" && preset !== "public-libp2p-am7") {
        throw new Error(
          `Invalid node config at ${configPath}: discovery.bootstrapPresets values must be public-libp2p, public-libp2p-am6, or public-libp2p-am7`,
        );
      }
    }
    output.bootstrapPresets = presets.map(
      (preset) => preset as "public-libp2p" | "public-libp2p-am6" | "public-libp2p-am7",
    );
  }

  if (parsed.bootstrapPeers !== undefined) {
    output.bootstrapPeers = parseStringArray(parsed.bootstrapPeers, configPath, "discovery.bootstrapPeers");
  }

  output.connectivityStrict = parseBoolean(parsed.connectivityStrict, configPath, "discovery.connectivityStrict");
  output.mdns = parseBoolean(parsed.mdns, configPath, "discovery.mdns");
  output.dht = parseBoolean(parsed.dht, configPath, "discovery.dht");
  output.dhtClientMode = parseBoolean(parsed.dhtClientMode, configPath, "discovery.dhtClientMode");
  output.relay = parseBoolean(parsed.relay, configPath, "discovery.relay");
  output.relayServer = parseBoolean(parsed.relayServer, configPath, "discovery.relayServer");
  output.autonat = parseBoolean(parsed.autonat, configPath, "discovery.autonat");
  output.dcutr = parseBoolean(parsed.dcutr, configPath, "discovery.dcutr");
  output.p2pDebug = parseBoolean(parsed.p2pDebug, configPath, "discovery.p2pDebug");

  return output;
}

function parseString(value: unknown, configPath: string, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid node config at ${configPath}: ${key} must be a non-empty string`);
  }
  return value.trim();
}

function parseStringArray(value: unknown, configPath: string, key: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid node config at ${configPath}: ${key} must be an array of strings`);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error(`Invalid node config at ${configPath}: ${key} must be an array of strings`);
    }
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function parseBoolean(value: unknown, configPath: string, key: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Invalid node config at ${configPath}: ${key} must be boolean`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveConfigPath(configPath: string): string {
  if (isAbsolute(configPath)) {
    return configPath;
  }
  const cwdPath = resolve(configPath);
  if (existsSync(cwdPath)) {
    return cwdPath;
  }
  const initCwd = process.env.INIT_CWD?.trim();
  if (initCwd) {
    const initPath = resolve(initCwd, configPath);
    if (existsSync(initPath)) {
      return initPath;
    }
  }
  return cwdPath;
}
