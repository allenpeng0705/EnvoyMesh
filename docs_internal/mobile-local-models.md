# Local LLM URLs (desktop / advanced)

EnvoyMesh talks to OpenAI-compatible backends via **`POST ${endpoint}/chat/completions`**. The base URL should normally include **`/v1`** (e.g. Ollama `http://127.0.0.1:11434/v1`, LiteLLM `http://127.0.0.1:4000/v1`). **`@envoymesh/models`** can append `/v1` when it’s missing for those modes.

**Anthropic-compatible** uses the API host **without** `/v1` (e.g. `https://api.anthropic.com`).

---

## Mobile app (Capacitor)

The **mobile shell only supports cloud APIs in Settings** — OpenAI-compatible and Anthropic — plus mock/disabled. Ollama and LiteLLM are **not** offered there for now; use a **desktop node** for local engines.

Stored preferences that previously used **Ollama** or **LiteLLM** on mobile are **migrated to mock** on load, and trying to set those modes via `updateNodeConfig` throws a clear error.

Typical cloud setup uses **HTTPS**, so no special ATS / cleartext tuning is required on iOS/Android for production API endpoints.

---

## Desktop: LAN HTTP and ATS/cleartext (reference)

If you run a **custom HTTP** gateway on your LAN from a **desktop** WebView or tooling (not the current mobile product focus), you may need:

- **iOS**: `NSAppTransportSecurity` / local-network allowances for non-HTTPS origins.
- **Android**: cleartext or a `network_security_config` scoped to trusted hosts.

---

## Optional future: home-node HTTP proxy

The desktop node exposes JSON-RPC over **WebSocket**, not a generic Chat Completions proxy. A future improvement is an authenticated **`POST /v1/chat/completions`** hop on the home node so phones use one HTTPS-capable endpoint instead of raw LAN HTTP to Ollama.
