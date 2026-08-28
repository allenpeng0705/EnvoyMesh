import type { DiscoveryProfile } from "@envoymesh/api";
import type { TFunction } from "../context/I18nContext.js";

export type NetworkPresetId = "same-wifi" | "friends-internet" | "explore-public";

export type NetworkPresetCore = {
  id: NetworkPresetId;
  discoveryProfile: DiscoveryProfile;
  bootstrapPresets: readonly string[];
  enableMdns: boolean;
};

export type NetworkPresetConfig = NetworkPresetCore & {
  label: string;
  description: string;
};

const NETWORK_PRESET_CORE: readonly NetworkPresetCore[] = [
  {
    id: "same-wifi",
    discoveryProfile: "lan-fast",
    bootstrapPresets: [],
    enableMdns: true,
  },
  {
    id: "friends-internet",
    discoveryProfile: "relay-only",
    bootstrapPresets: ["cn-relay", "us-relay"],
    enableMdns: true,
  },
  {
    id: "explore-public",
    discoveryProfile: "wan-default",
    bootstrapPresets: ["public-libp2p", "cn-relay", "us-relay"],
    enableMdns: true,
  },
];

const PRESET_I18N: Record<NetworkPresetId, { label: string; description: string }> = {
  "same-wifi": {
    label: "networkPresets.sameWifi",
    description: "networkPresets.sameWifiDesc",
  },
  "friends-internet": {
    label: "networkPresets.friendsInternet",
    description: "networkPresets.friendsInternetDesc",
  },
  "explore-public": {
    label: "networkPresets.explorePublic",
    description: "networkPresets.explorePublicDesc",
  },
};

export function getNetworkPresets(t: TFunction): NetworkPresetConfig[] {
  return NETWORK_PRESET_CORE.map((core) => ({
    ...core,
    label: t(PRESET_I18N[core.id].label),
    description: t(PRESET_I18N[core.id].description),
  }));
}

export function networkPresetById(id: NetworkPresetId): NetworkPresetCore {
  const preset = NETWORK_PRESET_CORE.find((p) => p.id === id);
  if (!preset) throw new Error(`unknown network preset: ${id}`);
  return preset;
}

/** Map persisted discovery profile (+ presets) to the closest user-facing preset card. */
export function resolveNetworkPreset(
  profile: DiscoveryProfile | undefined,
  bootstrapPresets: readonly string[] | undefined,
): NetworkPresetId {
  const p = profile ?? "lan-fast";
  if (p === "lan-fast") return "same-wifi";
  if (p === "relay-only" || p === "contacts-only") return "friends-internet";
  if (p === "wan-default") return "explore-public";
  return "same-wifi";
}
