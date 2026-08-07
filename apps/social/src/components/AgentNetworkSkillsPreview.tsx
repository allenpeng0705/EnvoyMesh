import type { CachedAgentCardSummary } from "@envoymesh/api";
import { agentNetworkDomainSkillIds } from "@envoymesh/protocol";
import { useT } from "../context/I18nContext.js";
import { AgentCapabilitiesPreview } from "./AgentCapabilitiesPreview.js";

/**
 * Owner domain skill chips for Team worker rows.
 * OpenClaw Agent Skills stay on the card for ranking but are not shown here.
 */
export function AgentNetworkSkillsPreview(props: {
  card?: CachedAgentCardSummary;
  compact?: boolean;
}) {
  const t = useT();
  const skills = agentNetworkDomainSkillIds(props.card?.agentNetworkProfile?.skills);
  if (skills.length === 0) return null;

  return (
    <div className="chain-worker-card__caps-row">
      <AgentCapabilitiesPreview
        tags={skills}
        compact={props.compact ?? true}
        title={t("settings.agentNetwork.membership.skills", "Skills")}
        labelFor={(tag) => t(`settings.agentNetwork.membership.skill_${tag}`, tag)}
      />
    </div>
  );
}
