/**
 * Cost-aware wrapper around `routeModelRequest`.
 *
 * Each inbound AI path in `apps/node` (knowledge-query, chat-draft, terminal
 * assist, chain orchestration, owner planner) calls `routeModelRequest` and
 * then writes its own `model.routed` audit event. Rather than instrumenting
 * every call site, this helper:
 *
 *   1. Calls the underlying `routeModelRequest`.
 *   2. If the resolved audit event carries `actualUsage`, merges that call's
 *      cost into the daily cost rollup (non-blocking — errors are logged and
 *      swallowed so cost tracking can never break the AI path).
 *   3. Returns the original result unchanged.
 *
 * Callers swap `routeModelRequest(req, providers)` for
 * `routeModelRequestWithCostTracking(req, providers, { taskStore })`.
 */
import { routeModelRequest, type ModelProvider, type ModelRequest, type ModelRouterResult } from "@envoymesh/models";
import type { LocalTaskStore } from "@envoymesh/local-store";

export interface CostTrackingDeps {
  /**
   * The local task store. Only the `recordModelCallCost` method is required;
   * callers may pass a narrower pick to avoid coupling.
   */
  taskStore: Pick<LocalTaskStore, "recordModelCallCost">;
}

export async function routeModelRequestWithCostTracking(
  request: ModelRequest,
  providers: readonly ModelProvider[],
  deps: CostTrackingDeps,
): Promise<ModelRouterResult> {
  const result = await routeModelRequest(request, providers);
  const usage = result.auditEvent.actualUsage;
  if (
    usage &&
    result.auditEvent.providerId &&
    result.auditEvent.modelName &&
    result.auditEvent.taskType
  ) {
    // Non-blocking: never let cost tracking break the AI path.
    void deps.taskStore
      .recordModelCallCost({
        createdAt: result.auditEvent.createdAt,
        providerId: result.auditEvent.providerId,
        modelName: result.auditEvent.modelName,
        taskType: result.auditEvent.taskType,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd,
      })
      .catch((err) => {
        console.warn("[cost-tracking] recordModelCallCost failed:", err);
      });
  }
  return result;
}
