/**
 * Phase 34: render the cached `AgentCard` summary for a peer. Surfaces the
 * richer optional fields (nodeProfile, publicTopics, trustPolicySummary,
 * supportedProtocolVersions) added to `CachedAgentCardSummary` in this phase.
 *
 * `useAgentCards` keeps the list hot — this component just looks up the row
 * for the given `ownerId` and renders. Renders nothing if no card is cached
 * yet, so it can be embedded in peer-details panels without flicker.
 */
import { useT } from "../context/I18nContext.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { useAgentCards } from "../hooks/useNodeService.js";
import type { CachedAgentCardSummary } from "@envoymesh/api";
import { ChainBondHealthBadge } from "./ChainBondHealthBadge.js";

export function AgentCardPanel(props: { ownerId: string }) {
  const t = useT();
  const { bonds } = useNodeState();
  const cards = useAgentCards();
  const card = cards.find((c) => c.ownerId === props.ownerId);
  const bond = bonds.find((b) => b.peerOwnerId === props.ownerId);

  if (!card) {
    return (
      <div className="agent-card-panel agent-card-panel--empty">
        <p className="field-desc">{t("agentCard.empty", "No agent card cached yet.")}</p>
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
