import type { DiscoveryProfile, HumanProfile, NodeConfig } from "@envoymesh/api";
import type { TFunction } from "../context/I18nContext.js";

export type DiscoverEmptyContext = {
  path: "nearby" | "code" | "wider";
  widerMode?: "name" | "topic" | "place";
  nodeStatus: string;
  nodeConfig: NodeConfig | null;
  humanProfile: HumanProfile | null;
  /** True when circuit reservation is not live yet (WAN Discover soft-gate). */
  relayNotReady?: boolean;
};

function discoveryProfile(config: NodeConfig | null): DiscoveryProfile | "unknown" {
  const p = config?.discoveryProfile;
  if (p === "lan-fast" || p === "wan-default" || p === "relay-only" || p === "contacts-only") {
    return p;
  }
  return "wan-default";
}

export function nearbyEmptyHint(ctx: DiscoverEmptyContext, t: TFunction): string {
  if (ctx.nodeStatus !== "running") {
    return t("emptyHints.nearbyOffline");
  }
  const profile = discoveryProfile(ctx.nodeConfig);
  if (profile === "contacts-only" || profile === "relay-only") {
    return t("emptyHints.nearbyContactsOnly");
  }
  if (ctx.nodeConfig?.enableMdns === false) {
    return t("emptyHints.nearbyMdnsOff");
  }
  return t("emptyHints.nearbyDefault");
}

export function codeEmptyHint(_ctx: DiscoverEmptyContext, t: TFunction): string {
  return t("emptyHints.codeEmpty");
}

export function widerEmptyHint(ctx: DiscoverEmptyContext, t: TFunction): string {
  if (ctx.nodeStatus !== "running") {
    return t("emptyHints.widerOffline", "Node is still starting — try again in a moment.");
  }
  if (ctx.relayNotReady) {
    return t(
      "emptyHints.widerRelayNotReady",
      "Still connecting to the mesh relay. Search again in a few seconds — Discover needs a live hop to find people across the internet.",
    );
  }
  const profile = discoveryProfile(ctx.nodeConfig);
  const visibility = ctx.humanProfile?.profileVisibility ?? "private";
  const lines: string[] = [];

  if (profile === "contacts-only" || profile === "relay-only") {
    lines.push(t("emptyHints.widerContactsOnly"));
  } else if (profile !== "wan-default" && profile !== "lan-fast") {
    lines.push(t("emptyHints.widerExplorePublic"));
  }

  if (ctx.widerMode === "name") {
    lines.push(t("emptyHints.widerNameMode"));
  } else {
    lines.push(
      visibility === "public" ? t("emptyHints.widerTopicPublic") : t("emptyHints.widerTopicPrivate"),
    );
  }

  if (lines.length === 0) {
    return t("emptyHints.widerNoMatches");
  }
  return lines.join(" ");
}

export function widerTopicHint(ctx: DiscoverEmptyContext, t: TFunction): string | null {
  const profile = discoveryProfile(ctx.nodeConfig);
  if (profile === "contacts-only") {
    return t("emptyHints.widerTopicContactsOnly");
  }
  return null;
}
