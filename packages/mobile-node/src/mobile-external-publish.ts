/**
 * Persists externalPublish policy for mobile (localStorage — same WebView as Social UI).
 */
import type { ExternalPublishConfig } from "@envoymesh/api";

export type MobileIpfsExportEngine = "helia";

export interface MobileExternalPublishConfig {
  allowIpfs: boolean;
  gatewayAllowlist: string[];
  ipfsExportEngine: MobileIpfsExportEngine;
}

const DEFAULT: MobileExternalPublishConfig = {
  allowIpfs: false,
  gatewayAllowlist: [],
  ipfsExportEngine: "helia",
};

function _storageKey(ownerId: string): string {
  return `envoymesh_mobile_external_publish_${ownerId}`;
}

export function loadMobileExternalPublish(ownerId: string): MobileExternalPublishConfig {
  try {
    const raw =
      typeof localStorage !== "undefined" ? localStorage.getItem(_storageKey(ownerId)) : null;
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<ExternalPublishConfig>;
    return {
      allowIpfs: parsed.allowIpfs ?? false,
      gatewayAllowlist: [...(parsed.gatewayAllowlist ?? [])],
      ipfsExportEngine: "helia",
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveMobileExternalPublish(
  ownerId: string,
  config: Partial<ExternalPublishConfig>,
): MobileExternalPublishConfig {
  const current = loadMobileExternalPublish(ownerId);
  const next: MobileExternalPublishConfig = {
    allowIpfs: config.allowIpfs ?? current.allowIpfs,
    gatewayAllowlist: config.gatewayAllowlist ?? current.gatewayAllowlist,
    ipfsExportEngine: "helia",
  };
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(_storageKey(ownerId), JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
  return next;
}
