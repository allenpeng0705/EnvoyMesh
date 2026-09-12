/**
 * Host contract — the WebSocket host's extension points.
 *
 * ## Why this module exists
 *
 * `ws-server.ts` used to hand-wire 36 `nodeServiceImpl.on(…)` call sites with
 * the delivery policy written inline: which events broadcast, which are
 * owner-only, which chat rooms are profile-scoped. The transport therefore knew
 * what a family profile, a family room and an AI-bot thread key *are*, so any
 * product reusing the host inherited all of it
 * (`docs/envoymesh-refactoring-plan.md` §2.5, §6.1 H1).
 *
 * This module holds the **mechanism**. The host knows how to deliver an event to
 * an audience; it does not know how that audience is chosen. The decisions live
 * in the product policy module (`social-ws-policy.ts`) and are supplied as data.
 *
 * ## The one design addition §6.1 did not anticipate
 *
 * §6.1 sketched three dispositions — `broadcast`, `ownerOnly`, `byProfile`. Two
 * things broke that shape when it met the real wiring:
 *
 * 1. **`ownerOnly` is not a host concept.** "Only the owner profile" names the
 *    family-profile model. The host can express it as `byProfile` with a policy
 *    resolver returning the owner id, which keeps this module free of the
 *    concept. There is deliberately **no `ownerOnly` case here.**
 * 2. **Some events are neither broadcast nor audience-routed.** `chat:family-room-*`
 *    *renames* onto `chat:room-*` and *reshapes* its payload (`kind: "family"`);
 *    `bridge:status` and `home:config-updated` call host methods that need the
 *    socket bookkeeping. Those need a handler, so the type gains
 *    **`hostHandled`** — which names a handler the host provides, rather than
 *    inlining one. An unknown handler name is a defect, not a silent no-op (see
 *    the misspelling guard below).
 *
 * ## The misspelling guard
 *
 * A disposition table is data, so a typo in an event name is not a compile
 * error. Without a guard, a misspelled key would silently drop an event that
 * should have been delivered — and the §6.1 acceptance test ("no `chat:*` is
 * delivered") would pass for the wrong reason. So `dispatchEvent` **warns in
 * non-production** when an event arrives with no registered disposition, and
 * when a disposition names a handler the host does not provide.
 */


import type { WebSocket } from "ws";
/** How the host delivers an event to an audience it did not choose. */
export interface EventDelivery {
  /** Send to every subscribed client. */
  broadcast(event: string, data: unknown): void;
  /** Send only to clients bound to `profileId` (an opaque scope key). */
  toProfile(profileId: string, event: string, data: unknown): void;
}

/**
 * What the host should do with one event.
 *
 * Note there is no `ownerOnly` — see the module doc. A policy that wants
 * owner-only expresses it as `byProfile`.
 */
export type EventDisposition =
  /** Deliver to every subscribed client. */
  | { kind: "broadcast" }
  /**
   * Deliver to the audience the policy resolves. An empty audience means
   * "nobody", which the host logs in non-production (an event that reaches no
   * one is usually a policy bug, not an intent).
   */
  | { kind: "byProfile"; resolve: (data: unknown) => readonly string[] }
  /**
   * Delegate to a handler the **host** provides, by name. Used where delivery
   * needs host internals: an async host operation, or bookkeeping only the host
   * has.
   */
  | { kind: "hostHandled"; handler: string }
  /**
   * Delegate to a handler the **policy** provides, which receives the delivery
   * API. This is the case §6.1's sketch lacked: `chat:family-room-updated`
   * *renames* onto `chat:room-updated` and `chat:family-room-message` reshapes
   * its payload with `kind: "family"`. Both are audience *plus* transformation,
   * which `byProfile` cannot express and which does not belong in the host.
   */
  | {
      kind: "custom";
      handle: (delivery: EventDelivery, data: unknown) => void | Promise<void>;
    };

/** A named handler the host implements for `hostHandled` dispositions. */
export type HostEventHandler = (data: unknown) => void | Promise<void>;

/**
 * The reusable host's event vocabulary.
 *
 * Declared locally rather than imported from `@envoymesh/api`, deliberately.
 * The type *would* be available (`keyof NodeServiceEvents`), but importing that
 * package is not free here: `@envoymesh/api` currently exports the **whole
 * product surface** (E9), so any module that imports it is classified
 * `product-bound` — and this contract exists to be part of the **reusable** host
 * layer. A local list keeps the contract dependency-free while remaining
 * typo-safe, because the table below is `Record<CoreEventName, …>` and therefore
 * must cover the list exactly.
 *
 * Drift is guarded rather than trusted: `ws-event-dispositions.test.ts` asserts
 * this vocabulary is a subset of the real `NodeServiceEvents`, so a rename in
 * the RPC contract fails the test instead of silently dropping events.
 */
export const CORE_EVENT_NAMES = [
  // Node lifecycle
  "node:status",
  "node:online",
  "node:ready",
  "node:offline",
  // Mesh / peer traffic
  "peer:discovered",
  "peer:lost",
  "p2p:envelope",
  "crdt:sync",
  "discovery:multihop-update",
  "config:updated",
  "bridge:status",
  // Envoy Harness turn / permission / activity — fourteen of the host's
  // reusable events live here (these ten, plus `pi:proposal` and the three
  // `terminal:*`), which is why H1 collapsed them into one loop.
  "eh:turn_started",
  "eh:turn_token",
  "eh:turn_complete",
  "eh:turn_hints",
  "eh:prompt_busy",
  "eh:activity",
  "eh:files_changed",
  "eh:permission",
  "eh:user_question",
  "eh:timeline",
  // Terminal / Pi
  "pi:proposal",
  "terminal:session-updated",
  "terminal:watch-ready",
  "terminal:assistant-proposal",
] as const;

/**
 * The address the host binds its WebSocket listener to.
 *
 * The host owns this: it is the host's own socket, and `node-core`'s
 * `SOCIAL_WS_BIND_HOST` is the *product's* name for the same value. Declaring it
 * here is what lets this transport stop importing `@envoymesh/node-core` — and
 * that package is product-bound (it re-exports `home-fs`, which depends on
 * `@envoymesh/api`), so importing it for one string kept the host bound to the
 * product's whole API surface one level removed.
 *
 * A test asserts the two constants are equal, so they cannot drift apart.
 */
export const HOST_WS_BIND_HOST = "0.0.0.0";

/** A reusable event the host knows how to deliver. */
export type CoreEventName = (typeof CORE_EVENT_NAMES)[number];

/**
 * Events the **reusable** host knows about, and nothing else.
 *
 * All 25 are product-agnostic: node lifecycle, peer/mesh traffic, harness turn
 * events, terminal sessions and the Pi proposal. Twenty-three are plain
 * broadcasts; `bridge:status` needs a host handler because it masks bridge
 * capability per caller before emitting.
 *
 * Every key is a member of `CoreEventName`, so the compiler rejects a
 * non-existent event name and the table must cover the vocabulary exactly.
 */
export const CORE_EVENT_DISPOSITIONS: Readonly<Record<CoreEventName, EventDisposition>> =
  Object.freeze({
    "node:status": { kind: "broadcast" },
    "node:online": { kind: "broadcast" },
    "node:ready": { kind: "broadcast" },
    "node:offline": { kind: "broadcast" },
    "peer:discovered": { kind: "broadcast" },
    "peer:lost": { kind: "broadcast" },
    "p2p:envelope": { kind: "broadcast" },
    "crdt:sync": { kind: "broadcast" },
    "discovery:multihop-update": { kind: "broadcast" },
    "config:updated": { kind: "broadcast" },
    // Needs the socket bookkeeping to decide what a given caller may see.
    "bridge:status": { kind: "hostHandled", handler: "bridge:status" },

    // Envoy Harness turn / permission / activity. Fourteen of the host's
    // reusable events live here (these ten plus `pi:proposal` and the three
    // `terminal:*`), which is why H1 collapsed them into one loop.
    "eh:turn_started": { kind: "broadcast" },
    "eh:turn_token": { kind: "broadcast" },
    "eh:turn_complete": { kind: "broadcast" },
    "eh:turn_hints": { kind: "broadcast" },
    "eh:prompt_busy": { kind: "broadcast" },
    "eh:activity": { kind: "broadcast" },
    "eh:files_changed": { kind: "broadcast" },
    "eh:permission": { kind: "broadcast" },
    "eh:user_question": { kind: "broadcast" },
    "eh:timeline": { kind: "broadcast" },

    "pi:proposal": { kind: "broadcast" },
    "terminal:session-updated": { kind: "broadcast" },
    "terminal:watch-ready": { kind: "broadcast" },
    "terminal:assistant-proposal": { kind: "broadcast" },
  } as Record<CoreEventName, EventDisposition>);

/**
 * Merge disposition tables. Later tables win, which is how a product overrides
 * or extends the host's defaults.
 */
export function mergeEventDispositions(
  ...tables: ReadonlyArray<Readonly<Record<string, EventDisposition>>>
): Record<string, EventDisposition> {
  const merged: Record<string, EventDisposition> = {};
  for (const table of tables) Object.assign(merged, table);
  return merged;
}

/** True when warnings should be surfaced (anything but production). */
function warnEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Apply one disposition.
 *
 * Returns `false` when the event was dropped (unknown event, empty audience, or
 * a `hostHandled` disposition with no handler) so callers and tests can assert
 * on it rather than inferring from silence.
 */
export function dispatchEvent(
  event: string,
  disposition: EventDisposition | undefined,
  data: unknown,
  delivery: EventDelivery,
  handlers: Readonly<Record<string, HostEventHandler>>,
): boolean | Promise<boolean> {
  if (!disposition) {
    // The misspelling guard: a typo'd key would otherwise drop the event and
    // look exactly like a deliberate no-op.
    if (warnEnabled()) {
      console.warn(
        `[ws-server] no disposition registered for event "${event}" — dropping it. ` +
          "If this event should be delivered, add it to a disposition table.",
      );
    }
    return false;
  }

  switch (disposition.kind) {
    case "broadcast":
      delivery.broadcast(event, data);
      return true;

    case "byProfile": {
      const audience = disposition.resolve(data);
      if (audience.length === 0) {
        if (warnEnabled()) {
          console.warn(
            `[ws-server] disposition for "${event}" resolved an empty audience — dropping it.`,
          );
        }
        return false;
      }
      for (const profileId of audience) delivery.toProfile(profileId, event, data);
      return true;
    }

    case "custom":
      return Promise.resolve(disposition.handle(delivery, data)).then(() => true);

    case "hostHandled": {
      const handler = handlers[disposition.handler];
      if (!handler) {
        // Also a typo guard: the disposition names a handler nobody implements.
        if (warnEnabled()) {
          console.warn(
            `[ws-server] disposition for "${event}" names unknown handler ` +
              `"${disposition.handler}" — dropping it.`,
          );
        }
        return false;
      }
      return Promise.resolve(handler(data)).then(() => true);
    }
  }
}


// ─── H2 — the session-identity port ─────────────────────────────────────────

/**
 * An authenticated session, as the host sees it.
 *
 * **`scopeKey` is opaque to the host.** The host routes an event to a session by
 * comparing scope keys; it never asks what a key *means*. That is what lets the
 * product decide that one particular key is "the owner profile" without the
 * transport learning the concept.
 *
 * `caller` is likewise opaque here and is handed straight back to
 * `runWithRpcCaller` — the host never inspects it.
 */
export interface HostSession<TCaller = unknown> {
  /** Audience key for routing. Opaque. */
  scopeKey: string;
  /** The account/owner id this session belongs to. Opaque. */
  ownerId: string;
  /** Whether `scopeKey` is the owner scope (product-defined meaning). */
  isOwnerScope: boolean;
  /** Device id, when the product has one. Opaque. */
  deviceId?: string;
  /** Per-call caller context, produced by the product. Opaque. */
  caller: TCaller;
}

/**
 * The host's dependency for turning a session token into a session.
 *
 * **Why this is a port and not inline code.** The auth path used to do the work
 * itself: it looked the token up, then queried the **family profile store** to
 * decide `isOwnerProfile`, **repaired** a "corrupted" binding, and tracked
 * presence — all through `as any` / `as NodeServiceImpl` casts, because none of
 * those members are on the `NodeService` interface (§2.5 (c), §6.1 H2). The host
 * therefore could not answer "who is this?" without the product's profile model.
 *
 * With the port, the host asks one question — *resolve this token* — and the
 * product answers with whatever its identity model says. A product with no
 * profile model supplies a resolver that does not have one.
 */
export interface SessionIdentityResolver<TCaller = unknown> {
  /**
   * Scope key for **untokened loopback clients** (the desktop UI, which is
   * trusted and carries no token). The host needs a value here to keep routing
   * such clients consistently; the product decides which key that is.
   */
  readonly localScopeKey: string;
  /** Resolve a session token, or `null` when it is not valid. */
  resolveSession(token: string): Promise<HostSession<TCaller> | null>;
  /** Best-effort presence bookkeeping. Never throws into the caller. */
  noteSessionActivity?(session: HostSession<TCaller>): void;
}


// ─── host/connect extraction — injected dispatch ────────────────────────────

/**
 * Dispatch one JSON-RPC call under the right caller context.
 *
 * **One injected function replaces three imports.** The host used to reach for
 * the 1,778-line router (`routeRpcMethod`), the caller-context mechanism
 * (`runWithRpcCaller`) and the product's caller factory (`localOwnerCaller`) —
 * all from the same one-line call site. Injecting a single dispatcher removes the
 * product's **authorisation policy** from the transport's dependency graph while
 * changing nothing about what the policy does.
 *
 * The host hands over the method, the params, and the session it authenticated —
 * the same shape H2 established — and does not know how a caller context is
 * built or which methods are permitted.
 */
export type HostRpcDispatcher<TCaller = unknown> = (
  method: string,
  params: Record<string, unknown>,
  session: HostSession<TCaller> | undefined,
) => Promise<unknown>;


// ─── E9 — the narrow host node surface ──────────────────────────────────────

/**
 * Node lifecycle state, as the host forwards it to clients.
 *
 * Declared locally for the same reason as `CORE_EVENT_NAMES`: importing
 * `@envoymesh/api` drags in the **whole product surface** (E9), and this module
 * must stay in the reusable layer. The values are the wire values, so the
 * payload a client receives is byte-identical to before.
 */
export type HostNodeStatus = "offline" | "starting" | "running" | "stopping";

/** Connection state, as the host needs it. */
export interface HostConnectionStatus {
  peerId: string;
  multiaddrs: readonly string[];
}

/** A call-signalling event, as the host delivers it — a name plus a payload. */
export interface HostCallEvent {
  type: string;
}

/**
 * Everything the WebSocket host needs from the node behind it.
 *
 * ## Why five members instead of the interface's 436
 *
 * `ws-server.ts` used to take a `NodeService` — the product's full RPC surface.
 * That reads as "the host can call any of 436 methods", and it was not merely
 * theoretical: the host reached members the interface does not even declare
 * (`mayFamilyProfileUseExtAgent`, and `NodeServiceImpl`'s call-event field before
 * H4), which is how it could only be satisfied by the product's own 18k-line
 * implementation class.
 *
 * The host's real needs are small and statable: subscribe to events, read
 * lifecycle/connection state, and note client activity. Declaring exactly those
 * lets a host be written against this module instead of against
 * `@envoymesh/api`, which is what E9 asks for.
 *
 * Settings are deliberately **not** here. The host used to read `getNodeConfig()`
 * for one pass-through method that needed a base URL; when that method became
 * `socketMethods` (below), the reason to read settings went with it — and
 * with it the last thing the transport knew about the product's configuration.
 *
 * ## Names are the host's, not the product's
 *
 * Member names here are what the *transport* is doing (`noteClientActivity`),
 * not what the product calls it (`recordOwnerActivity`). The composition root
 * adapts. A contract that borrowed product names would still be product-bound by
 * the §3 naming condition, and renaming is cheaper than the coupling.
 */
export interface HostNodeService {
  /** Subscribe to a named node event. */
  on(event: string, listener: (data: unknown) => void): void;
  /** Subscribe to call-signalling events. */
  onCallEvent(listener: (event: HostCallEvent) => void): () => void;
  getNodeStatus(): HostNodeStatus;
  getConnectionStatus(): HostConnectionStatus;
  /** Note that a client performed a user action (presence / idle detection). */
  noteClientActivity(): void;
}

/**
 * Per-session delivery policy: what one authenticated session may receive.
 *
 * ## Why this is a port
 *
 * Two events are not the same for every caller. `home:config-updated` carries a
 * config that must be **stamped** with the receiving session's identity, and
 * `bridge:status` advertises a capability whose `enabled` flag must be
 * **masked** for callers the product has not granted it to. Both were written
 * into this transport — as a call to the product's `stampConfigCallerForSession`
 * and a cast to the product's `mayFamilyProfileUseExtAgent` — so the transport
 * knew what a family profile is, and importing its caller type pulled in the
 * product's caller-context policy module wholesale.
 *
 * The host's actual job is smaller and statable: *ask the product what this
 * session may receive, then send that.* It passes the session it authenticated
 * plus the payload, and does not know why the answer differs.
 *
 * ## Contract
 *
 * Return the payload to send. Returning `data` unchanged means "as-is". A
 * throw propagates to the caller of the handler; a gate that cannot answer
 * should therefore return the **restricted** payload, not throw.
 */
export type SessionPayloadTransform<TCaller = unknown> = (
  event: string,
  data: unknown,
  session: HostSession<TCaller>,
) => unknown | Promise<unknown>;

/**
 * Copy `status` with `enabled: false` when the caller may not see it enabled.
 *
 * Inlined rather than imported: the product's helper lives in
 * `@envoymesh/api/family-profile` and is named after the capability it was
 * written for, which is exactly the dependency this module exists to avoid. The
 * behaviour is two lines and generic.
 */
export function maskEnabledField<T extends { enabled: boolean }>(
  status: T,
  maySeeEnabled: boolean,
): T {
  if (!status.enabled || maySeeEnabled) return status;
  return { ...status, enabled: false };
}

/**
 * A product method that needs the client connection, handed its whole context.
 *
 * The `homeClawCoreWs*` / `homeTerminalWs*` family were six `if (method === …)`
 * blocks inside the transport, each bridging a *product* WebSocket proxy through
 * the host's socket. That made the transport import both products' modules, and
 * — because one reads `getNodeConfig()` and the other reads the terminal port —
 * made the host responsible for settings it has no business knowing.
 *
 * The host's job is only to say *when* such a method may run (after the auth
 * gate, before `dispatch`) and to supply the reply surface. Which methods exist,
 * what they do, and where they connect is the product's.
 */
export interface SocketMethodContext<TCaller = unknown> {
  /** The client connection. Handed over deliberately: these methods proxy it. */
  connection: WebSocket;
  method: string;
  params: Record<string, unknown>;
  session: HostSession<TCaller> | undefined;
  /** Push an event to this client. */
  send(event: string, data: unknown): void;
  /** Reply with a result. */
  ok(result: unknown): void;
  /** Reply with a product-level failure (carried as `{ ok: false, error }`). */
  fail(message: string): void;
}

/**
 * The product's per-connection socket surface.
 *
 * Both members are here together because they belong together: `handle` attaches
 * a proxy to a connection, `closed` releases it. Leaving `closed` out is how a
 * pass-through leaks — the transport tears the socket down and the product's
 * proxy never hears about it.
 */
export interface SocketMethodPort<TCaller = unknown> {
  /** Handle one product method. Return `true` when it replied. */
  handle(context: SocketMethodContext<TCaller>): Promise<boolean>;
  /** The connection is going away. Release whatever `handle` attached to it. */
  closed?(connection: WebSocket): void;
}
