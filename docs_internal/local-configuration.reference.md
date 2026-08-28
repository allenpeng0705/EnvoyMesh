# Local configuration reference

**Single guide for every user-editable config file that is not committed to git.**

EnvoyMesh keeps secrets, keys, and runtime state under your profile directory and vault. Git tracks **reference templates** only; you copy them locally and edit the copies.

| Committed template | Copy to (gitignored) |
|--------------------|----------------------|
| [apps/node/data/default/node-config.example.jsonc](../apps/node/data/default/node-config.example.jsonc) | `{profileDir}/node-config.json` |
| [apps/node/data/default/agent-identity.example.md](../apps/node/data/default/agent-identity.example.md) | `{profileDir}/agent-identity.md` |
| [envoymesh.node.example.yaml](../envoymesh.node.example.yaml) | e.g. `./envoymesh.node.yaml` (any path you pass to `--config`) |
| [bootstrap-presets.example.yaml](../bootstrap-presets.example.yaml) | e.g. `./bootstrap-presets.yaml` |
| [.env.example](../.env.example) | `.env` (repo root or shell profile) |

**Default profile directory:** `./data/default` relative to `apps/node` when you run `npm run node:dev`, unless overridden by `--profile`, YAML `profile`, or `ENVOYMESH_PROFILE`.

### First-time setup (from repo root)

```bash
cp apps/node/data/default/node-config.example.jsonc apps/node/data/default/node-config.json
cp apps/node/data/default/agent-identity.example.md apps/node/data/default/agent-identity.md
cp .env.example .env   # optional — overrides for API keys and WAN bootstrap
```

Edit `node-config.json` (API keys, discovery, AI). Restart the node after changes. The Social Settings UI can also save config; it writes plain JSON and **strips comments**.

### Configuration precedence (highest wins last)

```
built-in defaults  <  node-config.json  <  YAML (--config)  <  environment variables  <  CLI flags
```

YAML (`--config`) affects **startup / discovery / listen** only. AI, autonomy, and most product settings live in `node-config.json` or Settings.

---

## 1. `node-config.json`

**Path:** `{profileDir}/node-config.json`  
**Format:** JSON (JSONC comments allowed on **load** via the example template; Settings save strips them)  
**Full commented template:** [node-config.example.jsonc](../apps/node/data/default/node-config.example.jsonc)

| Field | Type | Description |
|-------|------|-------------|
| `version` | `"0.1"` | Schema version. Required. |
| `profileDir` | string | Profile root (this file, keys, chat logs, RAG DB). Default `./data/default`. |
| `discoveryProfile` | string | `lan-fast` \| `wan-default` \| `relay-only` \| `contacts-only` |
| `enableMdns` | boolean? | Local mDNS discovery. Default `true`. |
| `relayEnabled` | boolean | Client: dial via circuit relay when direct path fails. |
| `relayServerEnabled` | boolean | Server: act as relay for others. Usually `false` on desktop. |
| `advertiseAddrs` | string[] | Reachable libp2p bases for relay.lookup (public IP/DNS). Required for WAN/cloud relay servers. |
| `bootstrapPeers` | string[] | Explicit bootstrap multiaddrs (`/ip4/.../tcp/.../p2p/...`). |
| `bootstrapPresets` | string[] | Named preset bundles, e.g. `public-libp2p`, `cn-relay`, `public-libp2p-am6`. |
| `configuredRelays` | object[] | Custom relays: `{ relayId, addr, enabled, level?, region? }`. |
| `modelProviders.mode` | string | `mock` \| `ollama` \| `litellm` \| `openai-compatible` \| `anthropic-compatible` \| `disabled` |
| `modelProviders.endpoint` | string? | Chat API base URL (OpenAI-shaped: include `/v1`). |
| `modelProviders.modelName` | string? | Chat model id. |
| `modelProviders.apiKey` | string? | Provider API key. Prefer `.env` in production. |
| `modelProviders.requireApprovalForCloud` | boolean? | Require owner approval per cloud call. Default `true`. |
| `chatAssistEnabled` | boolean | Master toggle for inbound chat draft generation. |
| `anonymousDiscoveryMode` | string? | `off` \| `contacts-only` \| `public-preview` \| `public-auto-answer` |
| `anonymousIntentAllowlist` | string[]? | EMP intents strangers may send. Default `["discovery.request"]`. |
| `anonymousSensitivityCeiling` | string? | `public` \| `friends` — max vault sensitivity for anonymous auto-answer. |
| `autonomousKillSwitch` | boolean? | `true` blocks all autonomous autoAnswer / autoSendChat. |
| `autonomousPolicies` | object[] | Per-domain: `{ domain, maxSensitivity, autoAnswer, autoSendChat }`. Domains: `social`, `knowledge`, `home`, `research`. |
| `contactAiPreferences` | object[] | Per contact: `{ peerOwnerId, aiAccessLevel, knowledgeAccess, priority, syndicationMaxSensitivity? }`. |
| `aiSettings.status.onlineAssistantEnabled` | boolean | Suggest drafts when online. |
| `aiSettings.status.offlineAgentEnabled` | boolean | Allow auto-reply when away. |
| `aiSettings.status.statusMode` | string | `automatic` \| `manual` |
| `aiSettings.status.isOnlineManual` | boolean? | When `statusMode` is `manual`. |
| `aiSettings.identity.mode` | string | `invisible` \| `transparent` \| `defensive` |
| `aiSettings.identity.transparentPrefix` | string? | Prefix for transparent/defensive modes. |
| `aiSettings.defaultModeForNewContacts` | string | `manual` \| `assistant` \| `auto` |
| `aiSettings.rules` | object[] | Trigger/action rules (Settings → AI). |
| `aiSettings.documentAutonomy` | object | File share/publish tiers for document agent. See example jsonc. |
| `aiSettings.knowledgeBase` | object | RAG: `enabled`, `ragMode`, limits, vault paths, `embedding`, optional MCP. See [knowledge-base-and-rag.md](./knowledge-base-and-rag.md). |
| `externalPublish.allowIpfs` | boolean | Gate library export to IPFS. Default `false`. |
| `externalPublish.gatewayAllowlist` | string[]? | Allowed HTTP gateway hosts for fetch helpers. |
| `externalPublish.ipfsExportEngine` | string? | `kubo` \| `helia` \| `kubo-with-helia-shadow` |
| `externalPublish.pinningEnabled` | boolean? | Enable pin-to-provider after export. |
| `externalPublish.pinningProvider` | string? | e.g. `pinata` (needs env JWT). |
| `trustModeEnabled` | boolean? | Agent-assisted intros (`social.intro.*`). |
| `friendMatchingPreferencesText` | string? | Owner brief for friend-matching agent (max ~4096 chars). |
| `friendAutopilotEnabled` | boolean? | Scheduled Trust-mode intro discovery (requires `trustModeEnabled`). |
| `friendAutopilotIntervalHours` | number? | Hours between autopilot passes; `0` = manual only. |
| `knowledgeSyndicationMaxSensitivity` | string? | Cap vault bytes returned to peers on inbound `knowledge.query`. |
| `relayPublicWsUrl` | string? | Public `ws://…/ws` for mobile pairing QR via relay bridge. |
| `bridgeEnabled` | boolean? | Enable external agent bridge on next start. |
| `homeClawCoreBaseUrl` | string? | HomeClaw Core LAN URL for `homeclawCoreProxy`. |
| `companionPairingAutoAcceptWithToken` | boolean? | Auto-accept mobile pair when token matches latest QR. |
| `trustAnchorPublicKeys` | object? | Map `anchorId` → PEM public key for credential verification. |
| `maxConnections` | number? | libp2p client connection cap. |
| `mdnsIntervalMs` | number? | mDNS poll interval. |
| `capabilityDiscoveryIntervalMs` | number? | Background DHT capability cycle. |
| `lazyCapabilityDiscovery` | boolean? | Skip periodic DHT find; Search triggers on demand. |
| `idleTimerStretch` | boolean? | Stretch WAN timers when idle. |
| `agentVisibility` | object? | Per-domain Activity notify loudness (Phase 13E). |
| `a2aChatNotifications` | string? | Local chat lines on A2A milestones: `off` \| `brief` \| … |
| `agentInteractionMode` | string? | Prefer structured A2A vs free-form agent chat. |
| `updatedAt` | string | ISO timestamp; rewritten on Settings save. |

---

## 2. `agent-identity.md`

**Path:** `{profileDir}/agent-identity.md`  
**Template:** [agent-identity.example.md](../apps/node/data/default/agent-identity.example.md)

Private markdown injected into **every** AI prompt (chat drafts, Envoy AI, knowledge queries). **Not** indexed for RAG — do not put this file in the vault knowledge folders.

| Constraint | Value |
|------------|-------|
| Max size | 12,000 characters (truncated if longer) |
| File mode | `0600` (owner read/write) |
| Also editable | Settings → AI → Agent identity |

Suggested sections: **Role**, **Tone & style**, **Boundaries**, **Capabilities**.

---

## 3. `envoymesh.node.yaml` (optional startup config)

**Path:** any file passed to `npm run node:dev -- --config ./envoymesh.node.yaml`  
**Template:** [envoymesh.node.example.yaml](../envoymesh.node.example.yaml)

| Field | Type | Description |
|-------|------|-------------|
| `profile` | string | Profile directory (same as `--profile` / `ENVOYMESH_PROFILE`). |
| `listen` | string[] | libp2p listen multiaddrs. Default `/ip4/0.0.0.0/tcp/0`. |
| `discovery.profile` | string | `lan-fast` \| `wan-default` \| `relay-only` \| `contacts-only` |
| `discovery.connectivityStrict` | boolean? | Fail startup if wan-default bootstrap probes all fail. Env: `ENVOYMESH_CONNECTIVITY_STRICT=1`. |
| `discovery.mdns` | boolean? | mDNS on LAN. |
| `discovery.dht` | boolean? | Kademlia DHT. |
| `discovery.dhtClientMode` | boolean? | DHT client-only mode. |
| `discovery.relay` | boolean? | Circuit relay transport (client). |
| `discovery.relayServer` | boolean? | This node is a relay server. |
| `discovery.autonat` | boolean? | AutoNAT service. |
| `discovery.dcutr` | boolean? | DCUtR hole punching. |
| `discovery.quic` | boolean? | QUIC alongside TCP. Env: `ENVOYMESH_QUIC=1`. |
| `discovery.p2pDebug` | boolean? | Emit `p2p.trace` rows to audit log. |
| `discovery.bootstrapPresets` | string[] | Managed preset names (repeatable). |
| `discovery.bootstrapPeers` | string[] | Extra explicit bootstrap multiaddrs. |
| `discovery.bootstrapPresetsFiles` | string \| string[] | YAML files with custom preset definitions (see §4). |
| `discovery.advertiseAddrs` | string[] | Same as `advertiseAddrs` in node-config / `--advertise-addr`. |

LAN-first variant: [envoymesh.node.lan.example.yaml](../envoymesh.node.lan.example.yaml).

---

## 4. Custom bootstrap presets YAML

**Path:** any file listed in `discovery.bootstrapPresetsFiles`, `--bootstrap-presets-file`, or `ENVOYMESH_BOOTSTRAP_PRESETS_FILES`  
**Template:** [bootstrap-presets.example.yaml](../bootstrap-presets.example.yaml)

Root object: **preset name → array of multiaddr strings**.

```yaml
# preset-name: must match [a-zA-Z0-9._-]{1,64}
my-relay:
  - /ip4/203.0.113.10/tcp/4001/p2p/12D3KooW...
  - /dns4/relay.example.com/tcp/4001/p2p/12D3KooW...
```

Reference the preset name in `bootstrapPresets` / `--bootstrap-preset my-relay`.

---

## 5. `.env` (environment overrides)

**Path:** `.env` at repo root (or export in shell / systemd / Tauri)  
**Template:** [.env.example](../.env.example)

Overrides YAML and parts of `node-config.json`. **Never commit** `.env` with real secrets.

See [.env.example](../.env.example) for every variable and comment. Summary:

| Variable | Purpose |
|----------|---------|
| `ENVOYMESH_PROFILE` | Profile directory |
| `ENVOYMESH_VAULT` | Vault root (default `shared_vault/`) |
| `ENVOYMESH_DISCOVERY_PROFILE` | Discovery profile |
| `ENVOYMESH_BOOTSTRAP_PEERS` | Comma-separated bootstrap multiaddrs |
| `ENVOYMESH_BOOTSTRAP_PRESETS` | Comma-separated preset names |
| `ENVOYMESH_BOOTSTRAP_PRESETS_FILES` | Comma-separated custom preset YAML paths |
| `ENVOYMESH_ADVERTISE_ADDRS` | Comma-separated reachable relay bases |
| `ENVOYMESH_CONNECTIVITY_STRICT` | `1` = strict wan-default startup |
| `ENVOYMESH_QUIC` | `1`/`true`/`yes` or `0`/`false`/`no` |
| `ENVOYMESH_PEER_DISCOVERY_LOG` | Log libp2p peer discovery to console |
| `ENVOYMESH_RELAY_DEBUG_SUMMARY` | Verbose relay connection summaries |
| `ENVOY_MODEL_MODE` | Override chat provider mode |
| `ENVOY_MODEL_ENDPOINT` | Override chat API URL |
| `ENVOY_MODEL_API_KEY` | Override chat API key |
| `ENVOY_MODEL_NAME` | Override chat model name |
| `ENVOY_CHAT_ASSIST_ENABLED` | `true` forces chat assist on |
| `ENVOYMESH_IPFS_EXPORT_ENGINE` | `kubo` \| `helia` \| `kubo-with-helia-shadow` |
| `ENVOYMESH_IPFS_EXE` / `ENVOYMESH_IPFS_PATH` | Kubo binary location |
| `ENVOYMESH_IPFS_API_PORT` | Kubo API port |
| `ENVOYMESH_PINATA_JWT` | Pinata JWT when pinning enabled |
| `ENVOYMESH_WEB3_STORAGE_TOKEN` | web3.storage token |
| `ENVOYMESH_WS_AUTH_TOKEN` | Relay WebSocket auth (relay binary) |
| `TEST_RELAY_ADDR` | Integration tests only — public relay multiaddr |

---

## 6. `reputation-anchors.json` (advanced, optional)

**Path:** `{profileDir}/reputation-anchors.json`  
**Fixture:** [docs/fixtures/reputation-anchors.example.json](./fixtures/reputation-anchors.example.json)

| Field | Description |
|-------|-------------|
| `version` | `"0.1"` |
| `updatedAt` | ISO timestamp |
| `attestations[]` | `{ attestationId, anchorId, anchorName, subjectOwnerId, claim, issuedAt, anchorRef? }` |

Usually populated by the node or imports; edit only for testing or curated anchor bundles.

---

## 7. Vault layout (not a single config file)

**Root:** `ENVOYMESH_VAULT` or `apps/node/shared_vault/` (gitignored)

| Path under vault | Purpose |
|------------------|---------|
| `knowledge/public/` | Contact-safe / auto-reply KB (RAG) |
| `knowledge/private/` | Owner-only KB (Envoy AI, local queries) |
| Other library files | Shared via file-share intents |

Paths are configured in `aiSettings.knowledgeBase.publicVaultPaths` / `privateVaultPaths`. See [knowledge-base-and-rag.md](./knowledge-base-and-rag.md).

---

## 8. Runtime files (auto-managed — do not edit by hand)

These live under `{profileDir}/` and are created by the node. Back them up if migrating machines; do not treat them as configuration templates.

| File | Purpose |
|------|---------|
| `profile.json` | Ed25519 keys, peer id, owner/device ids |
| `human-profile.json` | Public social profile |
| `trust-records.json` | Bond / trust tiers |
| `peer-directory.json` | Known peers and dial hints |
| `chat-messages.jsonl` | Chat history |
| `chat-drafts.jsonl` | Server-side draft backup |
| `audit-events.jsonl` | Audit log |
| `task-journal.jsonl` / `task-runtime-state.json` | Task state |
| `approval-queue.jsonl` | Pending approvals |
| `agent-activity.jsonl` | Activity feed |
| `rag-vectors.sqlite` | Embedding index |
| `discovery-seeds.json` | Cached discovery seeds |
| `published-library.json` / `published-external.json` | Library / IPFS export metadata |
| `session-tokens.json` / `device-authorization.json` | Mobile / device auth |
| `commerce-receipts.json` | Commerce receipt store |
| `multihop-discovery-sessions.json` | Multi-hop discovery sessions |
| `contact-owner-keys.json` | DID → owner key cache |
| `reputation-anchors.json` | Reputation bundle (may be user-curated) |
| `bridge-identity.json` | External agent bridge keys |

---

## Related docs

- [knowledge-base-and-rag.md](./knowledge-base-and-rag.md) — RAG paths, embeddings, agent identity vs vault
- [run-local-model.md](./run-local-model.md) — Ollama / cloud model setup
- [p2p-discovery.md](./p2p-discovery.md) — WAN bootstrap, relays, advertise addrs
- [live-connectivity-testing.md](./live-connectivity-testing.md) — two-machine connectivity
- [packaging.md](./packaging.md) — Tauri / desktop profile locations
