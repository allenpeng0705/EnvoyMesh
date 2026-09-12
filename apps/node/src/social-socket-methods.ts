/**
 * EnvoyMesh's per-connection socket methods, as one port.
 *
 * Two features proxy a *second* WebSocket through the host's socket, because
 * neither target is reachable from a mobile client:
 *
 * | Method family | Proxies to |
 * |---|---|
 * | `homeClawCoreWs*` | the OpenClaw core HTTP bridge (`homeClawCoreBaseUrl`) |
 * | `homeTerminalWs*` | the home node's terminal PTY socket (`TERMINAL_WS_PORT`) |
 *
 * All six methods used to be `if (method === …)` blocks inside `ws-server.ts`,
 * which is why the transport imported this module and `home-terminal-ws.ts`, and
 * why it read `getNodeConfig()` and the terminal port. The transport only needs
 * to know *when* such a method may run and how to reply (see `SocketMethodPort`);
 * which ones exist and where they connect is here.
 *
 * ## One deliberate deviation from the inline code
 *
 * The six blocks each had their own `try`/`catch`, and the two `Close` methods
 * had **none**: a throw from `rpcHomeClawCoreWsClose` / `rpcHomeTerminalWsClose`
 * (or the `Send` pair) propagated to `dispatchRpc`, which answered with the
 * transport's generic `"Failed to process message"`. Here a single `try` wraps
 * the switch, so an unexpected throw is answered with this method family's own
 * `{ ok: false, error }` envelope, carrying the real message. Same success paths,
 * same expected-failure paths, one changed *exceptional* path — recorded because
 * "no behaviour change" should not be claimed for a path that did change.
 *
 * ## `closed` is not optional in spirit
 *
 * The host's `close` handler used to call `closeHomeClawCoreWsForCompanion(ws)`
 * and `closeHomeTerminalWsForCompanion(ws)` directly. Both release a proxy bound
 * to that socket. Moving them here without wiring `closed` would have leaked a
 * proxy per disconnect, so `closed` is implemented even though the port types it
 * as optional.
 */

import type { NodeService } from "@envoymesh/api";
import { TERMINAL_WS_PORT } from "@envoymesh/node-core";
import {
  closeHomeClawCoreWsForCompanion,
  rpcHomeClawCoreWsClose,
  rpcHomeClawCoreWsOpen,
  rpcHomeClawCoreWsSend,
} from "./homeclaw-core-ws.js";
import {
  closeHomeTerminalWsForCompanion,
  rpcHomeTerminalWsClose,
  rpcHomeTerminalWsOpen,
  rpcHomeTerminalWsSend,
} from "./home-terminal-ws.js";
import type { SocketMethodContext, SocketMethodPort } from "@envoymesh/host-connect";
import type { RpcCallerContext } from "./rpc-caller-context.js";

/** Methods this port owns, so an unhandled name is cheap to reject. */
const HANDLED = new Set([
  "homeClawCoreWsOpen",
  "homeClawCoreWsSend",
  "homeClawCoreWsClose",
  "homeTerminalWsOpen",
  "homeTerminalWsSend",
  "homeTerminalWsClose",
]);

/** Turn a thrown or returned proxy error into the wire shape clients expect. */
function reply(ctx: SocketMethodContext<RpcCallerContext>, err: string | null): void {
  if (err === null) ctx.ok({ ok: true });
  else ctx.fail(err);
}

export function createSocialSocketMethods(node: NodeService): SocketMethodPort<RpcCallerContext> {
  return {
    async handle(ctx): Promise<boolean> {
      if (!HANDLED.has(ctx.method)) return false;
      const { method, params, connection } = ctx;
      try {
        switch (method) {
          case "homeClawCoreWsOpen": {
            const cfg = await node.getNodeConfig();
            const baseUrl = cfg.homeClawCoreBaseUrl;
            reply(
              ctx,
              await rpcHomeClawCoreWsOpen(
                connection,
                params as unknown as { pathWithQuery: string },
                typeof baseUrl === "string" ? baseUrl : undefined,
                (event, data) => ctx.send(event, data),
              ),
            );
            return true;
          }
          case "homeClawCoreWsSend":
            reply(
              ctx,
              rpcHomeClawCoreWsSend(connection, params as unknown as { text: string }),
            );
            return true;
          case "homeClawCoreWsClose":
            rpcHomeClawCoreWsClose(connection);
            ctx.ok({ ok: true });
            return true;
          case "homeTerminalWsOpen": {
            // The port is a constant with an env override, so there is no
            // "not configured" state to guard: if the terminal server is not
            // listening, the proxy reports a connect failure like any other.
            reply(
              ctx,
              await rpcHomeTerminalWsOpen(
                connection,
                params as unknown as { pathWithQuery: string },
                TERMINAL_WS_PORT,
                (event, data) => ctx.send(event, data),
              ),
            );
            return true;
          }
          case "homeTerminalWsSend":
            reply(
              ctx,
              rpcHomeTerminalWsSend(
                connection,
                params as unknown as { dataBase64: string; sessionId?: string },
              ),
            );
            return true;
          case "homeTerminalWsClose":
            rpcHomeTerminalWsClose(
              connection,
              params as unknown as { sessionId?: string },
            );
            ctx.ok({ ok: true });
            return true;
          default:
            return false;
        }
      } catch (error) {
        ctx.fail(error instanceof Error ? error.message : String(error));
        return true;
      }
    },

    closed(connection): void {
      closeHomeClawCoreWsForCompanion(connection);
      closeHomeTerminalWsForCompanion(connection);
    },
  };
}
