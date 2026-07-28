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
  /** Optional Bearer secret for POST /bridge/send — changing this rebinds the HTTP server. */
  secret?: string;
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
  if (patch.secret !== undefined) {
    const trimmed = patch.secret.trim();
    bridgePatch.secret = trimmed.length > 0 ? trimmed : undefined;
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
  if ("bridgeSecret" in nodePatch || "secret" in nodePatch) {
    const raw = nodePatch.bridgeSecret ?? nodePatch.secret;
    extPatch.secret = typeof raw === "string" ? raw : undefined;
    delete nodePatch.bridgeSecret;
    delete nodePatch.secret;
  }

  return { nodePatch, extPatch };
}

export interface BridgeRebindPreviousState {
  bridgeEnabled: boolean;
  listenPort: number;
  secret?: string;
}

/**
 * Decide whether Ext Agent / bridge settings require stopping and recreating
 * the HTTP listener. Social and EnvoyGo often resend `bridgeEnabled` +
 * `bridgeListenPort` on every Ext Agent save; only true deltas should rebind
 * so `activeExtAgentId` switches stay on the hot `updateLiveConfig` path.
 */
export function shouldRebindAgentBridge(params: {
  nodePatch: Record<string, unknown>;
  extPatch: ExtAgentSettingsPatch;
  previous: BridgeRebindPreviousState;
}): { needed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (Object.prototype.hasOwnProperty.call(params.nodePatch, "bridgeEnabled")) {
    const nextEnabled = params.nodePatch.bridgeEnabled === true;
    if (nextEnabled !== params.previous.bridgeEnabled) {
      reasons.push("bridgeEnabled");
    }
  }
  if (params.extPatch.bridgeListenPort !== undefined) {
    if (params.extPatch.bridgeListenPort !== params.previous.listenPort) {
      reasons.push("listenPort");
    }
  }
  if (params.extPatch.secret !== undefined) {
    const nextSecret = params.extPatch.secret.trim() || undefined;
    const prevSecret = params.previous.secret?.trim() || undefined;
    if (nextSecret !== prevSecret) {
      reasons.push("secret");
    }
  }
  return { needed: reasons.length > 0, reasons };
}
