/**
 * libp2p client-proxy fallback for mobile → relay → home node.
 *
 * Extracted from `apps/relay/src/index.ts` so failed-dial budget release
 * and shared proxy limits can be unit-tested without spinning up libp2p.
 */

import { WebSocket } from "ws";
import { byteStream } from "@libp2p/utils";
import { CLIENT_PROXY_PROTOCOL } from "@envoymesh/network";
import type { ProxyConnectionBudget } from "./home-tunnel-proxy.js";

export interface Libp2pClientProxyOptions {
  sharedProxyBudget: ProxyConnectionBudget;
  proxyConnByTarget: Map<string, Set<WebSocket>>;
  maxConnsPerTarget: number;
  maxEarlyBuffer: number;
  dialProtocol: (targetPeerId: string, protocol: string) => Promise<unknown>;
  onConnTotalChange?: (total: number) => void;
  logPrefix?: string;
}

export function createLibp2pClientProxyHandler(
  opts: Libp2pClientProxyOptions,
): (ws: WebSocket, targetPeerId: string, token: string) => Promise<void> {
  const prefix = opts.logPrefix ?? "[relay]";

  return async function handleProxyConnection(
    ws: WebSocket,
    targetPeerId: string,
    token: string,
  ): Promise<void> {
    const { sharedProxyBudget, proxyConnByTarget } = opts;

    if (sharedProxyBudget.total >= sharedProxyBudget.max) {
      console.warn(
        `${prefix} client-proxy: rejected — max total connections ${sharedProxyBudget.max}`,
      );
      ws.close(1013, "relay proxy connections full");
      return;
    }
    const targetSet = proxyConnByTarget.get(targetPeerId);
    if (targetSet && targetSet.size >= opts.maxConnsPerTarget) {
      console.warn(
        `${prefix} client-proxy: rejected — max connections per target ${opts.maxConnsPerTarget}`,
      );
      ws.close(1013, "too many connections to target");
      return;
    }

    sharedProxyBudget.total++;
    opts.onConnTotalChange?.(sharedProxyBudget.total);
    const conns = proxyConnByTarget.get(targetPeerId) ?? new Set<WebSocket>();
    conns.add(ws);
    proxyConnByTarget.set(targetPeerId, conns);
    console.log(
      `${prefix} client-proxy: connecting to ${targetPeerId.slice(0, 12)}… (total=${sharedProxyBudget.total})`,
    );

    let libp2pStream: { close(): void } | null = null;
    let released = false;
    const releaseConnection = (): void => {
      if (released) return;
      released = true;
      if (sharedProxyBudget.total > 0) {
        sharedProxyBudget.total--;
      }
      opts.onConnTotalChange?.(sharedProxyBudget.total);
      const s = proxyConnByTarget.get(targetPeerId);
      if (s) {
        s.delete(ws);
        if (s.size === 0) proxyConnByTarget.delete(targetPeerId);
      }
    };

    ws.on("close", () => {
      releaseConnection();
      if (libp2pStream) {
        try {
          libp2pStream.close();
        } catch {
          /* ignore */
        }
      }
      console.log(
        `${prefix} client-proxy: disconnected from ${targetPeerId.slice(0, 12)}… (total=${sharedProxyBudget.total})`,
      );
    });

    ws.on("error", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });

    const earlyBuffer: Uint8Array[] = [];
    let streamReady = false;
    let streamIo: ReturnType<typeof byteStream> | null = null;

    const rawToBytes = (raw: string | Buffer | ArrayBuffer | Buffer[]): Uint8Array => {
      if (typeof raw === "string") return new TextEncoder().encode(raw);
      if (raw instanceof Uint8Array) return raw;
      if (Array.isArray(raw)) return new Uint8Array(Buffer.concat(raw));
      return new Uint8Array(raw as ArrayBuffer);
    };

    const safeWsSend = (text: string): void => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try {
        ws.send(text);
      } catch {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };

    ws.on("message", (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
      try {
        const bytes = rawToBytes(raw);
        if (streamReady && streamIo) {
          void streamIo.write(bytes).catch(() => ws.close());
        } else {
          if (earlyBuffer.length >= opts.maxEarlyBuffer) {
            earlyBuffer.shift();
          }
          earlyBuffer.push(bytes);
        }
      } catch {
        ws.close();
      }
    });

    try {
      console.log(
        `${prefix} client-proxy: dialing ${targetPeerId.slice(0, 12)}… protocol=${CLIENT_PROXY_PROTOCOL}`,
      );

      libp2pStream = (await opts.dialProtocol(targetPeerId, CLIENT_PROXY_PROTOCOL)) as {
        close(): void;
      };
      streamIo = byteStream(libp2pStream);
      console.log(
        `${prefix} client-proxy: dialed ${targetPeerId.slice(0, 12)}…, sending handshake`,
      );

      const handshake = JSON.stringify({ type: "proxy-connect", token });
      await streamIo.write(new TextEncoder().encode(handshake));

      const responseBytes = await streamIo.read();
      if (!responseBytes) {
        console.warn(`${prefix} client-proxy: home node closed stream before handshake response`);
        ws.close(1011, "home node closed stream");
        return;
      }
      const response = JSON.parse(new TextDecoder().decode(responseBytes.subarray())) as {
        type?: string;
        reason?: string;
      };
      if (response.type !== "proxy-accept") {
        console.warn(
          `${prefix} client-proxy: home node rejected proxy: ${response.reason ?? "unknown"}`,
        );
        ws.close(1011, response.reason ?? "home node rejected proxy");
        return;
      }
      console.log(
        `${prefix} client-proxy: proxy-accept received from ${targetPeerId.slice(0, 12)}…`,
      );

      streamReady = true;
      if (earlyBuffer.length > 0) {
        console.log(
          `${prefix} client-proxy: flushing ${earlyBuffer.length} buffered early message(s)`,
        );
        for (const bytes of earlyBuffer) {
          await streamIo.write(bytes);
        }
        earlyBuffer.length = 0;
      }

      safeWsSend(
        JSON.stringify({
          event: "connected",
          data: { relayProxied: true },
        }),
      );
      console.log(`${prefix} client-proxy: sent connected event to mobile client`);

      void (async () => {
        const decoder = new TextDecoder();
        try {
          while (ws.readyState === WebSocket.OPEN) {
            const bytes = await streamIo!.read();
            if (!bytes) {
              console.log(`${prefix} client-proxy: home node stream ended`);
              ws.close();
              break;
            }
            safeWsSend(decoder.decode(bytes.subarray()));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`${prefix} client-proxy: bridge read error: ${msg}`);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        }
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `${prefix} client-proxy: failed to connect to ${targetPeerId.slice(0, 12)}…: ${msg}`,
      );
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, "unable to reach home node");
      }
    }
  };
}
