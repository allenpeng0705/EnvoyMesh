import { byteStream } from "@libp2p/utils";
import type { NodeServiceImpl } from "./node-service-impl.js";
import { routeRpcMethod } from "./json-rpc-router.js";
import {
  closeHomeTerminalWsForCompanion,
  rpcHomeTerminalWsClose,
  rpcHomeTerminalWsOpen,
  rpcHomeTerminalWsSend,
} from "./home-terminal-ws.js";

/**
 * Creates a libp2p protocol handler for the client-proxy relay bridge.
 *
 * Flow:
 *   1. Read handshake { type: "proxy-connect", token }
 *   2. Validate pairing token
 *   3. Reply { type: "proxy-accept" } or { type: "proxy-reject", reason }
 *   4. Enter bidirectional JSON-RPC loop (+ push events for terminal PTY tunnel)
 */
export function createClientProxyHandler(
  nodeService: NodeServiceImpl,
): (stream: any, _connection: any) => Promise<void> {
  return async (stream, _connection) => {
    const streamIo = byteStream(stream);
    const companion = {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const emitEvent = async (event: string, data: unknown): Promise<void> => {
      await streamIo.write(encoder.encode(JSON.stringify({ event, data })));
    };

    try {
      const handshakeBytes = await streamIo.read();
      if (!handshakeBytes) {
        await stream.close();
        return;
      }
      const handshake = JSON.parse(decoder.decode(handshakeBytes.subarray()));

      const token = handshake?.token as string | undefined;
      if (!token || !(await nodeService.validatePairingToken(token))) {
        await streamIo.write(
          encoder.encode(JSON.stringify({ type: "proxy-reject", reason: "invalid or expired token" })),
        );
        await stream.close();
        return;
      }

      await streamIo.write(encoder.encode(JSON.stringify({ type: "proxy-accept" })));

      while (true) {
        const bytes = await streamIo.read();
        if (!bytes) break;

        let msg: { id?: string; method?: string; params?: Record<string, unknown> };
        try {
          msg = JSON.parse(decoder.decode(bytes.subarray()));
        } catch {
          continue;
        }
        if (!msg.id || !msg.method) continue;

        try {
          if (msg.method === "homeTerminalWsOpen") {
            const err = await rpcHomeTerminalWsOpen(
              companion,
              (msg.params ?? {}) as { pathWithQuery: string },
              3031,
              (event, data) => {
                void emitEvent(event, data);
              },
            );
            await streamIo.write(
              encoder.encode(
                JSON.stringify({
                  id: msg.id,
                  result: err === null ? { ok: true } : { ok: false, error: err },
                }),
              ),
            );
            continue;
          }

          if (msg.method === "homeTerminalWsSend") {
            const err = rpcHomeTerminalWsSend(companion, (msg.params ?? {}) as { dataBase64: string });
            await streamIo.write(
              encoder.encode(
                JSON.stringify({
                  id: msg.id,
                  result: err === null ? { ok: true } : { ok: false, error: err },
                }),
              ),
            );
            continue;
          }

          if (msg.method === "homeTerminalWsClose") {
            rpcHomeTerminalWsClose(companion);
            await streamIo.write(encoder.encode(JSON.stringify({ id: msg.id, result: { ok: true } })));
            continue;
          }

          const result = await routeRpcMethod(nodeService, msg.method, msg.params ?? {});
          await streamIo.write(encoder.encode(JSON.stringify({ id: msg.id, result })));
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await streamIo.write(
            encoder.encode(JSON.stringify({ id: msg.id, error: { code: "ERROR", message: errMsg } })),
          );
        }
      }
    } finally {
      closeHomeTerminalWsForCompanion(companion);
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
    }
  };
}
