/**
 * Bootstrap Address Resolution
 *
 * Supports two formats:
 * 1. Full multiaddr: /ip4/1.2.3.4/tcp/4001/p2p/QmPeerId
 * 2. Domain name: relay.example.com (will fetch http://domain/info to get full multiaddr)
 */

import {
  DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR,
  DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR,
} from "@envoymesh/api";

export interface ResolvedBootstrapAddr {
  original: string;
  resolved: string[];
  success: boolean;
}

/**
 * Check if an address looks like a domain (no /p2p/ and contains letters)
 */
export function looksLikeDomain(addr: string): boolean {
  // If it contains /p2p/, it's a full multiaddr with peer ID
  if (addr.includes("/p2p/")) {
    return false;
  }
  // If it starts with /, it's likely a multiaddr without peer ID
  if (addr.startsWith("/")) {
    return false;
  }
  // Contains at least one dot and some letters - likely a domain
  return addr.includes(".") && /[a-zA-Z]/.test(addr);
}

/**
 * Resolve a domain to multiaddr(s) via HTTP /info endpoint
 */
export async function resolveDomainToMultiaddrs(domain: string): Promise<string[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`http://${domain}/info`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[bootstrap] Failed to fetch /info from ${domain}: ${response.status}`);
      return [];
    }

    const data = await response.json() as { peerId: string; addrs: string[] };

    if (!data.peerId || !data.addrs) {
      console.warn(`[bootstrap] Invalid /info response from ${domain}`);
      return [];
    }

    // Convert addrs to full multiaddr with peer ID
    const multiaddrs = data.addrs.map((addr: string) => {
      // If addr already has /p2p/, use it
      if (addr.includes("/p2p/")) {
        return addr;
      }
      // Append peer ID
      return `${addr}/p2p/${data.peerId}`;
    });

    console.log(`[bootstrap] Resolved ${domain} to ${multiaddrs.length} multiaddr(s)`);
    return multiaddrs;

  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`[bootstrap] Timeout fetching /info from ${domain}`);
    } else {
      console.warn(`[bootstrap] Failed to resolve ${domain}: ${error}`);
    }
    return [];
  }
}

/**
 * Resolve all bootstrap addresses, handling domains via HTTP lookup
 * Also handles known bootstrap preset names (public-libp2p, public-libp2p-am6, etc.)
 */
export async function resolveBootstrapAddresses(addresses: string[]): Promise<ResolvedBootstrapAddr[]> {
  const results: ResolvedBootstrapAddr[] = [];

  // Known bootstrap preset names and their resolved multiaddresses
  const KNOWN_PRESETS: Record<string, string[]> = {
    "public-libp2p": [
      "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
      "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
      "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq",
      "/dnsaddr/bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf",
    ],
    "public-libp2p-am6": [
      "/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6LccNBoMmrjUqFq",
    ],
    "public-libp2p-am7": [
      "/dnsaddr/am7.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA7W8R4Hk6x4pJ8Yf",
    ],
    "cn-relay": [DEFAULT_ENVOY_COMMUNITY_RELAY_BOOTSTRAP_ADDR],
    "us-relay": [DEFAULT_ENVOY_US_RELAY_BOOTSTRAP_ADDR],
  };

  for (const addr of addresses) {
    // Check if it's a known preset name
    const presetPeers = KNOWN_PRESETS[addr];
    if (presetPeers) {
      results.push({
        original: addr,
        resolved: presetPeers,
        success: true,
      });
      continue;
    }

    if (looksLikeDomain(addr)) {
      // Try to resolve domain
      const resolved = await resolveDomainToMultiaddrs(addr);
      results.push({
        original: addr,
        resolved: resolved.length > 0 ? resolved : [addr], // Fallback to original if resolution fails
        success: resolved.length > 0,
      });
    } else {
      // Already a multiaddr, use as-is
      results.push({
        original: addr,
        resolved: [addr],
        success: true,
      });
    }
  }

  return results;
}