/**
 * LAN UDP broadcast of dialable listen addrs for bonded contacts.
 * Same-subnet bootstrap when relay roster / libp2p circuits are unavailable.
 */
import dgram from "node:dgram";
import { isDialableLanListenHint, isPrivateLanTcpDialHint } from "@envoymesh/network";

export const LAN_BONDED_PRESENCE_PORT = 40235;

export interface LanBondedPresenceFrame {
  v: 1;
  peerId: string;
  ownerId: string;
  listenAddrs: string[];
  sentAt: string;
}

export interface LanBondedPresenceDeps {
  getOwnPresence: () => LanBondedPresenceFrame | undefined;
  isBondedPeer: (input: { peerId: string; ownerId: string }) => Promise<boolean>;
  onPeerListenAddrs: (peerId: string, listenAddrs: string[]) => void;
  intervalMs?: number;
  log?: (msg: string) => void;
}

function directedBroadcastFromLanAddr(addr: string): string | undefined {
  const m = addr.match(/^\/ip4\/(\d+\.\d+\.\d+)\.\d+\//);
  if (!m?.[1]) {
    return undefined;
  }
  return `${m[1]}.255`;
}

function broadcastTargets(listenAddrs: readonly string[]): string[] {
  const out = new Set<string>(["255.255.255.255"]);
  for (const addr of listenAddrs) {
    const directed = directedBroadcastFromLanAddr(addr);
    if (directed) {
      out.add(directed);
    }
  }
  return [...out];
}

function parseFrame(raw: Buffer): LanBondedPresenceFrame | undefined {
  try {
    const parsed = JSON.parse(raw.toString("utf-8")) as LanBondedPresenceFrame;
    if (parsed.v !== 1) {
      return undefined;
    }
    if (!parsed.peerId?.trim() || !parsed.ownerId?.trim() || !Array.isArray(parsed.listenAddrs)) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export function startLanBondedPresence(deps: LanBondedPresenceDeps): () => void {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  const intervalMs = deps.intervalMs ?? 12_000;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const recentFromPeer = new Map<string, number>();
  const dedupeMs = 5_000;

  const sendOnce = (): void => {
    if (stopped) {
      return;
    }
    const frame = deps.getOwnPresence();
    if (!frame || frame.listenAddrs.length === 0) {
      return;
    }
    const payload = Buffer.from(JSON.stringify(frame), "utf-8");
    if (payload.length > 4096) {
      return;
    }
    for (const host of broadcastTargets(frame.listenAddrs)) {
      socket.send(payload, LAN_BONDED_PRESENCE_PORT, host, (err) => {
        if (err) {
          deps.log?.(`[lan-presence] broadcast to ${host} failed: ${err.message}`);
        }
      });
    }
  };

  socket.on("message", (raw) => {
    void (async () => {
      const frame = parseFrame(raw);
      if (!frame) {
        return;
      }
      const dialable = frame.listenAddrs.filter((a) =>
        isDialableLanListenHint(a, frame.peerId),
      );
      if (dialable.length === 0) {
        return;
      }
      const last = recentFromPeer.get(frame.peerId) ?? 0;
      const now = Date.now();
      if (now - last < dedupeMs) {
        return;
      }
      if (!(await deps.isBondedPeer({ peerId: frame.peerId, ownerId: frame.ownerId }))) {
        return;
      }
      recentFromPeer.set(frame.peerId, now);
      deps.log?.(
        `[lan-presence] from ${frame.peerId.slice(0, 12)}… owner=${frame.ownerId.slice(0, 24)}… addrs=${dialable.map((a) => a.match(/\/tcp\/(\d+)\//)?.[1] ?? "?").join(",")}`,
      );
      deps.onPeerListenAddrs(frame.peerId, dialable);
    })().catch((err) => {
      deps.log?.(
        `[lan-presence] inbound handler error: ${err instanceof Error ? err.message : err}`,
      );
    });
  });

  socket.on("error", (err) => {
    deps.log?.(`[lan-presence] socket error: ${err.message}`);
  });

  socket.bind(LAN_BONDED_PRESENCE_PORT, () => {
    try {
      socket.setBroadcast(true);
    } catch {
      /* best-effort */
    }
    deps.log?.(`[lan-presence] listening on udp/0.0.0.0:${LAN_BONDED_PRESENCE_PORT}`);
    sendOnce();
    timer = setInterval(sendOnce, intervalMs);
  });

  return () => {
    stopped = true;
    if (timer) {
      clearInterval(timer);
    }
    socket.close();
  };
}

/** Pick LAN listen addrs suitable for UDP presence announcements. */
export function lanListenAddrsForPresence(
  meshPeerId: string,
  multiaddrs: readonly string[],
): string[] {
  const peerId = meshPeerId.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of multiaddrs) {
    const a = raw.trim();
    if (!a || seen.has(a) || !isDialableLanListenHint(a, peerId)) {
      continue;
    }
    if (!isPrivateLanTcpDialHint(a)) {
      continue;
    }
    seen.add(a);
    out.push(a);
  }
  return out;
}
