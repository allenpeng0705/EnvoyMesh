import { WS_LOOPBACK_URL, WS_PATH, WS_PORT } from "@envoymesh/api";
import { normalizeLoopbackWsUrl } from "./storage.js";

/** Well-known Social WebSocket ports used in local multi-instance / alt-port scripts. */
export const DEV_LOOPBACK_WS_PORTS = [WS_PORT, 4030] as const;

export function loopbackWsUrlForPort(port: number): string {
  return `ws://127.0.0.1:${port}${WS_PATH}`;
}

export function parseLoopbackWsPort(wsUrl: string): number | null {
  try {
    const u = new URL(normalizeLoopbackWsUrl(wsUrl.trim() || WS_LOOPBACK_URL));
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") return null;
    if (u.port) return Number(u.port);
    return WS_PORT;
  } catch {
    return null;
  }
}

/** Prefer saved port first, then default 3030, then alt 4030 (deduped). */
export function orderedDevLoopbackWsPorts(preferPort?: number | null): number[] {
  const out: number[] = [];
  const push = (p: number | null | undefined) => {
    if (p == null || !Number.isFinite(p) || p <= 0) return;
    if (!out.includes(p)) out.push(p);
  };
  push(preferPort ?? null);
  for (const p of DEV_LOOPBACK_WS_PORTS) push(p);
  return out;
}

export type DiscoverLocalNodeResult = {
  ok: boolean;
  wsUrl: string | null;
  port: number | null;
  preferredPort: number | null;
  preferredOpen: boolean;
  openPorts: number[];
};

/**
 * Ask the Vite DEV server which loopback node WebSocket port is accepting TCP.
 * Returns null outside Vite DEV (no middleware).
 */
export async function discoverLocalNodeWsUrl(opts?: {
  preferUrl?: string;
  signal?: AbortSignal;
}): Promise<DiscoverLocalNodeResult | null> {
  if (!import.meta.env.DEV) return null;
  const preferPort = opts?.preferUrl ? parseLoopbackWsPort(opts.preferUrl) : null;
  const qs =
    preferPort != null ? `?prefer=${encodeURIComponent(String(preferPort))}` : "";
  try {
    const res = await fetch(`/__envoymesh/discover-node${qs}`, {
      signal: opts?.signal ?? AbortSignal.timeout(2_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DiscoverLocalNodeResult;
    if (!data || typeof data !== "object") return null;
    return {
      ok: Boolean(data.ok),
      wsUrl: typeof data.wsUrl === "string" ? normalizeLoopbackWsUrl(data.wsUrl) : null,
      port: typeof data.port === "number" ? data.port : null,
      preferredPort: typeof data.preferredPort === "number" ? data.preferredPort : preferPort,
      preferredOpen: Boolean(data.preferredOpen),
      openPorts: Array.isArray(data.openPorts)
        ? data.openPorts.filter((p): p is number => typeof p === "number")
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * If the saved loopback URL is down but another known local node port is up,
 * return that URL so Social can reconnect without opening Settings.
 */
export async function resolveDevLoopbackWsUrlHeal(
  savedWsUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const savedPort = parseLoopbackWsPort(savedWsUrl);
  if (savedPort == null) return null;
  const discovered = await discoverLocalNodeWsUrl({ preferUrl: savedWsUrl, signal });
  if (!discovered?.ok || !discovered.wsUrl) return null;
  if (discovered.preferredOpen) return null;
  if (normalizeLoopbackWsUrl(discovered.wsUrl) === normalizeLoopbackWsUrl(savedWsUrl)) {
    return null;
  }
  return discovered.wsUrl;
}
