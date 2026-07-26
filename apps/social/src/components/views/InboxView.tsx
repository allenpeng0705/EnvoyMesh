import { useState, useEffect, useRef } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService, useAgentShareProposals, useShareOffers, usePendingApprovals, useFeedNotifications } from "../../hooks/useNodeService.js";
import { IncomingShareOffersSection } from "../file-share/IncomingShareOffersSection.js";
import type { HelloProfile, HelloRequest, ChatMessage, SocialIntroProposal, PendingApprovalSummary } from "@envoymesh/api";
import { peerDisplayLabel, shortOwnerId } from "../../lib/display.js";
import {
  OPEN_INBOX_EVENT,
  clearInboxPublisherFilter,
  getInboxPublisherFilter,
  openBrowserAt,
} from "../../lib/browser-nav.js";

export interface InboxViewProps {
  /** When nested under Chat → Inbox, omit duplicate page title */
  embedded?: boolean;
}

export function InboxView({ embedded = false }: InboxViewProps) {
  const t = useT();
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
  const { offers: pendingShareOffers } = useShareOffers();
  const { items: pendingApprovals, approve: approvePending, reject: rejectPending } = usePendingApprovals();
  const { items: feedNotifications, dismiss: dismissFeed, dismissAll: dismissAllFeed } = useFeedNotifications();

  // Open-Inbox → clear badge: when the Inbox mounts, bulk-dismiss all feed
  // notifications so the unread badge drops to zero. This matches the
  // conventional folder-open behavior of email/messaging apps. Actionable
  // requests (approvals, offers, intros, hellos) are NOT cleared — they live
  // in separate stores with their own accept/decline flows.
  // The ref guard ensures the clear fires only once per mount, not on every
  // re-render, so in-session per-row dismiss buttons still work normally.
  const clearedFeedOnMountRef = useRef(false);
  useEffect(() => {
    if (clearedFeedOnMountRef.current) return;
    if (feedNotifications.length === 0) return;
    clearedFeedOnMountRef.current = true;
    void dismissAllFeed().catch(console.error);
  }, [feedNotifications.length, dismissAllFeed]);
  const [feedBusy, setFeedBusy] = useState<string | null>(null);
  const [feedPublisherFilter, setFeedPublisherFilter] = useState<string | null>(
    () => getInboxPublisherFilter(),
  );

  useEffect(() => {
    const syncFilter = () => setFeedPublisherFilter(getInboxPublisherFilter());
    syncFilter();
    window.addEventListener(OPEN_INBOX_EVENT, syncFilter);
    return () => window.removeEventListener(OPEN_INBOX_EVENT, syncFilter);
  }, []);

  const visibleFeedNotifications = feedPublisherFilter
    ? feedNotifications.filter((item) => item.publisherOwnerId === feedPublisherFilter)
    : feedNotifications;

  const [introSaveStatus, setIntroSaveStatus] = useState<string | null>(null);
  const [agentShareBusy, setAgentShareBusy] = useState<string | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);

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
    displayName: humanProfile?.displayName ?? t("inbox.defaultUserName"),
    bio: humanProfile?.bio ?? "",
    interests: [...(humanProfile?.hobbies ?? []), ...(humanProfile?.knowledge ?? [])],
    whatShares: [],
  });

  const handleSayHello = async (targetOwnerId: string) => {
    try {
      await sendHello(targetOwnerId, profileForHello(), t("inbox.defaultHello"));
    } catch (error) {
      console.error("Failed to send hello:", error);
    }
  };

  const handleApproveIntro = async (p: SocialIntroProposal) => {
    try {
      setIntroSaveStatus(null);
      await approveIntroCommitment(p.messageId);
      setIntroSaveStatus(t("inbox.introApproved"));
      setTimeout(() => setIntroSaveStatus(null), 4000);
    } catch (error) {
      console.error("Failed to approve intro:", error);
      setIntroSaveStatus(t("inbox.introApproveFailed"));
    }
  };

  const handleSendIntroHello = async (p: SocialIntroProposal) => {
    try {
      await sendHello(p.candidateOwnerId, profileForHello(), t("inbox.defaultHello"), {
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

  const handleRejectApproval = async (item: PendingApprovalSummary) => {
    setApprovalBusy(item.id);
    try {
      await rejectPending(item.id);
    } catch (error) {
      console.error("Failed to reject approval:", error);
    } finally {
      setApprovalBusy(null);
    }
  };

  const handleApprovePending = async (item: PendingApprovalSummary) => {
    setApprovalBusy(item.id);
    try {
      const result = await approvePending(item.id);
      if (!result.ok) {
        console.error("Approve failed:", result.error);
      }
    } catch (error) {
      console.error("Failed to approve pending action:", error);
    } finally {
      setApprovalBusy(null);
    }
  };

  const pendingStrangerRow = (msg: ChatMessage) => {
    // Render the sender header without duplicating the technical ID:
    //   * strong label = peerDisplayLabel (displayName, falls back to nodeId)
    //   * owner-id line only shown if it adds information, and shown
    //     truncated so a 50-char `envoy:owner:…` doesn't dominate the row.
    // Previously the same full owner ID was rendered twice (strong + span),
    // which read as a duplicated ID string before the message body.
    const label = peerDisplayLabel(msg.sender);
    const technicalId = msg.sender.ownerId ?? msg.sender.nodeId ?? "";
    const technicalIsUseful =
      technicalId.trim().length > 0 && technicalId.trim() !== label.trim();
    const avatarInitial = label.trim().charAt(0) || "?";
    return (
      <li key={msg.messageId} className="inbox-item inbox-item-stranger">
        <div className="inbox-sender">
          <span className="avatar large">{avatarInitial}</span>
          <div className="inbox-sender-info">
            <strong>{label}</strong>
            {technicalIsUseful && (
              <span className="owner-id">{shortOwnerId(technicalId)}</span>
            )}
          </div>
        </div>
        {msg.content?.text && (
          <p className="inbox-message">&ldquo;{msg.content.text}&rdquo;</p>
        )}
        <div className="inbox-actions">
          <button type="button" className="accept" onClick={() => handleSayHello(msg.sender.ownerId ?? msg.sender.nodeId)}>
            {t("common.sayHello")}
          </button>
        </div>
      </li>
    );
  };

  const empty =
    pendingHellOs.length === 0 &&
    pendingIntroProposals.length === 0 &&
    pendingMessages.length === 0 &&
    agentShareProposals.length === 0 &&
    pendingShareOffers.length === 0 &&
    pendingApprovals.length === 0 &&
    feedNotifications.length === 0;

  if (empty) {
    return (
      <div className={`inbox-view${embedded ? " inbox-view--embedded" : ""}`}>
        {!embedded && (
          <header className="inbox-header">
            <h2>{t("inbox.title")}</h2>
          </header>
        )}
        <div className="inbox-empty inbox-empty--refined">
          <p>{t("inbox.empty")}</p>
          <small>{t("inbox.emptyDesc")}</small>
        </div>
      </div>
    );
  }

  return (
    <div className={`inbox-view${embedded ? " inbox-view--embedded" : ""}`}>
      <header className="inbox-header inbox-header-row">
        {!embedded ? <h2>{t("inbox.title")}</h2> : <h3 className="inbox-embedded-title">{t("inbox.title")}</h3>}
        {pendingMessages.length > 0 && (
          <button type="button" className="clear-inbox" onClick={clearPendingMessages}>
            {t("inbox.clearStrangers")}
          </button>
        )}
      </header>

      {introSaveStatus && (
        <p className="settings-hint" style={{ marginBottom: 8 }}>{introSaveStatus}</p>
      )}

      {feedPublisherFilter ? (
        <div className="inbox-feed-filter" data-testid="inbox-feed-filter">
          <span>
            {t("inbox.feedFilterByPublisher", "Showing feeds from {owner}", {
              owner: shortOwnerId(feedPublisherFilter),
            })}
          </span>
          <button
            type="button"
            className="linkish"
            onClick={() => {
              clearInboxPublisherFilter();
              setFeedPublisherFilter(null);
            }}
          >
            {t("inbox.feedFilterClear", "Show all")}
          </button>
        </div>
      ) : null}

      {feedPublisherFilter && visibleFeedNotifications.length === 0 ? (
        <p className="field-desc" data-testid="inbox-feed-filter-empty">
          {t("inbox.feedFilterEmpty", "No published posts from this contact yet.")}
        </p>
      ) : null}

      {visibleFeedNotifications.length > 0 && (
        <>
          <h3 className="inbox-section-title">
            {t("inbox.feedNotifications", { count: visibleFeedNotifications.length })}
          </h3>
          <ul className="inbox-list">
            {visibleFeedNotifications.map((item) => (
              <li key={item.id} className="inbox-item" data-testid="feed-notify-row">
                <div className="inbox-sender">
                  <span className="avatar large">W</span>
                  <div className="inbox-sender-info">
                    <strong>{item.title}</strong>
                    <span className="owner-id">{shortOwnerId(item.publisherOwnerId)}</span>
                  </div>
                </div>
                {item.summary ? <p className="inbox-message">{item.summary}</p> : null}
                <div className="inbox-actions">
                  <button
                    type="button"
                    className="accept"
                    data-testid="feed-notify-open-browser"
                    disabled={feedBusy === item.id}
                    onClick={() => {
                      openBrowserAt(item.url);
                      setFeedBusy(item.id);
                      void dismissFeed(item.id).finally(() => setFeedBusy(null));
                    }}
                  >
                    {t("inbox.openInBrowser")}
                  </button>
                  <button
                    type="button"
                    className="decline"
                    disabled={feedBusy === item.id}
                    onClick={() => {
                      setFeedBusy(item.id);
                      void dismissFeed(item.id).finally(() => setFeedBusy(null));
                    }}
                  >
                    {t("inbox.dismiss")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingApprovals.length > 0 && (
        <>
          <h3 className="inbox-section-title">{t("inbox.aiApprovals", { count: pendingApprovals.length })}</h3>
          <ul className="inbox-list">
            {pendingApprovals.map((item) => (
              <li key={item.id} className="inbox-item">
                <div className="inbox-sender">
                  <span className="avatar large">AI</span>
                  <div className="inbox-sender-info">
                    <strong>{item.title}</strong>
                    <span className="owner-id">
                      {item.contactDisplayName ?? item.contactOwnerId ?? item.actionType}
                    </span>
                  </div>
                </div>
                <p className="inbox-message">{item.description}</p>
                {item.draftContent ? (
                  <p className="inbox-message">&ldquo;{item.draftContent.slice(0, 240)}{item.draftContent.length > 240 ? "…" : ""}&rdquo;</p>
                ) : null}
                <div className="inbox-actions">
                  <button
                    type="button"
                    className="accept"
                    disabled={approvalBusy === item.id}
                    onClick={() => void handleApprovePending(item)}
                  >
                    {approvalBusy === item.id ? t("inbox.sending") : t("inbox.approveSend")}
                  </button>
                  <button
                    type="button"
                    className="decline"
                    disabled={approvalBusy === item.id}
                    onClick={() => void handleRejectApproval(item)}
                  >
                    {t("inbox.reject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingIntroProposals.length > 0 && (
        <>
          <h3 className="inbox-section-title">{t("inbox.introProposals", { count: pendingIntroProposals.length })}</h3>
          <ul className="inbox-list">
            {pendingIntroProposals.map((p) => (
              <li key={p.messageId} className="inbox-item inbox-item-stranger">
                <div className="inbox-sender">
                  <span className="avatar large">{(p.agentOwnerId.slice(-1) ?? "?").toUpperCase()}</span>
                  <div className="inbox-sender-info">
                    <strong>{t("inbox.agentMediatedIntro")}</strong>
                    <span className="owner-id">{p.agentOwnerId}</span>
                  </div>
                </div>
                <p className="inbox-message">
                  {t("inbox.candidate")} <code>{p.candidateOwnerId}</code>
                </p>
                {p.rationale && (
                  <p className="inbox-message">&ldquo;{p.rationale}&rdquo;</p>
                )}
                <div className="inbox-actions">
                  {!p.commitmentApproved ? (
                    <button type="button" className="accept" onClick={() => void handleApproveIntro(p)}>
                      {t("inbox.approveCommitment")}
                    </button>
                  ) : (
                    <button type="button" className="accept" onClick={() => void handleSendIntroHello(p)}>
                      {t("inbox.sendHelloCommitment")}
                    </button>
                  )}
                  <button type="button" className="decline" onClick={() => void handleDeclineIntro(p)}>
                    {t("common.decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <IncomingShareOffersSection embedded />

      {agentShareProposals.length > 0 && (
        <>
          <h3 className="inbox-section-title">{t("inbox.agentShareSuggestions", { count: agentShareProposals.length })}</h3>
          <ul className="inbox-list">
            {agentShareProposals.map((p) => (
              <li key={p.proposalId} className="inbox-item">
                <div className="inbox-sender">
                  <span className="avatar large">A</span>
                  <div className="inbox-sender-info">
                    <strong>{t("inbox.shareToContact")}</strong>
                    <span className="owner-id">{p.targetOwnerId}</span>
                  </div>
                </div>
                <p className="inbox-message">
                  {t("inbox.fileLabel")} <code>{p.vaultRelativePath}</code> · {p.sensitivity}
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
                    {agentShareBusy === p.proposalId ? t("inbox.sending") : t("inbox.sendShare")}
                  </button>
                  <button type="button" className="decline" onClick={() => void dismissAgentShare(p.proposalId)}>
                    {t("inbox.dismiss")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingHellOs.length > 0 && (
        <>
          <h3 className="inbox-section-title">{t("inbox.helloRequests", { count: pendingHellOs.length })}</h3>
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
                    {t("common.accept")}
                  </button>
                  <button type="button" className="decline" onClick={() => handleDecline(request)}>
                    {t("common.decline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {pendingMessages.length > 0 && (
        <>
          <h3 className="inbox-section-title">{t("inbox.messagesBeforeBonding", { count: pendingMessages.length })}</h3>
          <ul className="inbox-list">{pendingMessages.map(pendingStrangerRow)}</ul>
        </>
      )}
    </div>
  );
}
