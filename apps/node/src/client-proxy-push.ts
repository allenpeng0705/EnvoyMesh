import type { NodeServiceImpl } from "./node-service-impl.js";
import {
  stampConfigCallerForSession,
  type RpcCallerContext,
} from "./rpc-caller-context.js";

/**
 * Forward home-node push events to a single thin-client proxy stream.
 * Mirrors the profile-scoped routing in `ws-server.ts` (one session per stream).
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
    const payload = data as unknown as { config?: Record<string, unknown> };
    const rawConfig = payload?.config;
    if (rawConfig) {
      push("home:config-updated", {
        config: stampConfigCallerForSession({ ...rawConfig }, caller),
      });
      return;
    }
    push("home:config-updated", data);
  }));

  const broadcastEvents = [
    "chat:message",
    "chat:delivered",
    "chat:delivery-failed",
    "bond:established",
    "bond:revoked",
    "bridge:status",
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
