/**
 * Shared public-address discovery (UPnP → STUN → autoNAT).
 * Used by CLI `activateCliMesh` and NodeService `startNodeViaRuntime`.
 */
import type { EnvoyMesh } from "@envoymesh/network";
import { raceStunServers, type StunServer } from "./stun.js";
import { upnpDiscoverAndMap, DEFAULT_LIBP2P_PORT } from "./upnp.js";

export interface PublicAddrDiscoveryOptions {
  enableUpnp?: boolean;
  stunServers?: readonly StunServer[];
  enableAutoNat?: boolean;
  /** Log prefix (default `[node]`). */
  logPrefix?: string;
}

export interface PublicAddrDiscoveryResult {
  discovered: boolean;
  /** Unsubscribe autoNAT listener if one was registered (no-op otherwise). */
  unsubscribeAutoNat: () => void;
}

/**
 * Discover a public multiaddr and inject it via `mesh.setAdvertisedAddress`.
 * Priority: UPnP → STUN → autoNAT. First valid result wins.
 * Relay-observed addresses are wired separately (relay-tunnel callback).
 *
 * When `existingAutoNatUnsub` is provided, autoNAT is not re-subscribed
 * (avoids listener accumulation on periodic re-runs).
 */
export async function discoverAndSetPublicAddr(
  mesh: EnvoyMesh,
  options: PublicAddrDiscoveryOptions & {
    /** Skip registering another autoNAT listener when already subscribed. */
    existingAutoNatUnsub?: () => void;
  } = {},
): Promise<PublicAddrDiscoveryResult> {
  const logPrefix = options.logPrefix ?? "[node]";
  let discovered = false;
  let unsubscribeAutoNat = () => {};

  if (options.enableUpnp) {
    const listenAddrs = mesh.multiaddrs;
    let internalPort: number | null = null;
    for (const maStr of listenAddrs ?? []) {
      const tcpMatch = maStr.match(/\/tcp\/(\d+)/);
      if (tcpMatch) {
        internalPort = parseInt(tcpMatch[1], 10);
        break;
      }
    }
    if (internalPort != null) {
      console.log(
        `${logPrefix} UPnP: attempting to map external port ${DEFAULT_LIBP2P_PORT} -> internal ${internalPort}...`,
      );
      const upnpResult = await upnpDiscoverAndMap(internalPort, DEFAULT_LIBP2P_PORT, 5000);
      if (upnpResult) {
        const multiaddr = `/ip4/${upnpResult.ip}/tcp/${upnpResult.port}`;
        mesh.setAdvertisedAddress(multiaddr);
        console.log(`${logPrefix} public addr discovered via UPnP: ${multiaddr}`);
        discovered = true;
      } else {
        console.log(`${logPrefix} UPnP: no gateway available or mapping failed`);
      }
    } else {
      console.log(`${logPrefix} UPnP: could not determine internal listen port`);
    }
  }

  const stunServers = options.stunServers ?? [];
  if (stunServers.length > 0 && !discovered) {
    console.log(`${logPrefix} STUN: querying ${stunServers.length} server(s)...`);
    const result = await raceStunServers([...stunServers], 3000);
    if (result) {
      const multiaddr = `/ip4/${result.ip}/tcp/${result.port}`;
      mesh.setAdvertisedAddress(multiaddr);
      console.log(`${logPrefix} public addr discovered via STUN: ${multiaddr}`);
      discovered = true;
    } else {
      console.log(`${logPrefix} STUN: all servers failed or timed out`);
    }
  }

  if (options.enableAutoNat !== false && !discovered) {
    if (options.existingAutoNatUnsub) {
      // Already listening — keep prior subscription; do not stack handlers.
      unsubscribeAutoNat = options.existingAutoNatUnsub;
      console.log(`${logPrefix} autoNAT: already subscribed (skip re-subscribe)`);
    } else {
      console.log(`${logPrefix} autoNAT: subscribing to self:reachable events`);
      let unsub = () => {};
      const wrapper = (addr: string) => {
        if (discovered) {
          unsub();
          return;
        }
        discovered = true;
        unsub();
        mesh.setAdvertisedAddress(addr);
        console.log(`${logPrefix} public addr discovered via autoNAT: ${addr}`);
      };
      unsub = mesh.onAutoNATReachable(wrapper);
      unsubscribeAutoNat = () => {
        unsub();
      };
    }
  } else if (discovered && options.existingAutoNatUnsub) {
    // Concrete UPnP/STUN win — drop a prior autoNAT waiter so it does not linger.
    options.existingAutoNatUnsub();
    unsubscribeAutoNat = () => {};
  }

  console.log(`${logPrefix} relay-observed addr: wired via relay-tunnel-client callback`);
  return { discovered, unsubscribeAutoNat };
}

const DEFAULT_PUBLIC_ADDR_PERIODIC_MS = 10 * 60 * 1000;

/**
 * Run discovery once, then on a periodic interval. Returns a stop handle that
 * clears the timer and unsubscribes any autoNAT listener.
 */
export function startPublicAddrDiscoveryScheduler(
  mesh: EnvoyMesh,
  options: PublicAddrDiscoveryOptions & { intervalMs?: number } = {},
): () => void {
  let autoNatUnsub: (() => void) | undefined;
  let stopped = false;

  const run = async (): Promise<void> => {
    if (stopped) return;
    const result = await discoverAndSetPublicAddr(mesh, {
      ...options,
      existingAutoNatUnsub: autoNatUnsub,
    });
    if (stopped) {
      result.unsubscribeAutoNat();
      return;
    }
    autoNatUnsub = result.unsubscribeAutoNat;
  };

  void run();
  const intervalMs = options.intervalMs ?? DEFAULT_PUBLIC_ADDR_PERIODIC_MS;
  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
    autoNatUnsub?.();
    autoNatUnsub = undefined;
  };
}
