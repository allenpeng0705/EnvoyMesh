/**
 * `@envoymesh/host-connect` — the reusable host/connect layer.
 *
 * A product's desktop app can host a node connection surface (QR + host:port)
 * with this package and **nothing else from EnvoyMesh**: the transport declares
 * what it needs as ports, and the product implements them. That is the §8.8
 * extraction's deliverable, and the reason these four modules can be packaged at
 * all is `docs/envoymesh-refactoring-plan.md` §6.1 H1–H5 — before that work the
 * transport imported the product's router, its caller policy, its settings, six
 * of its method names, and its whole 436-method `NodeService` interface.
 *
 * | Module | Concern |
 * |---|---|
 * | `ws-server` | the JSON-RPC WebSocket host: connections, auth gate, heartbeat, fan-out |
 * | `ws-host-contract` | the host's extension points — dispositions, session identity, dispatch, per-session delivery, socket methods, and the five-member node surface |
 * | `caller-context` | the async-scoped caller slot (mechanism only; naming a caller is policy) |
 * | `rpc-error-code` | the wire error-code catalog shared with the mobile clients |
 *
 * ## What a product must supply
 *
 * All of it through `WsServer.start(hostNodeService, options)`. The two required
 * ports are `sessionIdentity` (who is this?) and `dispatch` (run this call under
 * the right authority); the optional ones are data-or-policy, and a product that
 * omits them gets the strict default — no extra events, no pre-auth methods, no
 * per-session transformation, no serialization, payloads delivered as emitted.
 *
 * ## What is deliberately **not** here
 *
 * The **caller model**. `RpcCallerContext`, owner and family-profile rules,
 * config redaction and `stampConfigCallerForSession` are product policy and stay
 * with the product; they *compose* the generic store exported below. Likewise
 * the router's authorisation policy arrives as the injected `dispatch`,
 * so no `@envoymesh/api` and no `@envoymesh/node-core` import reaches this
 * package — a host module may not import either (both are `product-bound`, the
 * latter because it re-exports `home-fs`).
 */

export { WsServer } from "./ws-server.js";

export {
  // Event vocabulary and delivery
  CORE_EVENT_DISPOSITIONS,
  CORE_EVENT_NAMES,
  HOST_WS_BIND_HOST,
  dispatchEvent,
  maskEnabledField,
  mergeEventDispositions,
  // The host's node surface
  type CoreEventName,
  type EventDelivery,
  type EventDisposition,
  type HostCallEvent,
  type HostConnectionStatus,
  type HostEventHandler,
  type HostNodeService,
  type HostNodeStatus,
  // The ports a product implements
  type HostRpcDispatcher,
  type HostSession,
  type SessionIdentityResolver,
  type SessionPayloadTransform,
  type SocketMethodContext,
  type SocketMethodPort,
} from "./ws-host-contract.js";

export { createCallerContextStore, type CallerContextStore } from "./caller-context.js";

export { rpcErrorCode } from "./rpc-error-code.js";

/**
 * The host's start-up options, re-exported as a convenience so a product can
 * type its composition root without reaching into the server module.
 */
export type { WsServerOptions } from "./ws-server.js";
