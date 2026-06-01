import type { NodeConfig } from "@envoymesh/api";
import { resolveNetworkPreset } from "./network-presets.js";

export type DiscoverPath = "nearby" | "code" | "wider";

export function resolveDiscoverDefaultPath(nodeConfig: NodeConfig | null | undefined): DiscoverPath {
  const preset = resolveNetworkPreset(nodeConfig?.discoveryProfile, nodeConfig?.bootstrapPresets);
  return preset === "same-wifi" ? "nearby" : "code";
}
