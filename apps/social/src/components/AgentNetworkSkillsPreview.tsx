import type { CachedAgentCardSummary } from "@envoymesh/api";
import { agentNetworkSkillIds } from "@envoymesh/protocol";
import { useT } from "../context/I18nContext.js";
import { AgentCapabilitiesPreview } from "./AgentCapabilitiesPreview.js";

/** Agent Network skills chips for Team worker rows (not membership tags). */
export function AgentNetworkSkillsPreview(props: {
  card?: CachedAgentCardSummary;
  compact?: boolean;
}) {
  const t = useT();
  const skills = agentNetworkSkillIds(props.card?.agentNetworkProfile?.skills);
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
