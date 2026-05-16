import { byteStream } from "@libp2p/utils";
import type { NodeServiceImpl } from "./node-service-impl.js";
import { routeRpcMethod } from "./json-rpc-router.js";

/**
 * Creates a libp2p protocol handler for the client-proxy relay bridge.
 *
 * Flow:
 *   1. Read handshake { type: "proxy-connect", token }
 *   2. Validate pairing token
 *   3. Reply { type: "proxy-accept" } or { type: "proxy-reject", reason }
 *   4. Enter bidirectional JSON-RPC loop
 *
 * Extracted from index.ts so it can be tested independently.
 */
export function createClientProxyHandler(
  nodeService: NodeServiceImpl,
): (stream: any, _connection: any) => Promise<void> {
  return async (stream, _connection) => {
    const streamIo = byteStream(stream);
    try {
      // Read handshake
      const handshakeBytes = await streamIo.read();
      if (!handshakeBytes) {
        await stream.close();
        return;
      }
      const handshake = JSON.parse(new TextDecoder().decode(handshakeBytes.subarray()));

      // Validate pairing token
      const token = handshake?.token as string | undefined;
      if (!token || !(await nodeService.validatePairingToken(token))) {
        await streamIo.write(
          new TextEncoder().encode(
            JSON.stringify({ type: "proxy-reject", reason: "invalid or expired token" }),
          ),
        );
        await stream.close();
        return;
      }

      await streamIo.write(new TextEncoder().encode(JSON.stringify({ type: "proxy-accept" })));

      // Bidirectional RPC loop
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

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
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
    }
  };
}
