import { useNodeState } from "../context/NodeStateContext.js";
import { useAgentShareProposals, useShareOffers, useFeedNotifications } from "./useNodeService.js";

/** Pending inbox items: hellos, intros, stranger chat, file shares, agent share suggestions, feed notifies. */
export function useInboxActivityCount(): number {
  const { pendingHellOs, pendingIntroProposals, pendingMessages } = useNodeState();
  const { offers } = useShareOffers();
  const { proposals } = useAgentShareProposals();
  const { unread: feedUnread } = useFeedNotifications();
  return (
    pendingHellOs.length +
    pendingIntroProposals.length +
    pendingMessages.length +
    offers.length +
    proposals.length +
    feedUnread.length
  );
}
