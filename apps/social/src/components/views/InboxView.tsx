import { useNodeState } from "../../context/NodeStateContext.js";
import type { HelloRequest } from "@envoymesh/api";

export function InboxView() {
  const { pendingHellOs, acceptHello, declineHello } = useNodeState();

  const handleAccept = async (request: HelloRequest) => {
    try {
      await acceptHello(request.messageId);
    } catch (error) {
      console.error("Failed to accept hello:", error);
    }
  };

  const handleDecline = async (request: HelloRequest) => {
    try {
      await declineHello(request.messageId);
    } catch (error) {
      console.error("Failed to decline hello:", error);
    }
  };

  if (pendingHellOs.length === 0) {
    return (
      <div className="inbox-view">
        <div className="inbox-header">
          <h2>Inbox</h2>
        </div>
        <div className="inbox-empty">
          <p>No pending requests</p>
          <small>Hello requests from other users will appear here</small>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-view">
      <div className="inbox-header">
        <h2>Inbox</h2>
      </div>
      <ul className="inbox-list">
        {pendingHellOs.map((request) => (
          <li key={request.messageId} className="inbox-item">
            <div className="inbox-sender">
              <span className="avatar large">{request.profile.displayName[0]}</span>
              <div className="inbox-sender-info">
                <strong>{request.profile.displayName}</strong>
                <span className="owner-id">{request.sender.ownerId}</span>
              </div>
            </div>
            {request.profile.bio && (
              <p className="inbox-bio">{request.profile.bio}</p>
            )}
            {request.profile.interests.length > 0 && (
              <span className="interests">{request.profile.interests.join(", ")}</span>
            )}
            {request.message && (
              <p className="inbox-message">"{request.message}"</p>
            )}
            <div className="inbox-actions">
              <button className="accept" onClick={() => handleAccept(request)}>
                Accept
              </button>
              <button className="decline" onClick={() => handleDecline(request)}>
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
