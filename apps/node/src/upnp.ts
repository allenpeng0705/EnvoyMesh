/**
 * UPnP IGD (Internet Gateway Device) client for automatic port forwarding.
 *
 * Uses the `nat-upnp` package to:
 * 1. Discover UPnP gateways on the local network via SSDP
 * 2. Get the gateway's external (public) IP address
 * 3. Request port mapping (forwarding) for a specified internal port
 *
 * Priority: UPnP → STUN → Relay-observed
 * This enables direct P2P connections without manual router configuration.
 */

import natUpnp from "nat-upnp";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UpnpResult {
  /** External/public IP address of the UPnP gateway */
  ip: string;
  /** Mapped external port (may differ from requested port if it was already in use) */
  port: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Conventional libp2p port that users should forward */
export const DEFAULT_LIBP2P_PORT = 4001;

/** Default lease duration: 3600 seconds (1 hour) — refreshes on node restart */
export const DEFAULT_LEASE_SECONDS = 3600;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if an IP address is a private/local address.
 * If UPnP returns a private IP, it means the router is behind CGNAT
 * and we can't use it for direct P2P.
 */
function isPrivateIp(ip: string): boolean {
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, ::1
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }
  if (ip.startsWith("fc00:") || ip.startsWith("fd") || ip.startsWith("fe80:")) return true;
  return false;
}

// ─── UPnP Discovery ────────────────────────────────────────────────────────

/**
 * Discover UPnP gateways and get external IP + port mapping.
 *
 * Tries to:
 * 1. Discover UPnP IGD on the network
 * 2. Get the external IP address
 * 3. Map the requested external port to our internal libp2p port
 *
 * Returns null if UPnP is unavailable or fails.
 *
 * @param internalPort - The node's internal listen port (e.g. 59168)
 * @param externalPort - Requested external port (e.g. 4001)
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 */
export async function upnpDiscoverAndMap(
  internalPort: number,
  externalPort: number,
  timeoutMs = 5000,
): Promise<UpnpResult | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.log(`[upnp] discovery timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);

    try {
      const client = natUpnp.createClient();

      // Step 1: Get external IP address
      client.externalIp((err: Error | null, ip?: string) => {
        if (err || !ip) {
          clearTimeout(timer);
          console.log(`[upnp] failed to get external IP: ${err?.message ?? "unknown error"}`);
          resolve(null);
          return;
        }

        console.log(`[upnp] gateway external IP: ${ip}`);

	        // Reject private IPs — UPnP sometimes returns the LAN IP instead of
	        // the public IP, especially on CGNAT or double-NAT networks.
	        if (isPrivateIp(ip)) {
	          clearTimeout(timer);
	          console.log(`[upnp] UPnP returned private IP ${ip} — likely behind CGNAT, skipping`);
	          resolve(null);
	          return;
	        }

        // Step 2: Port mapping (try preferred port first, fallback to any port)
        client.portMapping(
          {
            public: externalPort,
            private: internalPort,
            protocol: "TCP",
            description: "EnvoyMesh libp2p",
            ttl: DEFAULT_LEASE_SECONDS,
          },
          (mapErr: Error | null) => {
            if (mapErr) {
              console.log(`[upnp] port mapping failed for port ${externalPort}: ${mapErr.message}`);
              // Try without specifying external port (let UPnP choose)
              client.portMapping(
                {
                  public: 0, // Let UPnP assign any available port
                  private: internalPort,
                  protocol: "TCP",
                  description: "EnvoyMesh libp2p",
                  ttl: DEFAULT_LEASE_SECONDS,
                },
                (mapErr2: Error | null, result?: Record<string, unknown>) => {
                  clearTimeout(timer);
                  if (mapErr2) {
                    console.log(`[upnp] port mapping failed (any port): ${mapErr2.message}`);
                    resolve(null);
                    return;
                  }
                  // Result contains { public: { host, port }, ... }
                  const publicEntry = result?.["public"] as { port: number } | undefined;
                  const publicPort = publicEntry?.port ?? 0;
                  if (publicPort === 0) {
                    resolve(null);
                    return;
                  }
                  console.log(`[upnp] port mapped: external ${publicPort} -> internal ${internalPort}`);
                  resolve({ ip, port: publicPort });
                },
              );
              return;
            }

            clearTimeout(timer);
            console.log(`[upnp] port ${externalPort} mapped successfully`);
            resolve({ ip, port: externalPort });
          },
        );
      });
    } catch (err) {
      clearTimeout(timer);
      console.log(`[upnp] UPnP discovery error: ${(err as Error).message}`);
      resolve(null);
    }
  });
}

/**
 * Remove a UPnP port mapping.
 * Call this on shutdown to clean up the port forwarding.
 *
 * @param port - The external port to unmap
 */
export async function upnpUnmapPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const client = natUpnp.createClient();
      client.portUnmapping(
        {
          public: port,
          protocol: "TCP",
        },
        (err: Error | null) => {
          if (err) {
            console.log(`[upnp] failed to unmap port ${port}: ${err.message}`);
            resolve(false);
            return;
          }
          console.log(`[upnp] port ${port} unmapped successfully`);
          resolve(true);
        },
      );
    } catch (err) {
      console.log(`[upnp] UPnP unmap error: ${(err as Error).message}`);
      resolve(false);
    }
  });
}
