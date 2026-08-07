import { useEffect, useRef } from "react";
import type { CachedAgentCardSummary } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { useAgentCards, useNodeService } from "../hooks/useNodeService.js";
import { ChainBondHealthBadge } from "./ChainBondHealthBadge.js";
import { ContactWebContentShortcuts } from "./ContactWebContentShortcuts.js";

export function AgentCardPanel(props: {
  ownerId: string;
  /** When false, omit Profile/Blog/… (e.g. PeerProfilePanel already shows them). Default true. */
  showWebContentShortcuts?: boolean;
}) {
  const t = useT();
  const nodeService = useNodeService();
  const { bonds } = useNodeState();
  const cards = useAgentCards();
  const card = cards.find((c) => c.ownerId === props.ownerId);
  const bond = bonds.find((b) => b.peerOwnerId === props.ownerId);
  const showShortcuts = props.showWebContentShortcuts !== false;
  const fetchedFor = useRef<string | null>(null);

  // If the cache is empty for this contact, pull once (message-protocol exchange).
  useEffect(() => {
    if (card) {
      fetchedFor.current = null;
      return;
    }
    if (fetchedFor.current === props.ownerId) return;
    fetchedFor.current = props.ownerId;
    void nodeService.requestAgentCard(props.ownerId).catch(() => {});
  }, [card, nodeService, props.ownerId]);

  if (!card) {
    return (
      <div className="agent-card-panel agent-card-panel--empty">
        <p className="field-desc">{t("agentCard.empty", "No agent card cached yet.")}</p>
        {showShortcuts ? (
          <ContactWebContentShortcuts ownerId={props.ownerId} compact={false} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="agent-card-panel">
      <div className="agent-card-header">
        <h4 className="agent-card-name">{card.displayName}</h4>
        {bond ? <ChainBondHealthBadge bond={bond} card={card} compact /> : null}
        {card.nodeProfile && (
          <span className={`agent-card-profile agent-card-profile--${card.nodeProfile}`}>
            {t(`agentCard.nodeProfileByName.${card.nodeProfile}`, card.nodeProfile)}
          </span>
        )}
      </div>

      {showShortcuts ? (
        <div className="agent-card-section">
          <ContactWebContentShortcuts ownerId={props.ownerId} compact={false} />
        </div>
      ) : null}

      {card.capabilities.length > 0 && (
        <div className="agent-card-section">
          <h5 className="agent-card-section-title">{t("agentCard.capabilities", "Capabilities")}</h5>
          <ul className="agent-card-capability-list">
            {card.capabilities.map((cap) => (
              <li key={cap} className="agent-card-capability">
                <code>{cap}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.agentNetworkProfile ? (
        <div className="agent-card-section" data-testid="agent-card-network-profile">
          <h5 className="agent-card-section-title">
            {t("agentCard.agentNetworkProfile", "Agent Network profile")}
          </h5>
          <ul className="agent-card-capability-list">
            <li>
              {t("agentCard.freshness", "Freshness")}: {card.agentNetworkProfile.modelFreshness}/10
            </li>
            <li>
              {t("agentCard.contextWindow", "Context")}: {card.agentNetworkProfile.contextWindow}
            </li>
            <li>
              {t("agentCard.spendPosture", "Spend")}: {card.agentNetworkProfile.spendPosture}
            </li>
            {card.agentNetworkProfile.strengths.length > 0 ? (
              <li>
                {t("agentCard.strengths", "Strengths")}:{" "}
                {card.agentNetworkProfile.strengths.join(", ")}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {card.publicTopics && card.publicTopics.length > 0 && (
        <div className="agent-card-section">
          <h5 className="agent-card-section-title">
            {t("agentCard.publicTopics", "Public topics")}
          </h5>
          <ul className="agent-card-topic-list">
            {card.publicTopics.map((topic) => (
              <li key={topic} className="agent-card-topic">
                {topic}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.trustPolicySummary && (
        <div className="agent-card-section">
          <h5 className="agent-card-section-title">
            {t("agentCard.trustPolicy", "Trust policy")}
          </h5>
          <ul className="agent-card-trust-policy">
            <li>
              <strong>{t("agentCard.acceptsDirectBondRequests", "Accepts direct bond requests")}:</strong>{" "}
              {card.trustPolicySummary.acceptsDirectBondRequests ? t("agentCard.yes", "Yes") : t("agentCard.no", "No")}
            </li>
            <li>
              <strong>{t("agentCard.acceptsReferralRequests", "Accepts referral requests")}:</strong>{" "}
              {card.trustPolicySummary.acceptsReferralRequests ? t("agentCard.yes", "Yes") : t("agentCard.no", "No")}
            </li>
            <li>
              <strong>
                {t("agentCard.requiresHumanApprovalForRawFiles", "Requires approval for raw files")}:
              </strong>{" "}
              {card.trustPolicySummary.requiresHumanApprovalForRawFiles
                ? t("agentCard.yes", "Yes")
                : t("agentCard.no", "No")}
            </li>
          </ul>
        </div>
      )}

      {card.supportedProtocolVersions && card.supportedProtocolVersions.length > 0 && (
        <div className="agent-card-section">
          <h5 className="agent-card-section-title">
            {t("agentCard.protocolVersions", "Protocol versions")}
          </h5>
          <ul className="agent-card-protocol-list">
            {card.supportedProtocolVersions.map((v) => (
              <li key={v} className="agent-card-protocol">
                <code>{v}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="agent-card-cached-at field-desc">
        {t("agentCard.cachedAt", "Cached at")}: {new Date(card.cachedAt).toLocaleString()}
        {card.sourceAgentPeerId ? ` (${card.sourceAgentPeerId})` : ""}
      </p>
    </div>
  );
}

/** Convenience accessor for callers that need the raw card row, not the panel. */
export function useAgentCard(ownerId: string): CachedAgentCardSummary | undefined {
  const cards = useAgentCards();
  return cards.find((c) => c.ownerId === ownerId);
}
