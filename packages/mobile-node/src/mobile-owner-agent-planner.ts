import {
  buildModelProviders,
  evaluateEgressContent,
  evaluateSemanticFirewall,
  routeModelRequest,
} from "@envoymesh/models";
import type { ModelProviderConfig } from "@envoymesh/api";
import { stripModelThinking } from "@envoymesh/api";

/**
 * Call the configured model with an owner-agent planner prompt (Phase 18B mobile parity).
 */
export async function askMobileOwnerAgentPlanner(input: {
  prompt: string;
  modelProviders: ModelProviderConfig;
  requesterPeerId: string;
}): Promise<string | null> {
  if (input.modelProviders.mode === "disabled") {
    return null;
  }

  const firewall = evaluateSemanticFirewall({ text: input.prompt });
  if (!firewall.ok) {
    return JSON.stringify({
      action: "answer",
      text: "I cannot process that request — it failed the semantic safety check. Please rephrase.",
      domain: "knowledge",
    });
  }

  const providers = buildModelProviders(input.modelProviders, true, { trustedLocalAssist: true });
  const modelResult = await routeModelRequest(
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

export function scanMobileOwnerAgentOutbound(text: string): boolean {
  return !evaluateEgressContent({ text }).ok;
}
