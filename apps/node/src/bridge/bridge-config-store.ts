import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ExtAgentDefinition } from "@envoymesh/api";
import {
  applyActiveExtAgent,
  BridgeConfigSchema,
  type BridgeConfig,
  DEFAULT_BRIDGE_CONFIG,
  normalizeBridgeExtAgents,
} from "./config.js";

export interface ExtAgentSettingsPatch {
  activeExtAgentId?: string;
  extAgents?: ExtAgentDefinition[];
  bridgeListenPort?: number;
}

export function bridgeConfigPathForProfile(profileDir: string): string {
  return join(profileDir, "bridge-config.json");
}

export async function loadBridgeConfigFromProfile(
  profileDir: string,
): Promise<BridgeConfig> {
  try {
    const raw = await readFile(bridgeConfigPathForProfile(profileDir), "utf-8");
    const parsed = BridgeConfigSchema.parse(JSON.parse(raw));
    return applyActiveExtAgent(parsed);
  } catch {
    return applyActiveExtAgent(BridgeConfigSchema.parse(DEFAULT_BRIDGE_CONFIG));
  }
}

export async function saveBridgeConfigToProfile(
  profileDir: string,
  patch: Partial<BridgeConfig>,
): Promise<BridgeConfig> {
  const path = bridgeConfigPathForProfile(profileDir);
  let current: BridgeConfig;
  try {
    const raw = await readFile(path, "utf-8");
    current = BridgeConfigSchema.parse(JSON.parse(raw));
  } catch {
    current = BridgeConfigSchema.parse(DEFAULT_BRIDGE_CONFIG);
  }
  const merged = applyActiveExtAgent(
    BridgeConfigSchema.parse({
      ...current,
      ...patch,
      extAgents: patch.extAgents ?? current.extAgents,
    }),
  );
  await mkdir(profileDir, { recursive: true });
  await writeFile(path, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return merged;
}

export async function applyExtAgentSettingsPatch(
  profileDir: string,
  patch: ExtAgentSettingsPatch,
): Promise<BridgeConfig> {
  const bridgePatch: Partial<BridgeConfig> = {};
  if (patch.activeExtAgentId !== undefined) {
    bridgePatch.activeExtAgent = patch.activeExtAgentId.trim() || undefined;
  }
  if (patch.extAgents !== undefined) {
    bridgePatch.extAgents = normalizeBridgeExtAgents({
      ...DEFAULT_BRIDGE_CONFIG,
      extAgents: patch.extAgents,
    });
  }
  if (patch.bridgeListenPort !== undefined) {
    bridgePatch.listenPort = patch.bridgeListenPort;
  }
  if (Object.keys(bridgePatch).length === 0) {
    return loadBridgeConfigFromProfile(profileDir);
  }
  return saveBridgeConfigToProfile(profileDir, bridgePatch);
}

export function extractExtAgentSettingsPatch(
  config: Record<string, unknown>,
): { nodePatch: Record<string, unknown>; extPatch: ExtAgentSettingsPatch } {
  const nodePatch = { ...config };
  const extPatch: ExtAgentSettingsPatch = {};

  if ("activeExtAgentId" in nodePatch) {
    extPatch.activeExtAgentId =
      typeof nodePatch.activeExtAgentId === "string"
        ? nodePatch.activeExtAgentId
        : undefined;
    delete nodePatch.activeExtAgentId;
  }
  if ("extAgents" in nodePatch) {
    extPatch.extAgents = Array.isArray(nodePatch.extAgents)
      ? (nodePatch.extAgents as ExtAgentDefinition[])
      : undefined;
    delete nodePatch.extAgents;
  }
  if ("bridgeListenPort" in nodePatch) {
    extPatch.bridgeListenPort =
      typeof nodePatch.bridgeListenPort === "number"
        ? nodePatch.bridgeListenPort
        : undefined;
    delete nodePatch.bridgeListenPort;
  }

  return { nodePatch, extPatch };
}
