/**
 * The composition root's adapter from the product node to the host's contract.
 *
 * The WebSocket host declares exactly what it needs (`HostNodeService`, five
 * members) rather than taking `NodeService` and with it the product's whole
 * 436-method surface. Something must bridge the two, and this is it.
 *
 * ## Why the bridge is here and not in the host
 *
 * Two of the host's questions do not exist on `NodeService` under those names:
 *
 * * **client activity** is `recordOwnerActivity` — an *owner* concept the host
 *   should not have to know is called that, and
 * * **call subscriptions** are typed over the product's own event union.
 *
 * A host that wrote either name itself would be product-bound by the §3 naming
 * condition. Adapting here keeps the naming in the product, which is what the
 * transport needs in order to be packaged without it.
 *
 * The capability gate that used to be here moved out entirely: it is
 * delivery-time policy, not a node question, so it is now the
 * `transformForSession` port in `social-session-delivery.ts` — where the
 * `instanceof` and the fail-closed rule live together with the rules that use
 * them.
 */

import type { CallEvent, NodeService, NodeServiceEvents } from "@envoymesh/api";
import type { HostNodeService } from "@envoymesh/host-connect";

/** Adapt the product's node to the contract the WebSocket host depends on. */
export function createHostNodeService(node: NodeService): HostNodeService {
  return {
    // `keyof NodeServiceEvents` is narrower than the host's `string`, which is
    // correct: the host may ask for any name, and the node ignores unknown ones.
    on: (event, listener) => node.on(event as keyof NodeServiceEvents, listener),
    onCallEvent: (listener) => node.onCallEvent(listener as (event: CallEvent) => void),
    getNodeStatus: () => node.getNodeStatus(),
    getConnectionStatus: () => node.getConnectionStatus(),
    noteClientActivity: () => node.recordOwnerActivity(),
  };
}
