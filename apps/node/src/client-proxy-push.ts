import type { NodeServiceImpl } from "./node-service-impl.js";
import type { HostSession } from "@envoymesh/host-connect";
import type { RpcCallerContext } from "./rpc-caller-context.js";
import { createSocialSessionDelivery } from "./social-session-delivery.js";

/**
 * Forward home-node push events to a single thin-client proxy stream.
 *
 * ## Two transports, one policy
 *
 * This path used to hand-roll the per-caller rules: it stamped
 * `home:config-updated` itself and pushed **`bridge:status` through unmasked** (it
 * sat in the `broadcastEvents` list below). The WebSocket host masks that
 * advertisement per session — a family profile without `extAgentEnabled` must
 * never see `enabled: true`, or EnvoyGo re-shows the Ext Agent chat row — and the
 * client-proxy is the transport EnvoyGo actually uses for its DHT-direct and
 * circuit-relay candidates, which the relay dials as
 * `/envoymesh/client-proxy/0.1.0`.
 *
 * So the same `transformForSession` policy object the host takes is used here,
 * against a session synthesised from this stream's caller. One implementation of
 * "what may this caller see", applied on both transports.
 */
export function wireClientProxyPushEvents(
  nodeService: NodeServiceImpl,
  caller: RpcCallerContext,
  emitEvent: (event: string, data: unknown) => void | Promise<void>,
): () => void {
  const unsubs: Array<() => void> = [];
  const push = (event: string, data: unknown) => {
    void emitEvent(event, data);
  };

  // The caller, as the host's port sees a session. `scopeKey` carries the profile
  // id the mask/stamp rules key on; the two transports therefore agree by
  // construction rather than by two copies of the same condition.
  const session: HostSession<RpcCallerContext> = {
    scopeKey: caller.profileId,
    ownerId: caller.ownerId,
    isOwnerScope: caller.isOwnerProfile,
    deviceId: caller.deviceId,
    caller,
  };
  const delivery = createSocialSessionDelivery((s) =>
    nodeService.mayFamilyProfileUseExtAgent(s.scopeKey, s.isOwnerScope),
  );
  const pushTransformed = async (event: string, data: unknown) => {
    // Fail closed: `createSocialSessionDelivery` answers with the *restricted*
    // payload when its gate throws, so a store or node failure cannot leak.
    push(event, await delivery(event, data, session));
  };

  if (caller.isOwnerProfile) {
    unsubs.push(
      nodeService.on("chat:room-message", (data) => push("chat:room-message", data)),
    );
    unsubs.push(
      nodeService.on("chat:room-updated", (data) => push("chat:room-updated", data)),
    );
    unsubs.push(
      nodeService.on("chat:room-removed", (data) => push("chat:room-removed", data)),
    );
    unsubs.push(
      nodeService.on("terminal:session-updated", (data) =>
        push("terminal:session-updated", data),
      ),
    );
  }

  unsubs.push(nodeService.on("chat:family-room-updated", (data) => {
    const row = data as { targetProfileId?: string; room?: unknown };
    const profileId = row?.targetProfileId?.trim();
    if (!profileId || profileId !== caller.profileId || row.room == null) return;
    push("chat:room-updated", row.room);
  }));

  unsubs.push(nodeService.on("chat:family-room-message", (data) => {
    const row = data as {
      targetProfileId?: string;
      roomId?: string;
      message?: unknown;
    };
    const profileId = row?.targetProfileId?.trim();
    if (!profileId || profileId !== caller.profileId) return;
    push("chat:room-message", {
      roomId: row.roomId,
      message: row.message,
      kind: "family",
    });
  }));

  unsubs.push(nodeService.on("home:config-updated", (data) => {
    void pushTransformed("home:config-updated", data);
  }));

  // Per caller: a capability advertisement whose `enabled` flag is masked for
  // profiles that have not been granted it (the gap this file used to have).
  unsubs.push(nodeService.on("bridge:status", (data) => {
    void pushTransformed("bridge:status", data);
  }));

  const broadcastEvents = [
    "chat:message",
    "chat:delivered",
    "chat:delivery-failed",
    "bond:established",
    "bond:revoked",
    "agent:activity",
    "feed:notify",
    "content:engage",
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
    "homeTerminalWs:rx",
    "homeTerminalWs:closed",
    "node:status",
    "node:online",
    "node:offline",
  ] as const;

  for (const name of broadcastEvents) {
    unsubs.push(nodeService.on(name, (data) => push(name, data)));
  }

  return () => {
    for (const unsub of unsubs) unsub();
  };
}
