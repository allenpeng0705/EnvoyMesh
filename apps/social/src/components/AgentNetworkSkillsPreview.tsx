import type { CachedAgentCardSummary } from "@envoymesh/api";
import { agentNetworkDomainSkillIds, agentNetworkPrimaryRole } from "@envoymesh/protocol";
import { useT } from "../context/I18nContext.js";
import { AgentCapabilitiesPreview } from "./AgentCapabilitiesPreview.js";

/**
 * Primary collaboration role + owner domain skill chips for Team worker rows.
 * OpenClaw Agent Skills stay on the card for ranking but are not shown here.
 */
export function AgentNetworkSkillsPreview(props: {
  card?: CachedAgentCardSummary;
  compact?: boolean;
}) {
  const t = useT();
  const skills = agentNetworkDomainSkillIds(props.card?.agentNetworkProfile?.skills);
  const primaryRole = agentNetworkPrimaryRole(props.card?.agentNetworkProfile?.roles);
  if (skills.length === 0 && !primaryRole) return null;

  return (
    <div className="chain-worker-card__caps-row">
      {primaryRole ? (
        <span
          className="chain-worker-card__role"
          data-testid="chain-worker-role"
          title={t("settings.agentNetwork.membership.primaryRole", "Collaboration role")}
        >
          {t(`settings.agentNetwork.membership.role_${primaryRole}`, primaryRole)}
        </span>
      ) : null}
      {skills.length > 0 ? (
        <AgentCapabilitiesPreview
          tags={skills}
          compact={props.compact ?? true}
          title={t("settings.agentNetwork.membership.skills", "Skills")}
          labelFor={(tag) => t(`settings.agentNetwork.membership.skill_${tag}`, tag)}
        />
      ) : null}
    </div>
  );
}
