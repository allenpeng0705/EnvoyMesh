/**
 * The product's per-session delivery policy, as one function.
 *
 * Two of EnvoyMesh's events are not the same for every caller, and the rules are
 * the product's, not the transport's:
 *
 * | Event | Rule |
 * |---|---|
 * | `home:config-updated` | Stamp the config with the **receiving** session's profile identity, and withhold other profiles' AI bots from it. |
 * | `bridge:status` | Mask `enabled` for a session whose profile has not been granted the Ext Agent. |
 *
 * Both used to live inside `ws-server.ts` — as a call to
 * `stampConfigCallerForSession` and a structural cast to
 * `mayFamilyProfileUseExtAgent`. That is why the transport imported the
 * product's caller-context module, and therefore why it could not be packaged
 * without the product. This module is the product's answer to the host's one
 * question (`SessionPayloadTransform`): *what may this session receive?*
 *
 * ## Fail closed
 *
 * `bridge:status` is a **capability advertisement**. When the gate cannot
 * answer — a node that is not the product's implementation, or a store read that
 * throws — the answer is the masked payload, never the raw one. An unavailable
 * permission check must deny.
 */

import type { NodeService } from "@envoymesh/api";
import { NodeServiceImpl } from "./node-service-impl.js";
import { maskEnabledField, type HostSession, type SessionPayloadTransform } from "@envoymesh/host-connect";
import { stampConfigCallerForSession, type RpcCallerContext } from "./rpc-caller-context.js";

/** Capability advertisements this policy masks. */
const CAPABILITY_GATE_EVENTS = new Set(["bridge:status"]);

/**
 * May this session use the Ext Agent — asked of the node, **failing closed**.
 *
 * The gate is a member of `NodeServiceImpl` that `NodeService` does not declare,
 * which is why this is a separate export: it contains the one `instanceof` the
 * composition root is allowed to make (§2.5 (c)), so `createSocialSessionDelivery`
 * below stays a pure policy function a test can drive without a node.
 *
 * A node that is not the product's implementation cannot answer, and an
 * unanswerable permission check denies.
 */
export function nodeMayUseExtAgent(
  node: NodeService,
  session: HostSession<RpcCallerContext>,
): Promise<boolean> {
  return node instanceof NodeServiceImpl
    ? node.mayFamilyProfileUseExtAgent(session.scopeKey, session.isOwnerScope)
    : Promise.resolve(false);
}

/**
 * Build the composition root's `transformForSession` port.
 *
 * The gate is injected rather than reached for, so this function is a pure
 * function of its inputs: the policy can be tested for what it decides without
 * standing up a node.
 */
export function createSocialSessionDelivery(
  mayUseExtAgent: (session: HostSession<RpcCallerContext>) => Promise<boolean>,
): SessionPayloadTransform<RpcCallerContext> {
  return async (event, data, session) => {
    if (event === "home:config-updated") {
      const payload = data as { config?: Record<string, unknown> } | null | undefined;
      const fullConfig = payload?.config;
      // No config to stamp (a malformed or partial emit) → deliver as-is, which
      // is what the transport did before this policy moved here.
      if (!fullConfig) return data;
      const config = stampConfigCallerForSession({ ...fullConfig }, session.caller);
      return { config };
    }

    if (CAPABILITY_GATE_EVENTS.has(event)) {
      const status =
        data && typeof data === "object" ? (data as { enabled: boolean }) : null;
      // Not an advertisement of an enabled capability → nothing to mask.
      if (!status || status.enabled !== true) return data;
      // The owner's own session is unrestricted.
      if (session.isOwnerScope) return data;
      let mayUse = false;
      try {
        mayUse = await mayUseExtAgent(session);
      } catch {
        mayUse = false;
      }
      return maskEnabledField(status, mayUse);
    }

    return data;
  };
}
