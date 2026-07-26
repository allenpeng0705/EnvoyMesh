/**
 * Generate authoring drafts (bio / blog / section / caption / feed) via the model router.
 * Owner-review only — never publishes.
 */
import {
  buildAuthorContentDraftPrompt,
  sanitizeAuthorDraftOutput,
  type DraftAuthorContentParams,
  type DraftAuthorContentResult,
  type ModelProviderConfig,
} from "@envoymesh/api";
import { buildModelProviders } from "@envoymesh/models";
import { createAuditEvent, type LocalTaskStore } from "@envoymesh/local-store";
import { routeModelRequestWithCostTracking } from "./model-cost-tracking.js";

export async function generateAuthorContentDraft(input: {
  params: DraftAuthorContentParams;
  modelProviders: ModelProviderConfig;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent" | "recordModelCallCost">;
  requesterPeerId: string;
}): Promise<DraftAuthorContentResult> {
  const { params, modelProviders, taskStore, requesterPeerId } = input;
  if (modelProviders.mode === "disabled") {
    return { ok: false, reason: "no_model_providers" };
  }
  if (params.mode !== "write" && !params.existingText?.trim()) {
    return { ok: false, reason: "existing_text_required" };
  }

  const providers = buildModelProviders(modelProviders, false, { trustedLocalAssist: true });
  if (providers.length === 0) {
    return { ok: false, reason: "no_model_providers" };
  }

  const prompt = buildAuthorContentDraftPrompt(params);
  const modelResult = await routeModelRequestWithCostTracking(
    {
      taskType: "author.draft",
      prompt,
      sensitivity: "friends",
      requesterPeerId,
      ownerApproved: true,
    },
    providers,
    { taskStore },
  );

  const modelOk = modelResult.decision.action === "allow";
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "model.routed",
      outcome: modelOk ? "allow" : "deny",
      summary: `author.draft ${params.surface}/${params.mode}`,
      remotePeerId: requesterPeerId,
      direction: "local",
      latencyMs: 0,
    }),
  );

  if (!modelOk) {
    return {
      ok: false,
      reason:
        modelResult.decision.action === "deny"
          ? modelResult.decision.reason
          : "model_approval_required",
    };
  }

  const raw = (modelResult.response?.text ?? "").trim();
  if (!raw) {
    return { ok: false, reason: "empty_model_response" };
  }

  const text = sanitizeAuthorDraftOutput(raw);
  if (!text) {
    return { ok: false, reason: "empty_model_response" };
  }

  if (params.surface === "bio" && text.length > 500) {
    return { ok: true, text: text.slice(0, 500).trim() };
  }

  return { ok: true, text };
}
