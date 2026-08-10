# Ext Agent guide (HomeClaw, Hermes, OpenHuman)

EnvoyMesh can forward Ext Agent chat to an external process over HTTP.
The home node bridge listens on `POST /bridge/send` (default port **3031**,
or **4031** when `ENVOYMESH_BRIDGE_PORT=4031` / port offset is used).

```
You → Ext Agent chat → home Node bridge
                         ↓ POST agentUrl
                    External agent (/message)
                         ↓ POST /bridge/send
                    Reply in chat
```

| Agent | Who owns `/message`? | Default `agentUrl` | Backend the sidecar / channel talks to |
|-------|----------------------|--------------------|----------------------------------------|
| **HomeClaw** | HomeClaw built-in channel | `http://127.0.0.1:8010/message` | HomeClaw Core (no EnvoyMesh sidecar) |
| **Hermes** | EnvoyMesh **auto-started** TypeScript sidecar | `http://127.0.0.1:8020/message` | Hermes OpenAI API `:8642` |
| **OpenHuman** | EnvoyMesh **auto-started** TypeScript sidecar | `http://127.0.0.1:8021/message` | OpenHuman core `:7788` (`/v1` or `/rpc`) |

Select the agent in **Settings → AI → Ext Agent**, enable the bridge, and save.
No full node restart is required for switching agents (port / secret / enable
still rebind the bridge HTTP listener in-process).

**Not covered here:** built-in **EnvoyAI / OpenClaw** (`/webhook/envoymesh`) — see
[agent_bridge_guide.md](./agent_bridge_guide.md) and [openclaw-extension.md](./openclaw-extension.md).

---

## Quick comparison

| | HomeClaw | Hermes | OpenHuman | Codex | Claude Code |
|---|----------|--------|-----------|-------|-------------|
| Start with product | Start HomeClaw | `hermes gateway run` | OpenHuman.app **or** CLI core | `codex app-server` (auto) | SDK (auto) |
| EnvoyMesh sidecar | No | Yes `:8020` | Yes `:8021` | Yes `:8023` (stdio bridge) | Yes `:8024` (in-proc) |
| Auth | Optional bridge secret | Hermes `API_SERVER_KEY` ↔ `HERMES_API_KEY` | `/v1` API key (auto) or `/rpc` `core.token` | `OPENAI_API_KEY` env | `ANTHROPIC_API_KEY` env |
| Transport | HomeClaw channel | HTTP `:8642` | HTTP `:7788` | `codex` stdio JSON-RPC | `@anthropic-ai/claude-agent-sdk` |
| Typical failure | HomeClaw down / wrong `ENVOYMESH_BRIDGE_URL` | API not enabled / key mismatch | Desktop `/rpc` 401 → use `/v1` auto-key | CLI not on `$PATH` | CLI not on `$PATH` |
| Install | separate product | `curl …/install.sh \| bash` | `curl …/install.sh \| bash` | `npm i -g @openai/codex` | `npm i -g @anthropic-ai/claude-code` |

---

## Common (all agents)

1. Start the **EnvoyMesh home node** (desktop / `apps/node`).
2. Open Social (or EnvoyGo paired to home).
3. **Settings → AI → Ext Agent**:
   - Enable Ext Agent / bridge
   - Choose HomeClaw, Hermes, OpenHuman, **Codex**, or **Claude Code**
   - Listen port usually `3031` (or your offset port, e.g. `4031`)
4. Chat with the **Ext Agent** contact (`envoy_agent_…`).

### Wire contract

Inbound to agent:

```json
POST <agentUrl>
{
  "from": "<senderPeerId>",
  "fromOwnerId": "envoy:owner:…",
  "fromName": "…",
  "text": "…",
  "messageId": "…"
}
```

Reply (async — do **not** put the chat reply in the `/message` HTTP body):

```json
POST http://127.0.0.1:<bridgePort>/bridge/send
{ "to": "<from peer id>", "text": "…" }
```

`to` must be the mesh **peer id** from inbound `from` (`envoy_…`), not `envoy:owner:…`.

Optional: `Authorization: Bearer <secret>` when the bridge config sets `secret`.

### Shared EnvoyMesh env

| Variable | Default | Meaning |
|----------|---------|---------|
| `ENVOYMESH_BRIDGE_PORT` | `3031` (+ offset) | Bridge HTTP listen port (`/bridge/send`) |
| Bridge `secret` (config) | unset | Shared Bearer for `/message` and `/bridge/send` |

---

## HomeClaw

HomeClaw ships an integrated EnvoyMesh channel — EnvoyMesh does **not** start a
sidecar. Starting HomeClaw is enough; you do **not** run a separate
`channels.run envoymesh` process.

```
Ext Agent chat
  → EnvoyMesh bridge
  → POST http://127.0.0.1:8010/message   (HomeClaw, built-in channel)
  → POST http://127.0.0.1:<bridgePort>/bridge/send
  → reply in chat
```

### Ports

| Process | Port | Role |
|---------|------|------|
| EnvoyMesh bridge | `3031` (or `4031` with offset) | `POST /bridge/send` replies |
| HomeClaw EnvoyMesh channel | `8010` | Inbound `/message` |

### Run

1. Start the **EnvoyMesh home node** with Ext Agent / bridge enabled
   (HomeClaw selected → `http://127.0.0.1:8010/message`).
2. Start **HomeClaw** the usual way (gateway / Core — whatever your install uses).
   The EnvoyMesh channel comes up with HomeClaw; no separate channel command.

Optional env / config (if defaults do not match your bridge port):

```bash
# Where HomeClaw POSTs replies (3031 default, 4031 if ENVOYMESH_BRIDGE_PORT offset):
export ENVOYMESH_BRIDGE_URL=http://127.0.0.1:3031/bridge/send
# Inbound /message listen port (HomeClaw default is usually 8010):
export ENVOYMESH_PORT=8010
```

Channel options may also live in HomeClaw config (e.g. `channels/envoymesh`
`port`, `bridge_url`, `user_id`) — see the HomeClaw repo.

### EnvoyMesh settings

- Active Ext Agent: **HomeClaw**
- URL: `http://127.0.0.1:8010/message`
- Bridge listen port: `3031` (or your offset)

### Verify

```bash
curl -sS http://127.0.0.1:8010/status
curl -sS -X POST http://127.0.0.1:8010/message \
  -H 'Content-Type: application/json' \
  -d '{"from":"12D3Test","fromOwnerId":"envoy:owner:test","fromName":"Test","text":"ping","messageId":"1"}'
```

### Minimal checklist

- [ ] EnvoyMesh Ext Agent = HomeClaw, bridge enabled
- [ ] HomeClaw running; `curl http://127.0.0.1:8010/status` works
- [ ] `ENVOYMESH_BRIDGE_URL` matches EnvoyMesh bridge port (`3031` / `4031`)
- [ ] Chat Ext Agent contact

---

## Hermes

Hermes does **not** ship an EnvoyMesh channel. When you select Hermes, the home
node **automatically** starts a local TypeScript sidecar on `:8020/message` that
forwards to Hermes’s OpenAI-compatible API (`:8642`). No Hermes source changes
are required.

```
Ext Agent chat
  → EnvoyMesh bridge
  → POST http://127.0.0.1:8020/message     (EnvoyMesh sidecar, auto-started)
  → POST http://127.0.0.1:8642/v1/chat/completions   (Hermes API server)
  → POST http://127.0.0.1:<bridgePort>/bridge/send
  → reply in chat
```

### Ports

| Process | Port | Role |
|---------|------|------|
| EnvoyMesh bridge | `3031` (or `4031` with offset) | `POST /bridge/send` replies |
| EnvoyMesh Hermes sidecar | `8020` | EnvoyMesh `/message` contract |
| Hermes API server | `8642` | OpenAI-compatible chat API |

### Required Hermes setup (stock install — config only)

1. Install Hermes and configure model / API keys (`hermes status` should look healthy).
2. Find Hermes’s `.env` (path is **not** fixed across OS / installers):

```bash
# Prefer Hermes’s own helper when available:
hermes config env-path

# Typical locations:
#   Linux / macOS / WSL:  ~/.hermes/.env
#   Windows (installer):  %LOCALAPPDATA%\hermes\.env   (HERMES_HOME usually set)
#   Custom:               $HERMES_HOME/.env
```

3. In that file, set:

```bash
# REQUIRED for EnvoyMesh Ext Agent
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642

# REQUIRED by current Hermes (even on 127.0.0.1) — gateway will refuse to
# start api_server without this. Generate e.g.: openssl rand -hex 32
API_SERVER_KEY=replace-with-a-long-random-secret
```

4. Give EnvoyMesh the **same** key. Portable option (recommended on Windows /
custom `HERMES_HOME`):

```bash
# On the EnvoyMesh home-node process — always works, no path guessing:
export HERMES_API_KEY='replace-with-a-long-random-secret'
```

Optional convenience: if Hermes and the home node share a machine, the sidecar
may also discover `API_SERVER_KEY` from a candidate `.env` (see below). Do **not**
rely on that alone when paths differ (e.g. Windows installer vs WSL).

5. Start the Hermes gateway (this is what listens on `:8642`):

```bash
hermes gateway run
# or run in background as a user service:
hermes gateway install
hermes gateway start
```

6. Verify the API is up (Bearer required):

```bash
curl -sS http://127.0.0.1:8642/v1/models \
  -H "Authorization: Bearer replace-with-a-long-random-secret"
```

A JSON model list means EnvoyMesh can talk to Hermes. Connection refused means
`api_server` still did not start (check for the `API_SERVER_KEY is required` error).

### Env var reference (Hermes `.env`)

| Variable | Required for EnvoyMesh? | Default | Meaning |
|----------|-------------------------|---------|---------|
| `API_SERVER_ENABLED` | **Yes** | unset / false | Enables the OpenAI-compatible API platform inside `hermes gateway` |
| `API_SERVER_KEY` | **Yes** | unset | Bearer token. Hermes **refuses to start** `api_server` without it, including loopback `127.0.0.1` |
| `API_SERVER_HOST` | Recommended | `127.0.0.1` | Bind address. Keep loopback for local EnvoyMesh |
| `API_SERVER_PORT` | Optional | `8642` | API listen port (must match `HERMES_API_BASE` on the node) |
| `API_SERVER_CORS_ORIGINS` | No | unset | Browser CORS allowlist; not needed for Node→Hermes |
| `API_SERVER_MODEL_NAME` | No | `hermes-agent` | Name advertised on `/v1/models` |
| `GATEWAY_ALLOW_ALL_USERS` | **No** | false | Only for Telegram/Discord/etc. messaging bots — **not** required for EnvoyMesh API path |
| `TELEGRAM_ALLOWED_USERS` etc. | No | unset | Messaging allowlists; irrelevant unless you use those platforms |

### Matching key on the EnvoyMesh node

The TypeScript sidecar sends `Authorization: Bearer <key>` on every Hermes API
call. Resolution order:

1. `HERMES_API_KEY` (process env) — **preferred; portable**
2. `API_SERVER_KEY` (process env)
3. Best-effort read of `API_SERVER_KEY` from the first readable file among:
   - `HERMES_ENV_FILE` (explicit path override)
   - `$HERMES_HOME/.env`
   - `~/.hermes/.env` (also via `HOME` / `USERPROFILE`)
   - `%LOCALAPPDATA%/hermes/.env` and `%APPDATA%/hermes/.env` (Windows)

If discovery misses your install (common with custom/`HERMES_HOME` split-brain),
set `HERMES_API_KEY` or `HERMES_ENV_FILE` explicitly. Wrong/missing key → Hermes
`401` after the API is listening.

### `GATEWAY_ALLOW_ALL_USERS` — do you need it?

**No, not for EnvoyMesh.**

- That flag controls who may message Hermes on **messaging platforms** (Telegram, Discord, Slack, …).
- EnvoyMesh calls Hermes only over **HTTP on localhost `:8642`**.
- Local API auth uses **`API_SERVER_KEY`** (required by Hermes even on loopback).
  EnvoyMesh must send the same value via `HERMES_API_KEY` (portable) or file discovery.

You may still set `GATEWAY_ALLOW_ALL_USERS=true` if you also use Hermes as a personal Telegram bot and want open access. That is optional and unrelated to Ext Agent chat.

### Gateway warnings explained

When you run `hermes gateway run` you may see:

```text
WARNING gateway.run: No user allowlists configured. All unauthorized users will be denied.
  Set GATEWAY_ALLOW_ALL_USERS=true in ~/.hermes/.env to allow open access, or configure
  platform allowlists (e.g., TELEGRAM_ALLOWED_USERS=your_id).
WARNING gateway.run: No messaging platforms enabled.
```

| Warning / error | Cause | For EnvoyMesh |
|---------|--------|----------------|
| No user allowlists | No `*_ALLOWED_USERS` / no `GATEWAY_ALLOW_ALL_USERS` | **Safe to ignore** if you only use the local API |
| No messaging platforms enabled | `API_SERVER_ENABLED` is not `true` | **Fix**: set `API_SERVER_ENABLED=true`, restart gateway |
| `API_SERVER_KEY is required… including loopback` | Key missing in Hermes `.env` | **Fix**: set `API_SERVER_KEY=…` (`hermes config env-path`), restart gateway |
| `api_server failed to connect` / queued for retry | API server did not start (usually missing key) | Fix key / enabled flags; confirm `curl :8642/v1/models` with Bearer |
| Ext Agent: `fetch failed` | Nothing listening on `:8642` | Same as above — API server never started |
| Ext Agent: `401` / Invalid API key | Sidecar key ≠ Hermes key | Set `HERMES_API_KEY` on the node (or `HERMES_ENV_FILE` / `HERMES_HOME`) |

After a correct setup, the “No messaging platforms enabled” warning should disappear (API server counts as an enabled platform). The allowlist warning can remain if you never configure Telegram — that is fine for EnvoyMesh.

### EnvoyMesh side (Hermes)

1. Run the home node with the TypeScript sidecar code.
2. **Settings → AI → Ext Agent** → select **Hermes**, enable bridge, save.
3. Node log should show:

```text
[ext-agent:hermes] listening http://127.0.0.1:8020/message → http://127.0.0.1:<bridgePort>/bridge/send (Hermes API http://127.0.0.1:8642)
```

4. Optional env on the **EnvoyMesh node** process:

| Variable | Default | Meaning |
|----------|---------|---------|
| `HERMES_API_BASE` | `http://127.0.0.1:8642` | Where the sidecar POSTs `/v1/chat/completions` |
| `HERMES_API_KEY` | unset | **Preferred** — must match Hermes `API_SERVER_KEY` |
| `API_SERVER_KEY` | unset | Alias for `HERMES_API_KEY` |
| `HERMES_ENV_FILE` | unset | Explicit path to Hermes `.env` (skip OS path guessing) |
| `HERMES_HOME` | unset | Hermes data dir; sidecar tries `$HERMES_HOME/.env` |
| `HERMES_API_MODEL` | `hermes-agent` | Model name sent to Hermes |
| `ENVOYMESH_HERMES_PORT` | `8020` | Sidecar `/message` listen port |
| `ENVOYMESH_BRIDGE_PORT` | `3031` (+ offset) | Must match bridge callback URL |

### Verify end-to-end (Hermes)

```bash
KEY='your-same-secret'   # API_SERVER_KEY / HERMES_API_KEY

# 1) Hermes API (must return JSON, not connection refused)
curl -sS http://127.0.0.1:8642/v1/models \
  -H "Authorization: Bearer $KEY"

# 2) EnvoyMesh sidecar (only after Hermes is selected + bridge on)
curl -sS http://127.0.0.1:8020/status

# 3) Simulate bridge → sidecar
curl -sS -X POST http://127.0.0.1:8020/message \
  -H 'Content-Type: application/json' \
  -d '{"from":"12D3Test","fromOwnerId":"envoy:owner:test","fromName":"Test","text":"ping","messageId":"t1"}'
# → {"status":"accepted","text":null}  then a reply appears via /bridge/send
```

If chat shows `⚠️ hermes adapter error: …`, read the message: usually Hermes API
is down (missing `API_SERVER_KEY` / gateway not running) or auth mismatch.

### Minimal checklist

- [ ] `API_SERVER_ENABLED=true` + `API_SERVER_KEY=<secret>` in Hermes `.env` (`hermes config env-path`)
- [ ] `HERMES_API_KEY=<same secret>` on the EnvoyMesh node (or `HERMES_ENV_FILE` / shared `HERMES_HOME`)
- [ ] `hermes gateway run` (or installed service) is running — no “api_server failed”
- [ ] `curl -H "Authorization: Bearer …" http://127.0.0.1:8642/v1/models` works
- [ ] EnvoyMesh Ext Agent = Hermes, bridge enabled
- [ ] Log line `[ext-agent:hermes] listening …:8020/message`
- [ ] Chat Ext Agent contact

---

## OpenHuman

Same pattern as Hermes: EnvoyMesh auto-starts `:8021/message` and talks to the
local OpenHuman core on `:7788`.

**Important:** OpenHuman.app’s per-launch `/rpc` bearer is **in-memory only**.
EnvoyMesh cannot discover it. With the desktop app, use the **stable `/v1`
OpenAI-compatible API** (Path A, default). Use `/rpc` + `core.token` only with a
CLI / headless core (Path B).

```
Ext Agent chat
  → EnvoyMesh bridge
  → POST http://127.0.0.1:8021/message     (EnvoyMesh sidecar, auto-started)
  → OpenHuman :7788  (/v1/chat/completions  or  /rpc agent.chat)
  → POST http://127.0.0.1:<bridgePort>/bridge/send
  → reply in chat
```

### Ports

| Process | Port | Role |
|---------|------|------|
| EnvoyMesh bridge | `3031` (or `4031` with offset) | `POST /bridge/send` replies |
| EnvoyMesh OpenHuman sidecar | `8021` | EnvoyMesh `/message` contract |
| OpenHuman core | `7788` | `/health`, `/v1/*`, `/rpc` |

### Path A — OpenHuman.app (automatic key; recommended)

Keep OpenHuman.app running (it owns `http://127.0.0.1:7788`).

EnvoyMesh **auto-loads** a `/v1` API key (no shell `export` needed), in order:

1. `OPENHUMAN_API_KEY` / `OPENHUMAN_V1_API_KEY` / `OPENHUMAN_EXTERNAL_API_KEY`
2. Dotenv (`OPENHUMAN_ENV_FILE` / workspace `.env`)
3. EnvoyMesh cache: `~/.envoymesh/openhuman.api-key` (or `%LOCALAPPDATA%\EnvoyMesh\openhuman.api-key`)
4. OpenHuman `dev-keychain.json` / macOS Keychain (`external-openai-compat`)
5. **Auto-provision** (default): generate a key, write it into OpenHuman’s
   credential store + EnvoyMesh cache

#### What `OPENHUMAN_AUTO_PROVISION_API_KEY` means

| Value | Behavior |
|-------|----------|
| unset / `1` / `true` (default) | If no key is found, EnvoyMesh **creates** one and writes it into OpenHuman’s local credentials so `/v1` works without manual paste |
| `0` / `false` / `off` | EnvoyMesh **only reads** an existing key; it will **not** modify OpenHuman’s store. You must supply a key yourself |

Then select **OpenHuman** + enable bridge. Sidecar log should show
`OpenHuman /v1 http://127.0.0.1:7788` (and may log
`auto-provisioned /v1 API key…` once).

If `/v1` still 401s after auto-provision, **restart OpenHuman.app** so it
reloads credentials, then retry.

Optional overrides:

```bash
export OPENHUMAN_API_KEY_FILE="$HOME/.envoymesh/openhuman.api-key"
export OPENHUMAN_API_MODEL=openhuman
export OPENHUMAN_TRANSPORT=v1
# export OPENHUMAN_AUTO_PROVISION_API_KEY=0   # opt out of writing into OpenHuman
```

### Path B — CLI / headless core (`/rpc`)

Quit OpenHuman.app first (it holds `:7788`), then:

```bash
# Example: pin a shared secret (works across platforms)
export OPENHUMAN_CORE_TOKEN="$(openssl rand -hex 32)"
openhuman-core serve   # or: openhuman serve / openhuman core run
# same OPENHUMAN_CORE_TOKEN (or OPENHUMAN_RPC_TOKEN) on the EnvoyMesh node
export OPENHUMAN_TRANSPORT=rpc
```

When `OPENHUMAN_CORE_TOKEN` is unset, CLI writes `<workspace>/core.token`
(EnvoyMesh auto-reads it).

### Token / key resolution (first hit wins)

**`/v1` key:** env → dotenv → `~/.envoymesh/openhuman.api-key` → OpenHuman
keychain/`dev-keychain.json` → auto-provision (unless
`OPENHUMAN_AUTO_PROVISION_API_KEY=0`)

**`/rpc` bearer:** `OPENHUMAN_RPC_TOKEN` → `OPENHUMAN_CORE_TOKEN` → dotenv →
`OPENHUMAN_TOKEN_FILE` → `<workspace>/core.token`

**Transport:** `OPENHUMAN_TRANSPORT=rpc|v1`, or auto (RPC if bearer found, else V1)

### Workspace / data roots (platform-aware)

| Platform | Typical roots |
|----------|----------------|
| All | `OPENHUMAN_WORKSPACE`, `OPENHUMAN_HOME` |
| macOS / Linux / WSL | `~/.openhuman`, `~/.openhuman-staging` (when `OPENHUMAN_APP_ENV=staging`) |
| Windows | `%USERPROFILE%\.openhuman`, `%LOCALAPPDATA%\openhuman`, `%APPDATA%\openhuman` |
| Linux (XDG) | `$XDG_DATA_HOME/openhuman`, `$XDG_CONFIG_HOME/openhuman` |

Home is resolved via `os.homedir()` plus `HOME` / `USERPROFILE`.

### EnvoyMesh env (OpenHuman)

| Variable | Default | Meaning |
|----------|---------|---------|
| `OPENHUMAN_CORE_RPC_URL` | `http://127.0.0.1:7788/rpc` | Explicit RPC URL (also derives HTTP base for `/v1` / `/health`) |
| `OPENHUMAN_CORE_HOST` / `OPENHUMAN_CORE_PORT` | `127.0.0.1` / `7788` | Used when RPC URL unset |
| `OPENHUMAN_TRANSPORT` | auto | Force `v1` or `rpc` |
| `OPENHUMAN_API_KEY` | unset | Stable `/v1` Bearer (usually auto) |
| `OPENHUMAN_API_KEY_FILE` | unset | Raw key file override |
| `OPENHUMAN_AUTO_PROVISION_API_KEY` | `1` | `0` = never write into OpenHuman’s store |
| `OPENHUMAN_API_MODEL` | `openhuman` | Model id for `/v1/chat/completions` |
| `OPENHUMAN_RPC_TOKEN` / `OPENHUMAN_CORE_TOKEN` | unset | `/rpc` bearer (CLI path) |
| `OPENHUMAN_TOKEN_FILE` | unset | Raw `/rpc` token file |
| `OPENHUMAN_ENV_FILE` / `OPENHUMAN_WORKSPACE` / `OPENHUMAN_HOME` | unset | Discovery roots |
| `OPENHUMAN_APP_ENV` | unset | `staging` probes `~/.openhuman-staging` first |
| `ENVOYMESH_OPENHUMAN_PORT` | `8021` | Sidecar `/message` listen port |

### Verify

```bash
# Health (public)
curl -sS http://127.0.0.1:7788/health

# Sidecar (after OpenHuman selected + bridge on)
curl -sS http://127.0.0.1:8021/status

# /v1 (after auto-key or OPENHUMAN_API_KEY)
KEY="$(cat ~/.envoymesh/openhuman.api-key 2>/dev/null)"
curl -sS http://127.0.0.1:7788/v1/models \
  -H "Authorization: Bearer $KEY"
```

### Minimal checklist

- [ ] OpenHuman.app running **or** CLI core on `:7788`
- [ ] EnvoyMesh Ext Agent = OpenHuman, bridge enabled
- [ ] Log: `[ext-agent:openhuman] listening …:8021/message` (label shows `/v1` or `RPC`)
- [ ] If 401 after first auto-provision: restart OpenHuman.app once
- [ ] Chat Ext Agent contact

---

## Codex

Codex is the OpenAI Codex CLI. EnvoyMesh's Ext Agent bridge talks to
`codex app-server` over **stdio** JSON-RPC (no extra TCP port from
the CLI side), spawns it via the generic **daemon supervisor** (55A),
and forwards chat turns as `turn/start` requests. Sessions are
thread-scoped on the Codex side; EnvoyMesh maps `sessionKey` →
`threadId` in memory only (restart drops the mapping).

### Ports

| Process | Port | Role |
|---------|------|------|
| EnvoyMesh bridge | `3031` (or `4031` with offset) | `POST /bridge/send` replies |
| EnvoyMesh codex sidecar | `8023` (or `ENVOYMESH_CODEX_PORT`) | Inbound `/message` |
| Codex CLI | n/a (stdio) | JSON-RPC, managed by supervisor |

### Install

```bash
# Primary install path (matches Settings UI Install Required card)
npm install -g @openai/codex

# Verify
codex --version

# Required env var — set before starting the home node
export OPENAI_API_KEY=sk-...
```

Alternatives (Settings UI `commonIssues` bullets):

- **Homebrew** (macOS / Linux): `brew install --cask codex` if the formula
  exists in your tap; otherwise stick with npm.
- **Direct binary** (Linux / WSL): download from
  <https://github.com/openai/codex/releases> and place on `$PATH`.

### Run

1. Confirm `codex --version` works in the home node's shell.
2. Confirm `OPENAI_API_KEY` is set (env var, `~/.bashrc`, `~/.zshrc`, or
   the launchd / systemd unit that starts EnvoyMesh).
3. Start the **EnvoyMesh home node** with Ext Agent / bridge enabled
   and Codex selected.
4. The supervisor spawns `codex app-server` automatically; the
   sidecar replies to `POST http://127.0.0.1:8023/message`.

### Verify

```bash
# Sidecar health (from the home node)
curl -s http://127.0.0.1:8023/status | head

# Codex CLI sanity
codex --version
echo "$OPENAI_API_KEY" | head -c 8
```

### Known limitations

- **Session persistence** is in-memory; restarting the home node drops
  the `sessionKey → threadId` map. A fresh ask after restart starts a
  new Codex thread (matches Hermes / OpenHuman).
- **Tool execution stays inside Codex.** Codex's `tool_use` runs in its
  own VM; EnvoyMesh never sees tool payloads. This is by design — Ext
  Agent is a black box from the mesh's perspective.
- **Codex CLI requires Node.js 18+.** Verify with `node --version`.

### Minimal checklist

- [ ] `codex --version` exits 0
- [ ] `OPENAI_API_KEY` set in the home node's environment
- [ ] EnvoyMesh Ext Agent = Codex, bridge enabled
- [ ] Log: `[ext-agent:codex] listening …:8023/message`
- [ ] Chat Ext Agent contact

---

## Claude Code

Claude Code is Anthropic's official coding agent. EnvoyMesh's Ext
Agent bridge uses the `@anthropic-ai/claude-agent-sdk` **in-process**
(no subprocess to manage), so the supervisor is not used. Sessions
are derived from the SDK's `system/init` `session_id`; EnvoyMesh
maps `sessionKey` → `sessionId` in memory only.

### Ports

| Process | Port | Role |
|---------|------|------|
| EnvoyMesh bridge | `3031` (or `4031` with offset) | `POST /bridge/send` replies |
| EnvoyMesh Claude Code sidecar | `8024` (or `ENVOYMESH_CLAUDECODE_PORT`) | Inbound `/message` |
| Claude Code CLI | n/a (in-process SDK) | library call, no subprocess |

### Install

```bash
# Primary install path (matches Settings UI Install Required card)
npm install -g @anthropic-ai/claude-code

# Verify — the binary that ships with the package is named `claude`
claude --version

# Required env var — set before starting the home node
export ANTHROPIC_API_KEY=sk-ant-...
```

Alternatives:

- **Homebrew** (macOS / Linux): `brew install claude-code` if a
  maintained formula exists in your tap.
- **Direct binary**: download from
  <https://docs.claude.com/en/docs/claude-code> and place on `$PATH`.

### Run

1. Confirm `claude --version` works in the home node's shell.
2. Confirm `ANTHROPIC_API_KEY` is set.
3. Start the **EnvoyMesh home node** with Ext Agent / bridge enabled
   and Claude Code selected.
4. The sidecar calls the SDK in-process; no supervisor, no restart
   loop. Each `ask()` allocates a Claude Code session.

### Verify

```bash
claude --version
echo "$ANTHROPIC_API_KEY" | head -c 8
```

### Known limitations

- **Session persistence** is in-memory; restart drops the
  `sessionKey → sessionId` map.
- **Tool execution stays inside Claude Code.** `canUseTool` callbacks
  run inside the SDK's VM; EnvoyMesh never sees tool payloads.
- **Claude Code requires Node.js 18+.** Verify with `node --version`.
- **Heavier memory footprint** than codex — the SDK runs in the same
  Node.js process as EnvoyMesh. Monitor with `process.memoryUsage()`
  if you hit OOMs.

### Minimal checklist

- [ ] `claude --version` exits 0
- [ ] `ANTHROPIC_API_KEY` set in the home node's environment
- [ ] EnvoyMesh Ext Agent = Claude Code, bridge enabled
- [ ] Log: `[ext-agent:claudecode] listening …:8024/message`
- [ ] Chat Ext Agent contact

---

## Install guide (Phase 55A.1)

Settings → AI → Ext Agent surfaces a per-agent **Install Required**
card when the binary is not on `$PATH`. The card is generated by
`getExtAgentInstallGuide(agentId, installState?)` in
`packages/api/src/ext-agent.ts` and includes the install command,
verify command, install docs link, and 2-4 `commonIssues` bullets.

| id | command | installCommand | verifyCommand | homepage |
|---|---|---|---|---|
| `codex` | `codex` | `npm install -g @openai/codex` | `codex --version` | <https://github.com/openai/codex> |
| `claudecode` | `claude` | `npm install -g @anthropic-ai/claude-code` | `claude --version` | <https://docs.claude.com/en/docs/claude-code> |
| `hermes` | `hermes` | `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh \| bash` | `hermes --version` | <https://hermes-agent.nousresearch.com/docs> |
| `openhuman` | `openhuman` | `curl -fsSL https://raw.githubusercontent.com/tinyhumansai/openhuman/main/scripts/install.sh \| bash` | `openhuman --version` | <https://tinyhumans.ai/openhuman> |

The status indicator next to the active agent in Settings reflects
`installState`:

- **green** — `installState: "installed"` AND `reachable: true`
- **amber** — `installState: "installed"` AND `reachable: false`
  (binary present, daemon not running — Settings shows a start hint)
- **red** — `installState: "not-installed"` (binary missing — Install
  Required card is rendered)

The chat list switcher (`ExtAgentSwitcher`) uses the same data and
pops a modal / toast for the same three states (55D.1). See the next
section for the chat-side UX.

---

## Chat switcher tri-state UX (Phase 55D.1)

The chat list **switch icon** (sidebar) and the **in-chat banner** both
use the same `installState` + `reachable` data but render different
controls depending on severity. Goal: **never surface a cryptic error
to the user** — the worst UX is "I picked Claude Code and nothing
happens, no error, no hint".

| `installState` | `reachable` | UX |
|---|---|---|
| `not-installed` / `unsupported` / `unknown` | (irrelevant) | **Install modal** (chat switcher) / **install card** (banner). Both share `ExtAgentInstallGuideCard`; the modal also wraps it in `ModalPortal` and adds ESC + overlay-click + Dismiss-button close. |
| `installed` | `false` | **3-second toast** (chat switcher) with start hint + Retry button. **Simple hint banner** (`"X is not running"`) with a Recheck button (offline banner). |
| `installed` | `true` | **Silent.** Button label is the only signal. |

### Switcher (sidebar)

`apps/social/src/components/ExtAgentSwitcher.tsx`. After a successful
`updateNodeConfig({ activeExtAgentId })`, the switcher runs a soft
`probeExtAgent({ agentId })` and routes the result to the matching
surface. The toast auto-dismisses after 3s; the install modal stays
open across retries and auto-closes when the retry reports the agent
is now installed (parent passes `resolved: true` to the dialog).

### In-chat banner

`apps/social/src/components/views/ExtAgentOfflineBanner.tsx`. Polls
`probeExtAgent` every 5s while the banner is visible. When the
`installState` says "not installed" the banner renders the full
`ExtAgentInstallGuideCard` inline (no modal — the user is already in
the chat, a modal would be disruptive) with a Retry button that
re-probes immediately.

### Settings panel

`apps/social/src/components/views/settings/AgentSettings.tsx`. The
view + edit mode for the active agent both look up
`getExtAgentInstallGuide(agentId, "unknown")` and render the card
when the guide is non-empty. Built-in Pi / HomeClaw keep the simple
hint (the card returns `null` for `installed: true`).

### Shared card

`apps/social/src/components/ExtAgentInstallGuideCard.tsx`. Same
component used in all three places. Renders the install command
(with a Copy-to-clipboard that flips to "Copied" for 1.5s), verify
command, install docs link, 2-4 `commonIssues` bullets, and
optional Retry / Dismiss buttons.

---

## Troubleshooting (all agents)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Delivered, no reply (HomeClaw) | HomeClaw not running / wrong bridge URL | Start HomeClaw; confirm `:8010/status`; match `ENVOYMESH_BRIDGE_URL` to bridge port |
| Delivered, no reply (Hermes) | Hermes API down | `API_SERVER_ENABLED=true` + `API_SERVER_KEY` + `hermes gateway run` |
| Hermes: `API_SERVER_KEY is required… including loopback` | Key missing | Set `API_SERVER_KEY` in Hermes `.env` (`hermes config env-path`), restart gateway |
| Hermes: `api_server failed to connect` | API server did not start | Fix key/enabled; confirm `:8642` listens |
| Ext Agent: `fetch failed` (Hermes) | Nothing on `:8642` | Same as above |
| Ext Agent: `401` / Invalid API key (Hermes) | Key mismatch | Set `HERMES_API_KEY` on node = Hermes `API_SERVER_KEY` (or `HERMES_ENV_FILE`) |
| Hermes: `No messaging platforms enabled` | API server not enabled | Set `API_SERVER_ENABLED=true` in Hermes `.env`, restart gateway |
| Hermes: `No user allowlists configured` | No Telegram/etc. allowlists | **Ignore for EnvoyMesh**; only needed for messaging bots |
| Delivered, no reply (OpenHuman) | Core not running / auth | OpenHuman.app + `/v1` auto-key, or CLI + `core.token` |
| OpenHuman: `401` / missing bearer | Desktop in-memory `/rpc` token / stale creds | Prefer `/v1` auto-key; restart OpenHuman.app after auto-provision |
| Settings shows "Install required" for codex / claudecode | CLI not on `$PATH` | Run the install command shown on the card, then click **Retry** |
| Ext Agent picker: codex / claudecode not in the list | Bridge off or wrong agent preset | Settings → AI → Ext Agent; bridge must be enabled; presets are additive (no `bridge-config.json` migration needed) |
| `codex app-server` crashes repeatedly | `OPENAI_API_KEY` invalid / CLI version too old | Verify `codex --version`; rotate key; supervisor will surface `crash.stuck` after 5 restarts/5 min |
| `claude --version` missing in PATH | Package not installed / wrong binary | `npm i -g @anthropic-ai/claude-code`; the binary is `claude`, not `claudecode` |
| Chat switcher opens install modal after picking an agent | Binary is missing / install state is `unknown` | Run the install command from the card, then click **Retry**. The dialog auto-closes when the agent is reachable. |
| Chat switcher shows 3s toast, no modal | Binary is installed but the daemon is down | Start the agent's daemon (e.g. `codex app-server`, `hermes gateway run`); the toast is informational. |
| `bridge unreachable` in sidecar log | Wrong bridge port | Match `ENVOYMESH_BRIDGE_PORT` (e.g. `4031`) |
| Sidecar not listening | Bridge off or wrong agent | Enable bridge; select Hermes/OpenHuman/Codex/Claude Code |
| Port in use | Another process on `8010`/`8020`/`8021`/`8023`/`8024` | Stop old process / set `ENVOYMESH_*_PORT` (e.g. `ENVOYMESH_CODEX_PORT`) |
| Hermes API works but sidecar errors | Node not restarted / wrong `HERMES_API_BASE` | Restart home node; check env |

Node log markers:

- `[sendChat] self-send … routing via bridge handler`
- `[bridge] forwardToAgent: POST http://127.0.0.1:8020/message …` (or `8010` / `8021` / `8023` / `8024`)
- `[ext-agent:hermes] reply sent to …` / `[ext-agent:openhuman] …` / `[ext-agent:codex] …` / `[ext-agent:claudecode] …`
- `[ext-agent:codex] install-missing: codex (spawn-enoent)` — CLI not on PATH

---

## Architecture notes

- **HomeClaw**: EnvoyMesh channel is integrated in HomeClaw — start HomeClaw only
  (no separate channel process; EnvoyMesh does not auto-start a sidecar).
- **Hermes / OpenHuman**: third-party — EnvoyMesh owns the TypeScript sidecar under
  `apps/node/src/ext-agent-adapter/`, started/stopped when the Ext Agent selection
  or bridge enablement changes.
- **Codex**: third-party OpenAI CLI. EnvoyMesh spawns `codex app-server` via
  the **daemon supervisor** (`apps/node/src/ext-agent-adapter/daemon-supervisor.ts`,
  Phase 55A). The supervisor handles restart-on-crash with exponential
  backoff and surfaces `install-missing` if the CLI is not on `$PATH`.
- **Claude Code**: third-party Anthropic SDK. EnvoyMesh uses
  `@anthropic-ai/claude-agent-sdk` **in-process** (no subprocess, no
  supervisor). The SDK is loaded into the home node's Node.js process.
- Built-in **EnvoyAI / OpenClaw** is separate (`/webhook/envoymesh`); it is not
  an Ext Agent preset — see [agent_bridge_guide.md](./agent_bridge_guide.md).
