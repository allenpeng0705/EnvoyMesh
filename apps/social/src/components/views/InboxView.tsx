import { useNodeState } from "../../context/NodeStateContext.js";
import { CheckIcon, CloseIcon } from "../../icons.js";
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
        <h2>Inbox</h2>
        <div className="inbox-empty">
          <p>No pending requests</p>
          <small>Hello requests from other users will appear here</small>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-view">
      <h2>Inbox</h2>
      {pendingHellOs.map((request) => (
        <div key={request.messageId} className="inbox-card">
          <div className="inbox-card-avatar">{request.profile.displayName[0]}</div>
          <div className="inbox-card-body">
            <div className="inbox-card-name">{request.profile.displayName}</div>
            <div className="inbox-card-id">{request.sender.ownerId}</div>
            {request.profile.bio && (
              <div className="inbox-card-bio">{request.profile.bio}</div>
            )}
            {request.profile.interests.length > 0 && (
              <div className="inbox-card-interests">
                {request.profile.interests.map((interest) => (
                  <span key={interest} className="inbox-card-interest">{interest}</span>
                ))}
              </div>
            )}
            {request.message && (
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-muted)", fontStyle: "italic" }}>
                "{request.message}"
              </div>
            )}
          </div>
          <div className="inbox-card-actions">
            <button className="btn btn-primary btn-sm" onClick={() => handleAccept(request)}>
              <CheckIcon size={14} />
              Accept
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => handleDecline(request)}>
              <CloseIcon size={14} />
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
