import { useNodeState } from "../context/NodeStateContext.js";
import { useAgentShareProposals, useShareOffers } from "./useNodeService.js";

/** Pending inbox items: hellos, intros, stranger chat, file shares, agent share suggestions. */
export function useInboxActivityCount(): number {
  const { pendingHellOs, pendingIntroProposals, pendingMessages } = useNodeState();
  const { offers } = useShareOffers();
  const { proposals } = useAgentShareProposals();
  return (
    pendingHellOs.length +
    pendingIntroProposals.length +
    pendingMessages.length +
    offers.length +
    proposals.length
  );
}
