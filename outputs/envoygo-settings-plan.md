# Plan: EnvoyGo settings for AI model + External Agent

## Scope (what the user asked for)

1. **AI model setting** — the user can configure the model
   provider/mode/endpoint/modelName/apiKey from the mobile app
2. **External Agent setting and selection** — the user can see
   which external agents are authorized, what capabilities they
   have, and revoke them

## Current state (what's already there)

### Protocol (packages/api/src/ws-protocol.d.ts)
- `AiSettings` (line 350) — full AI assistant config: status,
  identity, defaultModeForNewContacts, rules, knowledgeBase,
  documentAutonomy, disclosure, profileMedia
- `ModelProviderConfig` (line 429) — mode/endpoint/modelName/
  apiKey/requireApprovalForCloud
- `ModelProviderMode` (line 428) — mock|ollama|litellm|
  openai-compatible|anthropic-compatible|disabled
- **No `ExternalAgent*` types in the protocol** — the
  `external-agent-gateway.ts` has its own local types but
  they're not on the wire

### Home node (apps/node/src/node-service-impl.ts)
- `getNodeConfig()` (line 4417) — returns full NodeConfig including
  `aiSettings` + `modelProviders`
- `updateNodeConfig(Partial<NodeConfig>)` (line 4458) — accepts a
  partial update; the home node validates and persists
- **No dedicated external-agent RPCs** — only the gateway module
  exists

### Mobile app (apps/envoygo/lib)
- `node_service_client.dart:98` has `getNodeConfig()` (read)
- **No `updateNodeConfig` method yet** — this is a blocker
- `me_screen.dart` has profile + node management; no settings
  screen
- The me screen already has `_SectionHeader` and `Card` widgets
  we can reuse

## What needs to change (in priority order)

### Phase 1 — AI model setting (small, self-contained)
1. **Add `updateNodeConfig` to EnvoyGo's
   `node_service_client.dart`** — 5 lines
2. **Add a settings screen** (`apps/envoygo/lib/screens/settings/
   ai_model_settings_screen.dart`):
   - Dropdown for `mode` (mock / ollama / litellm /
     openai-compatible / anthropic-compatible / disabled)
   - Text field for `endpoint`
   - Text field for `modelName`
   - Password field for `apiKey` (with show/hide toggle)
   - Switch for `requireApprovalForCloud`
   - Save button → calls `updateNodeConfig({modelProviders: ...})`
3. **Wire from the me screen** — add a tile linking to
   `ai_model_settings_screen`
4. **Route** — add `/settings/ai-model` route in `app.dart`

### Phase 2 — External Agent setting (larger, needs protocol work)
1. **Add new protocol types** to `ws-protocol.d.ts`:
   - `ExternalAgentConfig` (id, name, ownerId, capabilities[],
     createdAt, isRevoked)
   - `ListExternalAgentsResult`
   - `RevokeExternalAgentParams` / `Result`
2. **Add new RPCs to home node** (`getExternalAgents`,
   `revokeExternalAgent`) — both are read/write of an in-memory
   map, similar to existing `getXxx` patterns
3. **Add client methods** to `node_service_client.dart`
4. **Add a settings screen** (`external_agents_screen.dart`):
   - List of authorized agents with name + capabilities badges
   - Revoke button per agent
5. **Wire from the me screen**

## Why I'm splitting into phases

Phase 1 (AI model) is purely additive and uses existing protocol
plumbing — the home node already accepts `updateNodeConfig` with
`modelProviders` in the partial. We can ship this without touching
the home node or the protocol.

Phase 2 (External Agent) requires new protocol types + new home
node RPCs + new UI. It's a larger change. Better to do it as a
separate slice so the diff is reviewable.

## What I'm NOT doing in this slice

- AI rules (AiSettings.rules) — large surface, separate feature
- AI identity (AiSettings.identity) — separate feature
- Knowledge base (AiSettings.knowledgeBase) — separate feature
- Document autonomy (AiSettings.documentAutonomy) — separate feature
- aiSettings.modeForNewContacts — defer to later
- Per-contact AI access settings — out of scope

## Risks / unknowns

- Does the mobile app need an `updateNodeConfig` permission
  check? Currently the WS-RPC auth is "any paired device can
  update any config" — that's the existing model. Not adding new
  auth in this slice.
- The `ExternalAgent` type names need to match what the home
  node uses internally. Phase 2's protocol design needs to be
  cross-checked with `external-agent-gateway.ts`.

## Proposed first slice

Just Phase 1 (AI model setting). It's a self-contained, useful
feature that exercises the full mobile→node config path. After
that's shipped and tested, do Phase 2 (External Agent).