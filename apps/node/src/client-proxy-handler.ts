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
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await streamIo.write(
            encoder.encode(JSON.stringify({ id: msg.id, error: { code: "ERROR", message: errMsg } })),
          );
        }
      }
    } finally {
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
