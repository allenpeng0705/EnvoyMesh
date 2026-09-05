/**
 * Pure helpers for the thin-client `askHomeModel` RPC (EM-3;
 * docs/envoy-home-side-plan.md §1.2 + docs/thin-client-protocol-v0.3-draft.md §2.1).
 *
 * Kept outside node-service-impl so the decision → catalog-token error mapping
 * and the providerId → providerMode derivation stay unit-testable without
 * constructing a full NodeServiceImpl.
 */
import type { ModelRouteDecision } from "@envoymesh/models";
import type { HomeModelProviderMode } from "@envoymesh/api";

/**
 * Best-effort provider-mode label derived from the answering provider's
 * `providerId` (built by `buildModelProviders` in @envoymesh/models), using the
 * canonical API union (`@envoymesh/api` `HomeModelProviderMode`):
 *   - `local.envoy-local`        → "envoy-local"
 *   - `local.ollama.<model>`     → "ollama"
 *   - `cloud.openai-compatible`  → "openai-compatible"
 *   - `cloud.*` (litellm/anthropic-compatible/…) → "cloud"
 *   - `*.mock` (local/cloud/peer) → "mock"
 * Anything unrecognized → undefined (never a fabricated label).
 */
export function deriveHomeModelProviderMode(
  providerId: string | undefined,
): HomeModelProviderMode | undefined {
  if (!providerId) return undefined
  if (providerId.includes("envoy-local")) return "envoy-local"
  if (providerId.includes("ollama")) return "ollama"
  if (providerId.includes("openai-compatible")) return "openai-compatible"
  if (providerId.includes(".mock")) return "mock"
  if (providerId.startsWith("cloud.")) return "cloud"
  return undefined
}

/**
 * Map a non-allow routing decision onto a catalog-token Error whose message
 * starts with the stable token (thin-client error catalog, v0.3 §2.1):
 *   - `approval_required`       → `cloud-approval-needed: …`
 *   - `semantic_firewall: …`    → `semantic-firewall: …`
 *   - `semantic_firewall: prompt exceeds max length (…)` → `prompt-too-large: …`
 *
 * Returns `undefined` when the caller should keep going (allow, or an ordinary
 * deny the handler reports as `model-not-configured`).
 */
export function homeModelRoutingError(decision: ModelRouteDecision): Error | undefined {
  if (decision.action === "approval_required") {
    return new Error(`cloud-approval-needed: ${decision.reason}`)
  }
  if (decision.action === "deny" && decision.reason.includes("semantic_firewall:")) {
    const detail = decision.reason.slice(decision.reason.indexOf(":") + 1).trim()
    if (detail.includes("exceeds max length")) {
      return new Error(`prompt-too-large: ${detail}`)
    }
    return new Error(`semantic-firewall: ${detail}`)
  }
  return undefined
}
