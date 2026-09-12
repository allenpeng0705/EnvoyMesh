/**
 * JSON-RPC wire types — the envelope the node host and its clients exchange.
 *
 * ## Why these live in `@envoymesh/protocol` rather than `@envoymesh/api`
 *
 * They were declared in `@envoymesh/api/ws-protocol`, alongside the ~436-method
 * `RpcMethods` union. That made them unreachable for any module that must stay
 * in the **reusable** layer: importing `@envoymesh/api` for a four-line type
 * also drags in the whole product surface, so the classifier marks the importer
 * `product-bound` (E9 in `docs/envoymesh-refactoring-plan.md`).
 *
 * The WebSocket host needs exactly these types and nothing else from that
 * package, which meant "the host transport cannot be packaged without the
 * product" was true solely because of a type's address. They are a **wire
 * contract shared by both ends** — the host writes them, Social and EnvoyGo read
 * them — so `protocol` (zero-dependency, already depended on by both sides) is
 * where they belong.
 *
 * `@envoymesh/api/ws-protocol` re-exports them, so no existing importer changed.
 */

/** An RPC call from a client. */
export type JsonRpcRequest = {
  id: string;
  method: string;
  params?: Record<string, unknown>;
};

/** An RPC reply. `result` on success, `error` on failure — never both. */
export type JsonRpcResponse = {
  id: string;
  result?: unknown;
  error?: JsonRpcError;
};

/**
 * A failed RPC.
 *
 * `code` is a string, not the JSON-RPC numeric convention — the clients switch
 * on values such as `"UNAUTHORIZED"` and `"NOT_IMPLEMENTED"`.
 */
export type JsonRpcError = {
  code: string;
  message: string;
};

/** A server push. Carries no `id`, since nothing is expecting a reply. */
export type JsonRpcEvent = {
  event: string;
  data: unknown;
};
