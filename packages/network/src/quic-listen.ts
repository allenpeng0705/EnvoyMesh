import { multiaddr } from "@multiformats/multiaddr";

/**
 * Given a TCP listen multiaddr, returns the parallel UDP QUIC listen multiaddr for the same host/port.
 */
export function quicListenFromTcpListen(tcpListen: string): string {
  const ma = multiaddr(tcpListen);
  const comps = ma.getComponents();
  let out = "";
  for (const c of comps) {
    if (c.name === "tcp") {
      out += `/udp/${c.value}/quic-v1`;
    } else {
      out += `/${c.name}/${c.value}`;
    }
  }
  return out;
}

/**
 * Appends QUIC listen addresses alongside each TCP listen address (deduped).
 */
export function expandListenAddressesWithQuic(listen: readonly string[]): string[] {
  const seen = new Set(listen);
  const out = [...listen];
  for (const addr of listen) {
    if (!addr.includes("/tcp/") || addr.includes("/quic")) {
      continue;
    }
    try {
      const companion = quicListenFromTcpListen(addr);
      if (!seen.has(companion)) {
        seen.add(companion);
        out.push(companion);
      }
    } catch {
      // Ignore malformed entries; libp2p will surface listen errors if needed.
    }
  }
  return out;
}
