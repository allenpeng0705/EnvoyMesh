// @ts-nocheck - runtime is loosely typed by design.

/**
 * bond.* arm of `handleInboundMeshMessage` (extracted from
 * `apps/node/src/index.ts`).
 *
 * This is the CLI-inbound equivalent of the embedded path's
 * `handleBondIntentViaRuntime` in
 * `node-service-handlers-bond-intent.ts`. The CLI runtime is a thin
 * adapter that:
 *   1. delegates the bond-validation logic to the node-service runtime
 *   2. forwards the `hello:request` + `bond:established` events to
 *      the CLI's `wsServerForEvents` (the embedded path emits these
 *      via the EventEmitter; the CLI also pushes them to the WS
 *      server so the Social UI can react)
 *   3. records bond-rejection audit events
 *   4. handles the CLI-specific auto-accept flow when a
 *      `bond.request` produces a `bondAcceptToRequester` — the CLI
 *      builds, signs, and delivers a `bond.accept` envelope back to
 *      the requester. The embedded path lets the owner manually
 *      accept; the CLI auto-accepts.
 *
 * The bond.* block used to be a ~150-line block in
 * `handleInboundMeshMessage`. After this slice the entire block
 * is a 1-line call to this runtime.
 */

import {
  handleBondIntentViaRuntime,
  type BondHandlerContext,
} from "./node-service-handlers-bond-intent.js";

export interface CliBondContext extends BondHandlerContext {
  /** The CLI's WsServer for emitting events to the Social UI (or null). */
  wsServerForEvents: {
    emitEvent(event: string, payload: unknown): void;
  } | null;
  /** Live mesh (needed for the auto-accept flow's outbound delivery). */
  getMesh(): { multiaddrs: string[]; tagContactForPersistentReachability(peerId: string): Promise<void> } | undefined;
  /** Persisted node config (used to derive the auto-accept sender). */
  getProfileForAutoAccept(): {
    owner: { ownerId: string };
    device: { publicKeyPem: string; privateKeyPem: string; deviceId: string };
  } | undefined;
  /** Human profile store (for the display-name greeting). */
  getHumanProfileStore(): { loadHumanProfile(): Promise<{ displayName?: string } | undefined> } | undefined;
  /** Peer directory store (for the requester's transport). */
  getPeerDirectoryStore(): {
    getPeerByOwnerId(ownerId: string): Promise<{ listenAddrs?: string[] } | undefined>;
  } | undefined;
  /** Discovery seed store (for the requester's dial hints). */
  getDiscoverySeedStore(): unknown;
  /** Optional: flush pending room state on bond events. */
  flushPendingRoomSyncs?(): Promise<void> | void;
  flushPendingRoomMessages?(): Promise<void> | void;
  /** Build dial hints for an outbound envelope. */
  buildOutboundDialHints(input: unknown): Promise<string[]>;
  /** Deliver an outbound envelope via the mesh. */
  deliverOutboundEnvelope(
    mesh: unknown,
    peerId: string,
    envelope: unknown,
    opts: { dialHints: string[] },
  ): Promise<unknown>;
  /** Sign an unsigned envelope. */
  signUnsignedEnvelope(unsigned: unknown, privateKey: string): unknown;
  /** Create a bond.accept payload. */
  createBondAcceptPayload(input: unknown): unknown;
  /** Create an unsigned envoy envelope. */
  createUnsignedEnvelope(input: unknown): unknown;
  /** Derive peer id from a public key. */
  derivePeerId(publicKey: string): string;
}

export interface CliBondParams {
  envelope: {
    messageId: string;
    intent: string;
    createdAt: string;
    senderPeerId: string;
    payload: unknown;
  };
  remotePeerId: string;
  remoteAddr: string;
  receivedAt: number;
  correlationId?: any;
}

/**
 * Run the bond.* arm with CLI-inbound semantics.
 *
 * Returns true if the bond intent was consumed (regardless of whether
 * it was accepted or rejected). Returns false if the intent is not
 * a bond intent.
 */
export async function handleCliBondIntentViaRuntime(
  ctx: CliBondContext,
  params: CliBondParams,
): Promise<boolean> {
  // Build a context that wraps the CLI's `emit` to additionally push
  // events to the WS server, so the Social UI can react to
  // `hello:request` and `bond:established`.
  const wrappedCtx: BondHandlerContext = {
    getTaskStore: () => ctx.getTaskStore(),
    getProfile: () => ctx.getProfile(),
    storePendingHelloRequest: (data) => {
      ctx.storePendingHelloRequest(data);
      if (ctx.wsServerForEvents) {
        ctx.wsServerForEvents.emitEvent("hello:request", data);
      }
    },
    emit: (event, payload) => {
      ctx.emit(event, payload);
      if (event === "bond:established" && ctx.wsServerForEvents) {
        ctx.wsServerForEvents.emitEvent("bond:established", payload);
      }
    },
    flushPendingRoomSyncs: () => ctx.flushPendingRoomSyncs?.(),
    flushPendingRoomMessages: () => ctx.flushPendingRoomMessages?.(),
    ensurePeerFromInboundChat: (input) => ctx.ensurePeerFromInboundChat(input),
    tagBondedContactReachability: (peerId) =>
      ctx.tagBondedContactReachability(peerId),
  };

  const innerParams = {
    envelope: params.envelope,
    remotePeerId: params.remotePeerId,
    remoteAddr: params.remoteAddr,
  };

  // First, invoke the inner node-service runtime via a wrapped call
  // that captures whether the inner handler reports a
  // `bondAcceptToRequester` to send back. We do this by wrapping
  // the inner context's `emit` to intercept the "bond:established"
  // event payload and detect the auto-accept case.
  //
  // The inner runtime signals auto-accept by emitting
  // `bond:established` with a `bondAcceptToRequester` field in the
  // payload. We intercept that and trigger the auto-accept flow.
  let autoAcceptSignal: {
    requesterPeerId: string;
    requesterOwnerId: string;
  } | null = null;
  const interceptingCtx: BondHandlerContext = {
    ...wrappedCtx,
    emit: (event, payload) => {
      wrappedCtx.emit(event, payload);
      if (event === "bond:established") {
        const p = payload as { bondAcceptToRequester?: unknown };
        if (
          p &&
          typeof p === "object" &&
          "bondAcceptToRequester" in p &&
          p.bondAcceptToRequester &&
          typeof p.bondAcceptToRequester === "object"
        ) {
          const b = p.bondAcceptToRequester as {
            requesterPeerId?: string;
            requesterOwnerId?: string;
          };
          if (b.requesterPeerId && b.requesterOwnerId) {
            autoAcceptSignal = {
              requesterPeerId: b.requesterPeerId,
              requesterOwnerId: b.requesterOwnerId,
            };
          }
        }
      }
    },
  };

  const result = await handleBondIntentViaRuntime(interceptingCtx, innerParams);
  if (!result) return false;

  // If the inner runtime signalled auto-accept, build, sign, and
  // deliver a `bond.accept` envelope to the requester.
  if (autoAcceptSignal) {
    await sendAutoAccept(ctx, params, autoAcceptSignal);
  }
  return true;
}

/**
 * CLI-specific: send a `bond.accept` envelope to the requester.
 */
async function sendAutoAccept(
  ctx: CliBondContext,
  params: CliBondParams,
  signal: { requesterPeerId: string; requesterOwnerId: string },
): Promise<void> {
  const mesh = ctx.getMesh();
  const profile = ctx.getProfileForAutoAccept();
  if (!mesh || !profile) return;
  const humanProfile = await ctx.getHumanProfileStore()?.loadHumanProfile();
  const displayName = humanProfile?.displayName ?? profile.owner.ownerId;
  const requesterDir = await ctx.getPeerDirectoryStore()?.getPeerByOwnerId(
    signal.requesterOwnerId,
  );
  try {
    const dialHints = await ctx.buildOutboundDialHints({
      recipientPeerId: signal.requesterPeerId,
      peerListenAddrs: requesterDir?.listenAddrs,
      discoverySeedStore: ctx.getDiscoverySeedStore(),
      config: undefined,
      localListenAddrs: mesh.multiaddrs,
    });
    const unsignedAccept = ctx.createUnsignedEnvelope({
      senderPeerId: ctx.derivePeerId(profile.device.publicKeyPem),
      senderPublicKey: profile.device.publicKeyPem,
      recipientPeerId: signal.requesterPeerId,
      intent: "bond.accept",
      payload: ctx.createBondAcceptPayload({
        responderOwnerId: profile.owner.ownerId,
        requesterOwnerId: signal.requesterOwnerId,
        message: `Hello from ${displayName}!`,
      }),
      correlationId: params.correlationId ?? "",
    });
    const signedAccept = ctx.signUnsignedEnvelope(
      unsignedAccept,
      profile.device.privateKeyPem,
    );
    await ctx.deliverOutboundEnvelope(
      mesh,
      signal.requesterPeerId,
      signedAccept,
      { dialHints },
    );
    void mesh.tagContactForPersistentReachability(signal.requesterPeerId).catch(
      (err: unknown) =>
        console.warn(`[reachability] auto bond.accept tag failed:`, err),
    );
  } catch (err) {
    console.error(
      `[bond.request] auto-accept: failed to send bond.accept to requester ${signal.requesterPeerId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}