import { useState } from "react";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useAgentShareProposals } from "../../hooks/useNodeService.js";
import type { HelloProfile, HelloRequest, ChatMessage, SocialIntroProposal } from "@envoymesh/api";
import { peerDisplayLabel } from "../../lib/display.js";

export function InboxView() {
  const {
    pendingHellOs,
    pendingIntroProposals,
    pendingMessages,
    humanProfile,
    acceptHello,
    declineHello,
    approveIntroCommitment,
    declineIntroProposal,
    sendHello,
    clearPendingMessages,
  } = useNodeState();

  const nodeService = useNodeService();
  const { proposals: agentShareProposals, dismiss: dismissAgentShare } = useAgentShareProposals();

  const [introSaveStatus, setIntroSaveStatus] = useState<string | null>(null);
  const [agentShareBusy, setAgentShareBusy] = useState<string | null>(null);

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

  const profileForHello = (): HelloProfile => ({
    displayName: humanProfile?.displayName ?? "Envoy User",
    bio: humanProfile?.bio ?? "",
    interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
    whatShares: [],
  });

  const handleSayHello = async (targetOwnerId: string) => {
    try {
      await sendHello(targetOwnerId, profileForHello(), "Hello!");
    } catch (error) {
      console.error("Failed to send hello:", error);
    }
  };

  const handleApproveIntro = async (p: SocialIntroProposal) => {
    try {
      setIntroSaveStatus(null);
      await approveIntroCommitment(p.messageId);
      setIntroSaveStatus("Intro approved — you can send hello.");
      setTimeout(() => setIntroSaveStatus(null), 4000);
    } catch (error) {
      console.error("Failed to approve intro:", error);
      setIntroSaveStatus("Approve failed");
    }
  };

  const handleSendIntroHello = async (p: SocialIntroProposal) => {
    try {
      await sendHello(p.candidateOwnerId, profileForHello(), "Hello!", {
        introProposalMessageId: p.messageId,
      });
    } catch (error) {
      console.error("Failed to send hello with intro commitment:", error);
    }
  };

  const handleDeclineIntro = async (p: SocialIntroProposal) => {
    try {
      await declineIntroProposal(p.messageId);
    } catch (error) {
      console.error("Failed to decline intro:", error);
    }
  };

  const pendingStrangerRow = (msg: ChatMessage) => (
    <li key={msg.messageId} className="inbox-item inbox-item-stranger">
      <div className="inbox-sender">
        <span className="avatar large">{peerDisplayLabel(msg.sender).charAt(0) || "?"}</span>
        <div className="inbox-sender-info">
          <strong>{peerDisplayLabel(msg.sender)}</strong>
          <span className="owner-id">{msg.sender.ownerId ?? msg.sender.nodeId}</span>
        </div>
      </div>
      {msg.content?.text && (
        <p className="inbox-message">&ldquo;{msg.content.text}&rdquo;</p>
      )}
      <div className="inbox-actions">
        <button type="button" className="accept" onClick={() => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId)}>
          Say Hello
        </button>
      </div>
    </li>
  );

  const empty =
    pendingHellOs.length === 0 &&
    pendingIntroProposals.length === 0 &&
    pendingMessages.length === 0 &&
    agentShareProposals.length === 0;

  if (empty) {
    return (
      <div className="inbox-view">
        <div className="inbox-header">
          <h2>Inbox</h2>
        </div>
        <div className="inbox-empty">
          <p>No pending activity</p>
          <small>Hello requests, Trust-mode intro proposals, agent share suggestions, and messages from people you haven&apos;t bonded with yet appear here.</small>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-view">
      <div className="inbox-header inbox-header-row">
        <h2>Inbox</h2>
        {pendingMessages.length > 0 && (
          <button type="button" className="clear-inbox" onClick={clearPendingMessages}>
            Clear strangers
          </button>
        )}
      </div>

      {introSaveStatus && (
        <p className="settings-hint" style={{ marginBottom: 8 }}>{introSaveStatus}</p>
      )}

      {pendingIntroProposals.length > 0 && (
        <>
          <h3 className="inbox-section-title">Intro proposals ({pendingIntroProposals.length})</h3>
          <ul className="inbox-list">
            {pendingIntroProposals.map((p) => (
              <li key={p.messageId} className="inbox-item inbox-item-stranger">
                <div className="inbox-sender">
                  <span className="avatar large">{(p.agentOwnerId.slice(-1) ?? "?").toUpperCase()}</span>
                  <div className="inbox-sender-info">
                    <strong>Agent-mediated intro</strong>
                    <span className="owner-id">{p.agentOwnerId}</span>
                  </div>
                </div>
                <p className="inbox-message">
                  Candidate: <code>{p.candidateOwnerId}</code>
                </p>
                {p.rationale && (
                  <p className="inbox-message">&ldquo;{p.rationale}&rdquo;</p>
                )}
                <div className="inbox-actions">
                  {!p.commitmentApproved ? (
                    <button type="button" className="accept" onClick={() => void handleApproveIntro(p)}>
                      Approve commitment
                    </button>
                  ) : (
                    <button type="button" className="accept" onClick={() => void handleSendIntroHello(p)}>
                      Send hello (with commitment)
                    </button>
                  )}
                  <button type="button" className="decline" onClick={() => void handleDeclineIntro(p)}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {agentShareProposals.length > 0 && (
        <>
          <h3 className="inbox-section-title">Agent share suggestions ({agentShareProposals.length})</h3>
          <ul className="inbox-list">
            {agentShareProposals.map((p) => (
              <li key={p.proposalId} className="inbox-item">
                <div className="inbox-sender">
                  <span className="avatar large">A</span>
                  <div className="inbox-sender-info">
                    <strong>Share to contact</strong>
                    <span className="owner-id">{p.targetOwnerId}</span>
                  </div>
                </div>
                <p className="inbox-message">
                  File: <code>{p.vaultRelativePath}</code> · {p.sensitivity}
                </p>
                {p.summary && <p className="inbox-message">&ldquo;{p.summary}&rdquo;</p>}
                <div className="inbox-actions">
                  <button
                    type="button"
                    className="accept"
                    disabled={agentShareBusy === p.proposalId}
                    onClick={() => {
                      void (async () => {
                        setAgentShareBusy(p.proposalId);
                        try {
                          await nodeService.shareFile(p.targetOwnerId, {
                            path: p.vaultRelativePath,
                            sensitivity: p.sensitivity,
                          });
                          await dismissAgentShare(p.proposalId);
                        } catch (err) {
                          console.error("Agent share send failed:", err);
                        } finally {
                          setAgentShareBusy(null);
                        }
                      })();
                    }}
                  >
                    {agentShareBusy === p.proposalId ? "Sending…" : "Send share"}
                  </button>
                  <button type="button" className="decline" onClick={() => void dismissAgentShare(p.proposalId)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingHellOs.length > 0 && (
        <>
          <h3 className="inbox-section-title">Hello requests ({pendingHellOs.length})</h3>
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
                  <p className="inbox-message">&ldquo;{request.message}&rdquo;</p>
                )}
                <div className="inbox-actions">
                  <button type="button" className="accept" onClick={() => handleAccept(request)}>
                    Accept
                  </button>
                  <button type="button" className="decline" onClick={() => handleDecline(request)}>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingMessages.length > 0 && (
        <>
          <h3 className="inbox-section-title">Messages before bonding ({pendingMessages.length})</h3>
          <ul className="inbox-list">{pendingMessages.map(pendingStrangerRow)}</ul>
        </>
      )}
    </div>
  );
}
