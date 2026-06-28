/**
 * Per-contact reachability indicator for the ChatSidebar bond list.
 *
 * Uses usePeerReachability to poll the libp2p connection state and
 * renders a colored dot + label ("Online · Direct", "Online · Relay",
 * "Checking…", "Offline").
 */
import { usePeerReachability, peerReachabilityLabel } from "../hooks/usePeerReachability.js";

interface Props {
  ownerId: string;
}

export function BondReachabilityDot({ ownerId }: Props) {
  const { info, checking } = usePeerReachability(ownerId, true);

  const reachable = info?.connected === true;
  const className = reachable
    ? info?.direct
      ? "online-direct"
      : "online-relay"
    : checking
      ? "checking"
      : "offline";

  return (
    <span className={`contact-reachability ${className}`} title="libp2p reachability">
      <span className="contact-reachability-dot" aria-hidden />
      <span className="contact-reachability-label">
        {peerReachabilityLabel(info)}
      </span>
    </span>
  );
}
