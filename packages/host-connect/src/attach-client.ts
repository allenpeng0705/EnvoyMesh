/**
 * The client half of a local product attach.
 *
 * A second EnvoyMesh app on the same machine joins the group by asking the running
 * node for a session of its own — see `@envoymesh/node-core`'s `product-attach` for
 * the convention and `docs/envoymesh-multi-product-design.md` §7 for why. This is the
 * exchange: one request over the loopback WebSocket, one session back.
 *
 * It lives here, next to the host, because this package owns the wire — the framing,
 * the id correlation, the error codes — and already depends on `ws`. The *policy*
 * (who may attach, what a product may then call) stays with the products.
 *
 * Two details are load-bearing:
 *
 *   * the reply is matched by JSON-RPC **id**, never "the first message": the host
 *     pushes `connected` on connect, and under load it arrives first. A test in this
 *     repo learned that the hard way;
 *   * a refusal is surfaced with its wire code (`UNAUTHORIZED` for "not from this
 *     machine"), because a product attaching from the wrong place should be told why
 *     rather than see a timeout.
 */

/** Overridable so the constant lives with the node, not in two places. */
export const DEFAULT_ATTACH_METHOD = "attachLocalProduct";

export interface AttachEndpoint {
  /** WebSocket port the node published (`node.json` → `resolveRunningNode`). */
  port: number;
  /** WebSocket path; defaults to `/ws`. */
  path?: string;
}

export interface ProductSessionRequest {
  product: string;
  version?: string;
  /** JSON-RPC method to call; defaults to {@link DEFAULT_ATTACH_METHOD}. */
  method?: string;
  timeoutMs?: number;
}

export interface ProductSessionGrant {
  /** Session token, scoped to this product — never the owner's. */
  token: string;
  /** `product:<Name>`. */
  scopeKey: string;
  ownerId: string;
  /** Ready to dial: the same endpoint with `?token=…` appended. */
  wsUrl: string;
}

/**
 * Ask a running node for a product-scoped session.
 *
 * Throws on a refusal, a timeout, or a malformed reply. Callers should have checked
 * the node first (`@envoymesh/node-core`'s `resolveRunningNode` returns `"running"`
 * only for a *verified* node), because "something answers on this port" is not the
 * same question — and this call is the one that hands out a credential.
 */
export async function requestProductSession(
  endpoint: AttachEndpoint,
  request: ProductSessionRequest,
): Promise<ProductSessionGrant> {
  const { WebSocket } = await import("ws");
  const path = endpoint.path ?? "/ws";
  const method = request.method ?? DEFAULT_ATTACH_METHOD;
  const timeoutMs = request.timeoutMs ?? 5_000;
  const url = `ws://127.0.0.1:${endpoint.port}${path}`;

  return await new Promise<ProductSessionGrant>((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => {
        socket.terminate();
        reject(new Error(`attach timed out after ${timeoutMs}ms (${method})`));
      }, timeoutMs);

      const finish = (fn: () => void) => {
        clearTimeout(timer);
        try {
          socket.close();
        } catch {
          /* already closing */
        }
        fn();
      };

      socket.on("error", (err) => {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      });

      socket.on("open", () => {
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params: {
              product: request.product,
              ...(request.version ? { version: request.version } : {}),
            },
          }),
        );
      });

      socket.on("message", (raw: Buffer) => {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(raw.toString()) as Record<string, unknown>;
        } catch {
          return; // a malformed push is not our reply
        }
        if (message["id"] !== 1) return; // unsolicited push (`connected`) — not the reply

        const error = message["error"] as { code?: string; message?: string } | undefined;
        if (error) {
          finish(() =>
            reject(new Error(`${error.code ?? "ERROR"}: ${error.message ?? "attach refused"}`)),
          );
          return;
        }
        const result = message["result"] as Partial<ProductSessionGrant> | undefined;
        const token = typeof result?.token === "string" ? result.token : "";
        const scopeKey = typeof result?.scopeKey === "string" ? result.scopeKey : "";
        const ownerId = typeof result?.ownerId === "string" ? result.ownerId : "";
        if (!token || !scopeKey || !ownerId) {
          finish(() => reject(new Error("attach reply did not carry a session")));
          return;
        }
        finish(() =>
          resolve({ token, scopeKey, ownerId, wsUrl: `${url}?token=${encodeURIComponent(token)}` }),
        );
      });
  });
}
