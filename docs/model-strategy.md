# Model Strategy

EnvoyMesh is not limited to local models.

The project is owner-controlled and P2P-first, but model execution is flexible. An Envoy may use a local model, a cloud model, another trusted device owned by the same person, or a trusted peer's compute if the owner policy allows it.

## Principle

Data ownership and network control should stay with the owner. Model execution can be selected dynamically.

This means:

- Private data should not be sent to a cloud model unless policy explicitly allows it.
- The owner should be able to configure which model providers are allowed.
- The Envoy should choose models based on task needs, privacy level, cost, latency, and availability.
- Every cloud or peer model call should be auditable.

## Model Types

### Local Model

A local model runs on the same device as the Envoy or on another device owned by the same person.

Use cases:

- Private knowledge queries.
- Sensitive summarization.
- Offline operation.
- Low-cost routine tasks.

Possible tools:

- LiteLLM using an Ollama-backed local model endpoint
- `node-llama-cpp`
- `llama.cpp` process
- Ollama
- LM Studio local server
- Python model worker

### Cloud Model

A cloud model is an external hosted model provider.

Use cases:

- Hard reasoning tasks.
- Coding and planning tasks.
- Tasks where the owner approves sending redacted context.
- Fallback when local models are unavailable or too weak.

The first implementation should treat cloud calls as explicit adapters behind a policy gate. The Brain should not call arbitrary external APIs directly. LiteLLM can be used as the gateway for cloud providers so EnvoyMesh only needs one OpenAI-compatible adapter shape while policy remains inside EnvoyMesh.

### Peer Model

A peer model runs on another trusted Envoy, usually the owner's Primary Envoy or a trusted friend's machine.

Use cases:

- Mobile UI delegates work to the owner's Primary Envoy.
- Trusted friend helps process a permitted task.
- A group shares compute for approved non-sensitive workloads.

Peer model calls require signed requests, clear policy, and audit logs.

## Model Router

The Model Router chooses where a task should run.

Inputs:

- Task type.
- Required capability.
- Data sensitivity.
- Owner policy.
- Peer trust level.
- Estimated cost.
- Expected latency.
- Online/offline state.
- Available local hardware.

Example decision:

```text
private vault query     -> local model only
public coding question  -> local or cloud model
mobile heavy task       -> owner's Primary Envoy
friend task request     -> local model only if document policy allows it
unknown peer request    -> no model call
```

## Policy Model

Each model provider should have a policy record:

```ts
interface ModelProviderPolicy {
  providerId: string;
  providerType: "local" | "cloud" | "peer";
  enabled: boolean;
  allowedSensitivity: Array<"public" | "friends" | "trusted" | "private">;
  allowedTaskTypes: string[];
  requiresOwnerApproval: boolean;
  maxCostPerRequest?: number;
}
```

The default policy should be conservative:

- Local models can process private context.
- Cloud models can process public context only.
- Cloud models require owner approval before receiving friend, trusted, or private context.
- Peer models require both peer trust and resource permission.
- Unknown peers cannot trigger model work.

## Architecture Placement

The Model Router belongs behind the Agent workflow layer.

```text
Agent Workflow
     |
     v
Policy Check
     |
     v
Approved Context
     |
     v
Model Router
  |     |     |
Local Cloud Peer
```

The network-facing Diplomat should not call models directly. Vault retrieval and redaction should happen before model routing when remote data exposure is possible.

## Audit Requirements

Every non-local model call should record:

- Provider.
- Model name.
- Task type.
- Peer that triggered the request, if any.
- Data sensitivity.
- Whether redaction was applied.
- Whether owner approval was required.
- Cost estimate when available.
- Result status.

Local model calls that use private vault data should also be auditable, but they do not need the same external disclosure tracking.

## First Version

Version 0.1 should implement the interface before adding many providers:

1. Define model task and provider interfaces.
2. Add a mock local provider.
3. Add policy checks for model selection.
4. Log model routing decisions.
5. Add a LiteLLM-compatible provider adapter.
6. Use Ollama through LiteLLM as the first local model path.
7. Add direct local adapters only when they provide a clear benefit.
8. Add cloud providers through LiteLLM only after redaction and approval flows are stable.
