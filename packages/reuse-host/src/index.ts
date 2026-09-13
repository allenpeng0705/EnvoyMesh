/**
 * `@envoymesh/reuse-host` — a second product's host surface, built entirely from
 * EnvoyMesh's **reusable** layer.
 *
 * ## What this package is
 *
 * The refactor's claim is that a product which is *not* EnvoyMesh social can host
 * a node's transport, pairing and agent harness without importing the product's
 * surface. The Dart fixture proves that for the SDK; `apps/node/test/reuse-host.test.ts`
 * proves a core-only consumer can boot a host. This is the third form of the same
 * claim — a **real package**, with its own `package.json`, project references and
 * workspace entries, that a second product could depend on:
 *
 * ```
 *   product (EnvoyCoder, …)
 *        │  depends on
 *        ▼
 *   @envoymesh/reuse-host      ← this package: transport + pairing + harness
 *        │  depends on
 *        ▼
 *   @envoymesh/host-connect · @envoymesh/harness · @envoymesh/protocol
 * ```
 *
 * Every module here is `reusable` under the Axis-1 manifest, and the package is
 * declared core, so nothing in the graph above can reach product code.
 *
 * ## Why the pairing contract is local
 *
 * EnvoyMesh's own pairing token (`@envoymesh/api/pairing-token`, `envoy-pair-uri`)
 * is **product-bound**: both modules reach `ws-protocol.ts` through relative
 * imports, and that module is product-bound because it carries the RPC method
 * union. A second product therefore declares its own QR payload — small enough to
 * state in one type — rather than importing a product contract. (Moving the
 * pairing contract into `protocol`, as was done for the ext-agent contract and for
 * `ModelProviderConfig`, is the alternative, and it is a contract move with its own
 * migration.)
 *
 * ## What it deliberately does not do
 *
 * No stores, no profile directory, no identity model: a second product supplies
 * its own via the injected ports. The only required inputs are the two
 * `WsServerOptions` demands — `sessionIdentity` and `dispatch`.
 */

import {
  WsServer,
  type HostNodeService,
  type HostRpcDispatcher,
  type SessionIdentityResolver,
  type SessionPayloadTransform,
  type SocketMethodPort,
} from "@envoymesh/host-connect";

// ─── the harness surface ────────────────────────────────────────────────────
//
// Re-exported rather than re-invented: `@envoymesh/harness` is 24/24 `reusable`
// since the contract-symbol moves (§8.17.1), so a non-social product gets the
// ext-agent adapters, the daemon supervisor and the reachability probe as-is.
export {
  DaemonSupervisor,
  InstallMissingError,
  createBackend,
  probeExtAgentReachability,
  startExtAgentHttpServer,
  type DaemonSupervisorOptions,
} from "@envoymesh/harness";

// ─── pairing (QR) ───────────────────────────────────────────────────────────

/**
 * The pairing payload a second product puts in its QR code.
 *
 * Deliberately minimal and product-agnostic: where to dial, a token to dial with,
 * and a label for the human reading the screen. EnvoyMesh's own payload adds
 * social fields (owner id, relay list); a product without social features does
 * not need them, and this type is the shape a *non-social* host can promise.
 */
export interface PairingPayload {
  /** WebSocket URL the client should dial, including scheme and path. */
  wsUrl: string;
  /** Opaque token the client presents to authenticate. */
  token: string;
  /** Human-readable name of the host, shown before pairing completes. */
  displayName?: string;
  /** Wire version of this payload. */
  v: 1;
}

export const PAIRING_URI_SCHEME = "envoy";

/** Build the `envoy://pair?...` URI a QR code encodes. */
export function buildPairingUri(payload: PairingPayload): string {
  const params = new URLSearchParams();
  params.set("v", String(payload.v));
  params.set("ws", payload.wsUrl);
  params.set("tok", payload.token);
  if (payload.displayName) params.set("name", payload.displayName);
  return `${PAIRING_URI_SCHEME}://pair?${params.toString()}`;
}

/**
 * Parse a pairing URI back. Returns `null` for anything that is not one, so a
 * scanner can reject a foreign QR code without a thrown error.
 */
export function parsePairingUri(uri: string): PairingPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return null;
  }
  if (parsed.protocol !== `${PAIRING_URI_SCHEME}:` || parsed.hostname !== "pair") return null;
  const wsUrl = parsed.searchParams.get("ws") ?? "";
  const token = parsed.searchParams.get("tok") ?? "";
  const version = Number(parsed.searchParams.get("v"));
  if (!wsUrl || !token || version !== 1) return null;
  const displayName = parsed.searchParams.get("name");
  return { wsUrl, token, v: 1, ...(displayName ? { displayName } : {}) };
}

// ─── the host ───────────────────────────────────────────────────────────────

export interface ReuseHostOptions {
  /** Port to bind. Pass `0` to let the OS choose one (`host.port` reports it). */
  port: number;
  /** Path the WebSocket endpoint is served at. Defaults to `/ws`. */
  path?: string;
  /**
   * The product's authentication. Required: a host that cannot resolve a token
   * cannot authenticate anyone.
   */
  sessionIdentity: SessionIdentityResolver;
  /** The product's dispatch. Required: the host says *who* asks, never *what they may do*. */
  dispatch: HostRpcDispatcher;
  /** Optional extra ports, for products that need them. */
  socketMethods?: SocketMethodPort;
  preAuthMethods?: readonly string[];
  transformForSession?: SessionPayloadTransform;
  /** Name shown in the pairing payload. */
  displayName?: string;
  /** Called with the live connection count. */
  onConnectionChange?: (connectedCount: number) => void;
}

/**
 * A host with a **no-op node surface**, which is all a second product needs to
 * start: status reporting is the only thing the transport requires of it, and a
 * product that has real state passes its own implementation to `serve()`.
 */
export function createShellHostNodeService(
  status: HostNodeService["getNodeStatus"] = () => "running",
): HostNodeService {
  return {
    on: () => undefined,
    onCallEvent: () => () => undefined,
    getNodeStatus: status,
    // The transport's contract is the *identity* it may advertise, not a
    // liveness flag: a product with no mesh yet reports empty multiaddrs.
    getConnectionStatus: () => ({ peerId: "", multiaddrs: [] }),
    noteClientActivity: () => undefined,
  };
}

export interface ReuseHost {
  /** The port actually bound (equal to the requested one unless it was `0`). */
  readonly port: number;
  readonly path: string;
  /** Serve using the given node surface. Throws without `sessionIdentity`/`dispatch`. */
  serve(nodeService?: HostNodeService): void;
  /** The pairing URI for the running host, using the given token. */
  pairingUri(token: string): string;
  /** Stop serving, if started. */
  stop(): void;
}

/**
 * Wire a host from the two required ports and nothing else.
 *
 * The returned host never touches a store, a profile directory or an identity
 * model: those are the product's, and they arrive through the ports.
 */
export function createReuseHost(options: ReuseHostOptions): ReuseHost {
  const path = options.path ?? "/ws";
  const server = new WsServer(options.port, path, {
    onConnectionChange: options.onConnectionChange,
  });
  let started = false;

  return {
    port: options.port,
    path,
    serve(nodeService = createShellHostNodeService()) {
      if (started) return;
      server.start(nodeService, {
        sessionIdentity: options.sessionIdentity,
        dispatch: options.dispatch,
        ...(options.socketMethods ? { socketMethods: options.socketMethods } : {}),
        ...(options.preAuthMethods ? { preAuthMethods: options.preAuthMethods } : {}),
        ...(options.transformForSession ? { transformForSession: options.transformForSession } : {}),
      });
      started = true;
    },
    pairingUri(token: string) {
      return buildPairingUri({
        v: 1,
        wsUrl: `ws://127.0.0.1:${options.port}${path}`,
        token,
        ...(options.displayName ? { displayName: options.displayName } : {}),
      });
    },
    stop() {
      if (!started) return;
      server.stop();
      started = false;
    },
  };
}
