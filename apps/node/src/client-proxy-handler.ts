/**
 * Client-proxy (relay bridge) protocol handler — product middle on the shared mesh host transport.
 *
 * Framing, handshake accept/reject, request/reply correlation and event push live in
 * `createMeshHostTransport`. This module owns pairing tokens, family-profile binding, terminal WS
 * RPCs, and revocation.
 */

import { meshStreamAsDuplex } from "@envoymesh/network";
import {
  createMeshHostTransport,
  createProxyCloseRegistry,
  type HostSession,
} from "@envoymesh/host-connect";
import { TERMINAL_WS_PORT } from "@envoymesh/node-core";
import type { NodeServiceImpl } from "./node-service-impl.js";
import { routeRpcMethod } from "./json-rpc-router.js";
import {
  closeHomeTerminalWsForCompanion,
  rpcHomeTerminalWsClose,
  rpcHomeTerminalWsOpen,
  rpcHomeTerminalWsSend,
} from "./home-terminal-ws.js";
import {
  anonymousPairingCaller,
  localOwnerCaller,
  runWithRpcCaller,
  sessionCallerFromToken,
  type RpcCallerContext,
} from "./rpc-caller-context.js";
import { wireClientProxyPushEvents } from "./client-proxy-push.js";
import { OWNER_FAMILY_PROFILE_ID } from "./family-profile-store.js";

/**
 * Single device-scoped close registry for live client-proxy streams.
 * Revocation must close this set — not a second parallel map.
 */
const proxyCloses = createProxyCloseRegistry();

export function registerClientProxyStream(
  deviceId: string | undefined,
  close: () => void,
): () => void {
  return proxyCloses.register(deviceId, close);
}

export function closeClientProxyStreamsForDevice(deviceId: string): number {
  return proxyCloses.closeForDevice(deviceId);
}

const PROXY_AUDIT_METHODS = new Set([
  "runOwnerAgentTurn",
  "listPendingApprovals",
  "approvePendingApproval",
  "rejectPendingApproval",
]);

type ProxySession = HostSession<RpcCallerContext> & {
  token: string;
  reviewToken: boolean;
  hasTokenRecord: boolean;
};

function unauthorized(message: string): Error {
  const err = new Error(message);
  (err as Error & { code?: string }).code = "UNAUTHORIZED";
  return err;
}

/**
 * Creates a libp2p protocol handler for the client-proxy relay bridge.
 *
 * Transport owns handshake framing + RPC loop; this factory builds per-connection product state
 * (companion terminal map, caller, push subscription).
 */
export function createClientProxyHandler(
  nodeService: NodeServiceImpl,
): (stream: unknown, _connection: unknown) => Promise<void> {
  const serve = createMeshHostTransport<RpcCallerContext>((duplex) => {
    // Per-connection state — the whole reason the transport takes a factory.
    const companion = {};
    let token = "";
    let tokenRecord:
      | Awaited<ReturnType<NodeServiceImpl["lookupSessionToken"]>>
      | undefined;
    let reviewToken = false;
    let rpcCaller: RpcCallerContext = localOwnerCaller("");
    let unregister: () => void = () => undefined;
    /** Filled once subscribe is wired; terminal PTY pushes use the same channel. */
    let emitEvent: (event: string, data: unknown) => void = () => undefined;

    return {
      sessionIdentity: {
        localScopeKey: OWNER_FAMILY_PROFILE_ID,
        resolveSession: async (handshakeToken) => {
          token = handshakeToken;
          if (!(await nodeService.validatePairingToken(token))) {
            return null;
          }

          tokenRecord = await nodeService.lookupSessionToken(token);
          // Store-review tokens (Apple/Google) are deliberately shared with
          // untrusted reviewers — they may ONLY drive the two pre-auth pairing
          // RPCs (pairThinClient / previewFamilyInvite) and must never escalate
          // to the owner caller the way legacy companion-pairing tokens do.
          reviewToken = tokenRecord
            ? false
            : await nodeService.isReviewPairingToken(token);
          // Phase 51 — bind family profile for every proxied RPC (same as WS).
          // Without this, `_callerFamilyProfileId()` defaults to "owner" and
          // EnvoyAI / Ext Agent history collapses onto the owner thread.
          rpcCaller = tokenRecord
            ? sessionCallerFromToken(tokenRecord)
            : reviewToken
              ? anonymousPairingCaller()
              : localOwnerCaller("");
          if (tokenRecord) {
            try {
              const listed = await nodeService.listFamilyProfiles();
              const match = listed?.profiles?.find(
                (p) => p.id === rpcCaller.profileId,
              );
              if (match) {
                rpcCaller = sessionCallerFromToken({
                  ...tokenRecord,
                  isOwnerProfile: match.isOwner === true,
                });
              }
            } catch {
              /* keep heuristic from profileId === "owner" */
            }
          }

          unregister = registerClientProxyStream(tokenRecord?.deviceId, () => {
            void Promise.resolve(duplex.close()).catch(() => {});
          });

          return {
            scopeKey: rpcCaller.profileId || OWNER_FAMILY_PROFILE_ID,
            ownerId: tokenRecord?.ownerId ?? "",
            isOwnerScope: rpcCaller.isOwnerProfile === true,
            deviceId: tokenRecord?.deviceId,
            caller: rpcCaller,
            token,
            reviewToken,
            hasTokenRecord: Boolean(tokenRecord),
          } satisfies ProxySession;
        },
      },
      onSession: (session) => {
        if (session) rpcCaller = session.caller;
      },
      subscribe: (send) => {
        emitEvent = send;
        const unwire = wireClientProxyPushEvents(
          nodeService,
          rpcCaller,
          (event, data) => {
            send(event, data);
          },
        );
        return () => {
          unwire();
          unregister();
          closeHomeTerminalWsForCompanion(companion);
        };
      },
      dispatch: async (method, params, session) => {
        const proxy = session as ProxySession | undefined;
        const activeToken = proxy?.token ?? token;
        const activeReview = proxy?.reviewToken ?? reviewToken;
        const hasRecord = proxy?.hasTokenRecord ?? Boolean(tokenRecord);
        const caller = proxy?.caller ?? rpcCaller;

        // EM-R — a revoked thin client must not keep driving RPCs on a stale
        // handshake. Throw so the transport answers; then close the duplex
        // (parity with the old write-then-break).
        if (hasRecord) {
          const currentRecord =
            await nodeService.lookupSessionToken(activeToken);
          if (!currentRecord) {
            queueMicrotask(() => {
              unregister();
              void Promise.resolve(duplex.close()).catch(() => {});
            });
            throw unauthorized("Session revoked");
          }
        }

        // Store-review tokens must never reach owner-level RPCs through the
        // proxy — only the two pre-auth pairing methods may run under them.
        if (
          activeReview &&
          method !== "pairThinClient" &&
          method !== "previewFamilyInvite"
        ) {
          throw unauthorized("Authentication required");
        }

        if (method === "homeTerminalWsOpen") {
          const err = await rpcHomeTerminalWsOpen(
            companion,
            (params ?? {}) as { pathWithQuery: string },
            TERMINAL_WS_PORT,
            emitEvent,
          );
          return err === null ? { ok: true } : { ok: false, error: err };
        }

        if (method === "homeTerminalWsSend") {
          const err = rpcHomeTerminalWsSend(
            companion,
            (params ?? {}) as { dataBase64: string; sessionId?: string },
          );
          return err === null ? { ok: true } : { ok: false, error: err };
        }

        if (method === "homeTerminalWsClose") {
          rpcHomeTerminalWsClose(
            companion,
            (params ?? {}) as { sessionId?: string },
          );
          return { ok: true };
        }

        if (PROXY_AUDIT_METHODS.has(method) && tokenRecord?.deviceId) {
          void nodeService.auditHomeRemoteRpc({
            method,
            deviceId: tokenRecord.deviceId,
            ownerId: tokenRecord.ownerId,
          });
        }

        const result = await runWithRpcCaller(caller, () =>
          routeRpcMethod(nodeService, method, params ?? {}),
        );

        // EM-R — a relayed thin client that revoked *itself*: after the response
        // is written, close the duplex (parity with direct-WS response-then-close).
        if (
          caller.deviceId &&
          method === "revokeThinClient" &&
          isSelfRevokeResult(result, caller.deviceId)
        ) {
          queueMicrotask(() => {
            unregister();
            void Promise.resolve(duplex.close()).catch(() => {});
          });
        }

        return result;
      },
    };
  });

  return async (stream, _connection) => {
    await serve(meshStreamAsDuplex(stream as never));
  };
}

/**
 * EM-R — true when a `revokeThinClient` result reports `deviceId` as revoked.
 * Lets a relayed thin client that revoked itself drop its own stream right
 * after the JSON-RPC response is written.
 */
export function isSelfRevokeResult(result: unknown, deviceId: string): boolean {
  if (!result || typeof result !== "object") return false;
  const revoked = (result as { revokedDeviceIds?: unknown }).revokedDeviceIds;
  return Array.isArray(revoked) && revoked.includes(deviceId);
}
