import { byteStream } from "@libp2p/utils";
import type { NodeServiceImpl } from "./node-service-impl.js";
import { routeRpcMethod } from "./json-rpc-router.js";
import {
  closeHomeTerminalWsForCompanion,
  rpcHomeTerminalWsClose,
  rpcHomeTerminalWsOpen,
  rpcHomeTerminalWsSend,
} from "./home-terminal-ws.js";
import { TERMINAL_WS_PORT } from "./service-ports.js";
import {
  anonymousPairingCaller,
  localOwnerCaller,
  runWithRpcCaller,
  sessionCallerFromToken,
  type RpcCallerContext,
} from "./rpc-caller-context.js";
import { wireClientProxyPushEvents } from "./client-proxy-push.js";
import { rpcErrorCode } from "./rpc-error-code.js";

/**
 * Device-scoped registry of live client-proxy (relay) streams, so revocation
 * can actively close them (not just on the next per-RPC token recheck).
 */
const proxyStreamCloseRegistry = new Map<string, Set<() => void>>();

export function registerClientProxyStream(
  deviceId: string | undefined,
  close: () => void,
): () => void {
  if (!deviceId) return () => {};
  let set = proxyStreamCloseRegistry.get(deviceId);
  if (!set) {
    set = new Set();
    proxyStreamCloseRegistry.set(deviceId, set);
  }
  set.add(close);
  return () => {
    set.delete(close);
    if (set.size === 0) proxyStreamCloseRegistry.delete(deviceId);
  };
}

export function closeClientProxyStreamsForDevice(deviceId: string): number {
  const set = proxyStreamCloseRegistry.get(deviceId);
  if (!set) return 0;
  let closed = 0;
  for (const close of [...set]) {
    close();
    closed += 1;
  }
  proxyStreamCloseRegistry.delete(deviceId);
  return closed;
}

/**
 * Creates a libp2p protocol handler for the client-proxy relay bridge.
 *
 * Flow:
 *   1. Read handshake { type: "proxy-connect", token }
 *   2. Validate pairing token
 *   3. Reply { type: "proxy-accept" } or { type: "proxy-reject", reason }
 *   4. Enter bidirectional JSON-RPC loop (+ push events for terminal PTY tunnel)
 */
export function createClientProxyHandler(
  nodeService: NodeServiceImpl,
): (stream: any, _connection: any) => Promise<void> {
  return async (stream, _connection) => {
    const streamIo = byteStream(stream);
    const companion = {};
    // Hoisted so the finally can always unregister, even if registration ran
    // inside a nested branch.
    let unregisterProxyStream: () => void = () => {};
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const emitEvent = async (event: string, data: unknown): Promise<void> => {
      await streamIo.write(encoder.encode(JSON.stringify({ event, data })));
    };

    let unwirePush: () => void = () => {};

    try {
      const handshakeBytes = await streamIo.read();
      if (!handshakeBytes) {
        await stream.close();
        return;
      }
      const handshake = JSON.parse(decoder.decode(handshakeBytes.subarray()));

      const token = handshake?.token as string | undefined;
      if (!token || !(await nodeService.validatePairingToken(token))) {
        await streamIo.write(
          encoder.encode(JSON.stringify({ type: "proxy-reject", reason: "invalid or expired token" })),
        );
        await stream.close();
        return;
      }

      const tokenRecord = await nodeService.lookupSessionToken(token);
      // Store-review tokens (Apple/Google) are deliberately shared with
      // untrusted reviewers — they may ONLY drive the two pre-auth pairing
      // RPCs (pairThinClient / previewFamilyInvite) and must never escalate
      // to the owner caller the way legacy companion-pairing tokens do.
      const reviewToken = tokenRecord ? false : await nodeService.isReviewPairingToken(token);
      // Phase 51 — bind family profile for every proxied RPC (same as WS).
      // Without this, `_callerFamilyProfileId()` defaults to "owner" and
      // EnvoyAI / Ext Agent history collapses onto the owner thread.
      let rpcCaller: RpcCallerContext = tokenRecord
        ? sessionCallerFromToken(tokenRecord)
        : reviewToken
          ? anonymousPairingCaller()
          : localOwnerCaller("");
      if (tokenRecord) {
        try {
          const listed = await nodeService.listFamilyProfiles();
          const match = listed?.profiles?.find((p) => p.id === rpcCaller.profileId);
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

      unregisterProxyStream = registerClientProxyStream(tokenRecord?.deviceId, () => {
        void stream.close().catch(() => {});
      });

      const PROXY_AUDIT_METHODS = new Set([
        "runOwnerAgentTurn",
        "listPendingApprovals",
        "approvePendingApproval",
        "rejectPendingApproval",
      ]);

      await streamIo.write(encoder.encode(JSON.stringify({ type: "proxy-accept" })));

      unwirePush = wireClientProxyPushEvents(nodeService, rpcCaller, (event, data) => {
        void emitEvent(event, data);
      });

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

        // EM-R — a revoked thin client must not keep driving RPCs on a stale
        // handshake. Direct-WS devices are force-closed by the WsServer at
        // revocation time, but relayed proxy streams live outside that
        // registry (only iterated over WsServer.authenticatedSessions): re-check
        // the session token before every RPC (same in-store lookup the connect
        // path uses) and drop the stream once the token is gone.
        if (tokenRecord) {
          const currentRecord = await nodeService.lookupSessionToken(token);
          if (!currentRecord) {
            await streamIo.write(
              encoder.encode(
                JSON.stringify({
                  id: msg.id,
                  error: { code: "UNAUTHORIZED", message: "Session revoked" },
                }),
              ),
            );
            break;
          }
        }

        // Store-review tokens must never reach owner-level RPCs through the
        // proxy — only the two pre-auth pairing methods may run under them.
        if (
          reviewToken &&
          msg.method !== "pairThinClient" &&
          msg.method !== "previewFamilyInvite"
        ) {
          await streamIo.write(
            encoder.encode(
              JSON.stringify({
                id: msg.id,
                error: { code: "UNAUTHORIZED", message: "Authentication required" },
              }),
            ),
          );
          continue;
        }

        try {
          if (msg.method === "homeTerminalWsOpen") {
            const err = await rpcHomeTerminalWsOpen(
              companion,
              (msg.params ?? {}) as { pathWithQuery: string },
              TERMINAL_WS_PORT,
              (event, data) => {
                void emitEvent(event, data);
              },
            );
            await streamIo.write(
              encoder.encode(
                JSON.stringify({
                  id: msg.id,
                  result: err === null ? { ok: true } : { ok: false, error: err },
                }),
              ),
            );
            continue;
          }

          if (msg.method === "homeTerminalWsSend") {
            const err = rpcHomeTerminalWsSend(companion, (msg.params ?? {}) as { dataBase64: string; sessionId?: string });
            await streamIo.write(
              encoder.encode(
                JSON.stringify({
                  id: msg.id,
                  result: err === null ? { ok: true } : { ok: false, error: err },
                }),
              ),
            );
            continue;
          }

          if (msg.method === "homeTerminalWsClose") {
            rpcHomeTerminalWsClose(companion, (msg.params ?? {}) as { sessionId?: string });
            await streamIo.write(encoder.encode(JSON.stringify({ id: msg.id, result: { ok: true } })));
            continue;
          }

          if (PROXY_AUDIT_METHODS.has(msg.method) && tokenRecord?.deviceId) {
            void nodeService.auditHomeRemoteRpc({
              method: msg.method,
              deviceId: tokenRecord.deviceId,
              ownerId: tokenRecord.ownerId,
            });
          }

          const result = await runWithRpcCaller(rpcCaller, () =>
            routeRpcMethod(nodeService, msg.method!, msg.params ?? {}),
          );
          await streamIo.write(encoder.encode(JSON.stringify({ id: msg.id, result })));
          // EM-R — a relayed thin client that revoked *itself* on this stream:
          // the response above was already written, so drop the stream now
          // (parity with the direct-WS response-then-close path). When the
          // caller revoked a different device this stream stays open; the
          // token re-check at the top of the loop closes it if it is ever
          // this device's own token that went away.
          if (
            rpcCaller.deviceId &&
            msg.method === "revokeThinClient" &&
            isSelfRevokeResult(result, rpcCaller.deviceId)
          ) {
            break;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await streamIo.write(
            encoder.encode(
              JSON.stringify({ id: msg.id, error: { code: rpcErrorCode(errMsg), message: errMsg } }),
            ),
          );
        }
      }
    } finally {
      unregisterProxyStream();
      unwirePush();
      closeHomeTerminalWsForCompanion(companion);
      try {
        await stream.close();
      } catch {
        /* ignore */
      }
    }
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
