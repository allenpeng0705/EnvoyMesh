/**
 * Shared "run the node's effective model on a prompt/messages" seam (spike-01).
 *
 * Every in-process AI path hand-assembles a prompt, builds providers with
 * `buildModelProviders(config, ownerApproved, {trustedLocalAssist, modelNameOverride})`
 * and routes a `ModelRequest` — with subtly different flags per caller. This
 * helper collapses that build+route step so new callers (e.g. a future
 * `askHomeModel` RPC) reuse one code path instead of copying a variant.
 *
 * Migration note (EM-1 landed): `messages` are forwarded verbatim to the
 * router — `ModelRequest` and all providers now accept native chat messages —
 * so unlike the original spike text they are NOT normalized into the prompt.
 *
 * Callers keep their own audit writes / chat persistence / text post-processing;
 * this helper only covers provider construction + routing (+ optional cost rollup).
 */
import {
  buildModelProviders,
  routeModelRequest,
  type ModelProvider,
  type ModelRequest,
  type ModelRouteDecision,
  type ModelRoutingAuditEvent,
} from "@envoymesh/models";
import { routeModelRequestWithCostTracking } from "./model-cost-tracking.js";
import type { ModelProviderConfig } from "@envoymesh/api";
import type { Sensitivity } from "@envoymesh/protocol";
import type { LocalTaskStore } from "@envoymesh/local-store";

export type ModelCallMessage = NonNullable<ModelRequest["messages"]>[number];

export interface RunModelCallOpts {
  /** Effective provider config — pass `getEffectiveModelProviders()` result or `cfg.modelProviders`. */
  config: ModelProviderConfig;
  taskType: string;
  /** Single-shot prompt text. Ignored by chat-capable providers when `messages` is present. */
  prompt?: string;
  /** Multi-turn chat turns (EM-1). Forwarded verbatim to `ModelRequest`. */
  messages?: ModelCallMessage[];
  sensitivity: Sensitivity;
  /** Must mirror the caller's flag — also relaxes cloud provider policy via `buildModelProviders`. */
  ownerApproved: boolean;
  requesterPeerId?: string;
  /** → `buildModelProviders` options.modelNameOverride (terminal-assist pattern). */
  modelHint?: string;
  /** Chat-draft / author / chain paths pass `true`. */
  trustedLocalAssist?: boolean;
  /** Present ⇒ cost-tracked route (rolls actual usage into the daily rollup). */
  taskStore?: Pick<LocalTaskStore, "recordModelCallCost">;
}

export interface RunModelCallResult {
  text: string | undefined;
  model: string | undefined;
  providerId: string | undefined;
  decision: ModelRouteDecision;
  auditEvent: ModelRoutingAuditEvent;
}

export async function runModelCall(opts: RunModelCallOpts): Promise<RunModelCallResult> {
  const providers: readonly ModelProvider[] = buildModelProviders(opts.config, opts.ownerApproved, {
    trustedLocalAssist: opts.trustedLocalAssist,
    modelNameOverride: opts.modelHint,
  });

  const request: ModelRequest = {
    taskType: opts.taskType,
    prompt: opts.prompt ?? "",
    ...(opts.messages && opts.messages.length > 0 ? { messages: opts.messages } : {}),
    sensitivity: opts.sensitivity,
    ownerApproved: opts.ownerApproved,
    requesterPeerId: opts.requesterPeerId,
  };

  const result = opts.taskStore
    ? await routeModelRequestWithCostTracking(request, providers, { taskStore: opts.taskStore })
    : await routeModelRequest(request, providers);

  return {
    text: result.response?.text,
    model: result.response?.modelName,
    providerId:
      result.response?.providerId ??
      ("provider" in result.decision ? result.decision.provider.providerId : undefined),
    decision: result.decision,
    auditEvent: result.auditEvent,
  };
}
