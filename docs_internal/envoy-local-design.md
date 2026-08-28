# Envoy Local — downloadable llama.cpp engine (design)

**Status:** 54A–54E implemented (auto download + sidecar + catalog/params + hardening)  
**Related:** [implementation-plan.md](./implementation-plan.md) Phase 54 · [run-local-model.md](./run-local-model.md) (Ollama BYO)

## 1. Goals

- Let EnvoyAI (OpenClaw), native brain, and **Pi (inherit)** run without a cloud API key by using a local OpenAI-compatible server.
- **Never package** `llama-server`, CUDA/cudart, or any GGUF in the EnvoyMesh / Tauri installer or `resources/`.
- Download runtime + models **after** EnvoyMesh is installed, into app data.
- **Cloud-only remains first-class** — users may skip Envoy Local and configure a cloud provider (or BYO Ollama) with no local download.

## 2. Non-goals (v1)

- Bundling llama.cpp or GGUFs “for convenience”
- vLLM
- Installing NVIDIA drivers / CUDA toolkit
- Auto-rewiring HomeClaw / Hermes / OpenHuman (they keep their own LLMs)
- EnvoyGo on-device inference

## 3. Product flows

### 3.1 Configure AI (no usable model)

When `hasUsableModelProvider(modelProviders)` is false, EnvoyAI shows a guide with **equal** choices:

1. **Cloud API** → Settings → AI presets (MiniMax, OpenAI, …)
2. **Ollama** → BYO local (existing preset)
3. **Envoy Local** → optional post-install download workflow

Skipping (1)/(2)/(3) leaves EnvoyAI unable to answer until configured.

### 3.2 Automatic Envoy Local enable

On “Use Envoy Local” / Settings enable / consent dialog confirm:

1. Detect OS / arch / accelerator
2. Download matching `llama-server` (+ Windows cudart if CUDA) into `{appData}/envoy-local/runtime/…`
3. Download one **default** instruct GGUF into `{appData}/envoy-local/models/`
4. Start `llama-server` on `127.0.0.1:18790` (OpenAI `/v1`)
5. Set `modelProviders` to `presetId: "envoy-local"`, `mode: "openai-compatible"`
6. Reload OpenClaw so EnvoyAI (+ Pi inherit) use the endpoint

Progress UI: engine → model → starting. Cancelable; checksum + disk gates.

**Boot / first-run consent:** The node **never** silently downloads on restart. When there is no usable cloud/Ollama provider and runtime or the recommended GGUF is missing, `getEnvoyLocalStatus().suggestAutoProvision` is true and Social shows a confirm dialog (“download llama.cpp + one local model”), retrying briefly if the node RPC is not ready yet. **Download & enable** → `enableEnvoyLocal`; **Not now** → `declineEnvoyLocalAutoProvision` (persists `envoyLocal.autoProvisionDeclined`). Boot starts the sidecar **only** when `envoyLocal.enabled === true` and assets are already on disk. Settings → Disable is durable across restarts. If cloud/Ollama is the active provider, boot never starts (and clears a stale `enabled` flag).

**Cloud / Ollama / AI-off takes over:** Saving `modelProviders` that is not usable Envoy Local (cloud, Ollama, or disabled/mock) automatically stops `llama-server` and sets `envoyLocal.enabled: false`. Manual Envoy Local disable also clears a stale `envoy-local` `modelProviders` entry so chat does not keep targeting a dead `:18790` endpoint. Switching back to Envoy Local is explicit via Settings or the consent dialog.

### 3.3 Guided “do more”

After automatic path works: search/list/download more GGUFs, set active model, tune server params, update engine, or switch back to cloud/Ollama.

## 4. Consumers

| Consumer | Uses Envoy Local via `modelProviders`? |
|----------|----------------------------------------|
| EnvoyAI / OpenClaw | Yes |
| Native knowledge / chat assist | Yes |
| Pi (no `modelOverride`) | Yes (inherit) |
| HomeClaw / Hermes / OpenHuman | No |

## 5. Port and provider

- Port base **18790** (`ENVOY_LOCAL_PORT` / `ENVOYMESH_PORT_OFFSET`) — not 11434 (Ollama).
- Bind loopback only.
- Preset `envoy-local`: `mode: "openai-compatible"`, default endpoint `http://127.0.0.1:18790/v1`, API key optional.

## 6. Runtime matrix

Resolve assets from a pinned EnvoyMesh manifest (sha256) pointing at [ggml-org/llama.cpp releases](https://github.com/ggml-org/llama.cpp/releases):

| Platform | Preferred | Fallback |
|----------|-----------|----------|
| macOS | Metal build | CPU |
| Windows x64 | CUDA (+ cudart zip) if NVIDIA | CPU (Vulkan later) |
| Linux x64 | CUDA if NVIDIA | CPU |

CUDA start failure → one automatic CPU fallback + Settings note.

### 6.1 Runtime download mirrors (China)

Canonical bytes still come from the pinned GitHub Release asset (sha256 fail-closed). Download **URL** order:

| Region | Order |
|--------|--------|
| **China** | Optional operator CDN (`ENVOYMESH_ENVOY_LOCAL_RUNTIME_MIRROR_BASE`) → ghproxy-style wrappers (`ghfast.top`, `ghproxy.net`, …) → direct `github.com` last |
| **Global** | Optional CDN → direct GitHub |

Overrides: `ENVOYMESH_ENVOY_LOCAL_RUNTIME_URL` (full archive URL), `ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION=cn|global` (also `MODEL_REGION` alias). Prefer hosting identical files on an EnvoyMesh CDN when proxies are flaky.

## 7. Models

- First-enable default is **hardware-recommended** from RAM/GPU (Metal unified / CUDA VRAM / CPU): typically **Qwen3.5 4B** or **2B** (CPU-friendly), **9B** on large GPU/unified; tiny **0.8B** only when tight. Size-matched **Gemma 4 E2B/E4B** are marked also-fits (`--chat-template gemma`). **Qwen3.6 / larger** via Hugging Face search.
- Curated families: **Qwen3.5** (0.8B / 2B / 4B / 9B), **Gemma 4** (E2B / E4B), **Llama 3.2** 3B dense (explicitly not Llama 4 MoE).
- **Search:** empty query → curated allowlist only. Non-empty → curated matches **plus** live Hugging Face Hub GGUF search (`filter=gguf`). Download ids: curated slug or `hf:{owner}/{repo}/{file.gguf}`.
- Install list; set active; delete. Index: `{appData}/envoy-local/models.json` (optional `chatTemplate` per install).
- **Download mirrors (region-aware)** — same region detector for models + runtime (`ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION` / `MODEL_REGION`, or `zh_CN` / `Asia/Shanghai`):
  - **Models (China):** **ModelScope** when listed → **hf-mirror.com** (no `huggingface.co` first hop). Hub **API** also uses `hf-mirror.com/api` in China.
  - **Models (elsewhere):** Hugging Face resolve URLs.
  - **Runtime:** see §6.1 (GitHub proxies / CDN; never skip sha256).
  - Fail over across the candidate list on network/HTTP errors. Soft-fail Hub search (curated still shown).

### 7.1 Keeping the curated catalog fresh (not via relay)

**Do not put model catalogs on the relay.** Relays stay lean (connectivity / rendezvous only); they must not become a content CDN or LLM registry.

Recommended maintenance model:

| Layer | Role | Update cadence |
|-------|------|----------------|
| **In-repo curated allowlist** (`envoy-local-catalog.ts`) | Tiny, reviewed edge defaults (Qwen / Gemma / Llama tiers) + hardware recommendation map | Ship with EnvoyMesh releases; keep small |
| **Remote catalog JSON** (future) | Versioned file on GitHub Releases or an EnvoyMesh CDN (`catalog.json` + sha256), fetched by the **home node** | Days–weeks; offline → use embedded fallback |
| **Hugging Face search** (already) | Long-tail / newer GGUFs when the user searches | Live |
| **Installed-model update hint** (future) | Compare installed file/family to curated+remote “current” slug; Settings badge “newer GGUF available” | On Settings open / daily |

User-visible “higher version” should mean: **same family + better release** (e.g. Qwen3.5 → Qwen3.6 Q4_K_M), not arbitrary Hub noise. Prefer explicit `supersedes: ["qwen3.5-4b-q4_k_m"]` in the catalog entry over free-form version strings. Installed models with a successor show an “Update available” affordance in Settings (download is opt-in).

#### Curated catalog review checklist

1. Check new **edge** instruct GGUFs (Qwen / Gemma / Llama dense) monthly or before a release — skip MoE / 27B+ for the allowlist (HF search covers those).
2. Prefer one quant (`Q4_K_M`) per size class; set `family`, `sizeClass`, `quant` on every curated row.
3. When promoting a successor, add the entry with `supersedes: ["prior-id"]` and update `ENVOY_LOCAL_MODEL_TIER_IDS` if the primary hardware pick changes.
4. Smoke: empty search shows curated only; first-enable still downloads the hardware-recommended tier; Settings shows “Update available” on superseded installs.
5. **Never** put the catalog on a relay.

## 8. Server parameters

Persisted `envoyLocal.serverParams` with sensible defaults (ctx, ngl Auto/Off/Custom, threads, …). Process-affecting changes restart the sidecar. Simple + Advanced UI; Reset to defaults.

## 9. Sidecar lifecycle

Mirror OpenClaw patterns: lazy start, `/v1/models` health, watchdog, SIGTERM/KILL, stop on home-node shutdown. Status RPC for Settings UI.

## 10. JSON-RPC (sketch)

- `envoyLocal.getStatus` / `enable` / `disable` / `restart`
- `envoyLocal.listInstalledModels` / `searchModels` / `downloadModel` / `setActiveModel` / `deleteModel`
- `envoyLocal.updateServerParams` / `resetServerParams`
- Progress events: `envoyLocal:download`

## 11. Implementation slices (Phase 54)

| Slice | Scope |
|-------|--------|
| **54A** | `hasUsableModelProvider` + Configure AI UX (cloud / Ollama / Envoy Local choices) |
| **54B** | Design lock + preset/port/types scaffold |
| **54C** | Runtime download + sidecar + wire `modelProviders` (auto workflow) |
| **54D** | Model catalog + params UI |
| **54E** | Tests + Settings polish + OpenClaw reload |

## 12. Security / ops

- Checksums fail closed; no remote Admin on llama port.
- Disk space warning before large downloads.
- Manifest channel must be HTTPS; prefer EnvoyMesh-pinned releases over floating “latest” alone.
