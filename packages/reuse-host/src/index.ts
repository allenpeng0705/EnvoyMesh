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
 * ## The pairing contract is shared, not local
 *
 * EnvoyMesh's pairing payloads were declared in the product-bound `ws-protocol.ts`,
 * which made the token codec and the URI builder product-bound too and forced a
 * second product to invent its own QR format. They now live in
 * `@envoymesh/protocol` (`pairing-contract.ts`), both modules are `reusable`, and
 * this package imports them from `@envoymesh/api/core` — one format, one parser,
 * and a test that proves a URI built here parses there.
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

// The port types a consumer needs in order to implement the host contract —
// re-exported so a product imports them from here rather than from the transport
// package directly (one fewer dependency in the product's graph).
export type {
  HostNodeService,
  HostRpcDispatcher,
  SessionIdentityResolver,
  SessionPayloadTransform,
  SocketMethodPort,
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
//
// **The shared contract, not a local copy.** EnvoyMesh's pairing payloads used to
// be declared in the product-bound `ws-protocol.ts`, so the token codec and URI
// builder that depended on them were product-bound too, and a second product had
// to invent its own QR format. Both payload types now live in
// `@envoymesh/protocol` (`pairing-contract.ts`) and both modules are `reusable`,
// so this package speaks **the same** QR format as the product — which is the
// only way a pairing code is worth anything.
// Imported for local use (this file builds and parses with them) *and*
// re-exported, so a consumer of this package gets the pairing surface too.
import { parseEnvoyPairUri } from "@envoymesh/api/core";
import type { PairWithHomeNodeParams } from "@envoymesh/api/core";
export {
  decodePairingToken,
  decodePairingTokenAsync,
  encodePairingToken,
  parseEnvoyPairUri,
  type PairingPayload,
  type PairWithHomeNodeParams,
} from "@envoymesh/api/core";

/** Build the `envoy://pair?…` URI that EnvoyMesh's own parser reads. */
export function buildPairingUri(params: PairWithHomeNodeParams): string {
  const query = new URLSearchParams();
  query.set("wsUrl", params.wsUrl);
  if (params.lanWsUrl) query.set("lanWsUrl", params.lanWsUrl);
  query.set("token", params.token);
  query.set("ownerPublicKey", params.ownerPublicKey);
  query.set("ownerId", params.ownerId);
  for (const key of [
    "relayPeerId",
    "agentPeerId",
    "agentPubKey",
    "agentName",
    "homeNodePeerId",
  ] as const) {
    const value = params[key];
    if (value) query.set(key, value);
  }
  return `envoy://pair?${query.toString()}`;
}

/**
 * Parse a pairing URI, returning `null` for anything that is not one.
 *
 * Delegates to the product's parser so there is exactly one definition of the
 * format; the only difference is the failure mode — a scanner meets foreign QR
 * codes, and should not have to catch an exception to reject one.
 */
export function parsePairingUri(uri: string): PairWithHomeNodeParams | null {
  try {
    return parseEnvoyPairUri(uri);
  } catch {
    return null;
  }
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
  /** The pairing URI for the running host, using the given token and identity. */
  pairingUri(token: string, identity: { ownerPublicKey: string; ownerId: string }): string;
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
    /**
     * The pairing URI for the running host. `ownerPublicKey`/`ownerId` are the
     * product's identity and arrive through `identity`, not from this package.
     */
    pairingUri(token: string, identity: { ownerPublicKey: string; ownerId: string }) {
      return buildPairingUri({
        wsUrl: `ws://127.0.0.1:${options.port}${path}`,
        token,
        ownerPublicKey: identity.ownerPublicKey,
        ownerId: identity.ownerId,
      });
    },
    stop() {
      if (!started) return;
      server.stop();
      started = false;
    },
  };
}
