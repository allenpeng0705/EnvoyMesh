import {
  buildModelProviders,
  evaluateSemanticFirewall,
  evaluateEgressContent,
  routeModelRequest,
} from "@envoymesh/models";
import { loadAgentIdentitySection } from "./agent-identity-context.js";
import type { AgentIdentityStore, LocalTaskStore } from "@envoymesh/local-store";
import type { ModelProviderConfig } from "@envoymesh/api";
import { stripModelThinking } from "@envoymesh/api";
import { routeModelRequestWithCostTracking } from "./model-cost-tracking.js";

/**
 * Call the configured model with an owner-agent planner prompt (Phase 18B).
 * Returns null when the model provider is disabled or routing denies the request.
 */
export async function askOwnerAgentPlanner(input: {
  prompt: string;
  modelProviders: ModelProviderConfig;
  requesterPeerId: string;
  agentIdentityStore?: AgentIdentityStore | null;
  /** When provided, per-call cost is rolled up for the dashboard. */
  taskStore?: Pick<LocalTaskStore, "recordModelCallCost">;
}): Promise<string | null> {
  if (input.modelProviders.mode === "disabled") {
    return null;
  }

  const identitySection = await loadAgentIdentitySection(input.agentIdentityStore);
  const prompt =
    identitySection && !input.prompt.includes("## Agent identity")
      ? `${input.prompt}${identitySection}`
      : input.prompt;

  const firewall = evaluateSemanticFirewall({ text: prompt });
  if (!firewall.ok) {
    return JSON.stringify({
      action: "answer",
      text: "I cannot process that request — it failed the semantic safety check. Please rephrase.",
      domain: "knowledge",
    });
  }

  const providers = buildModelProviders(input.modelProviders, true, { trustedLocalAssist: true });
  const modelResult = input.taskStore
    ? await routeModelRequestWithCostTracking(
        {
          taskType: "owner.agent.planner",
          prompt: firewall.text,
          sensitivity: "friends",
          ownerApproved: true,
          requesterPeerId: input.requesterPeerId,
        },
        providers,
        { taskStore: input.taskStore },
      )
    : await routeModelRequest(
        {
          taskType: "owner.agent.planner",
          prompt: firewall.text,
          sensitivity: "friends",
          ownerApproved: true,
          requesterPeerId: input.requesterPeerId,
        },
        providers,
      );

  if (modelResult.decision.action !== "allow" || !modelResult.response?.text) {
    return null;
  }

  return stripModelThinking(modelResult.response.text);
}

export function scanOwnerAgentOutbound(text: string): boolean {
  return !evaluateEgressContent({ text }).ok;
}
