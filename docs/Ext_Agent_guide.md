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

| | HomeClaw | Hermes | OpenHuman | Codex | Claude Code | Cursor CLI | Aider | MMX-CLI |
|---|----------|--------|-----------|-------|-------------|------------|-------|---------|
| Start with product | Start HomeClaw | Auto (probe-first) **or** `hermes gateway run` | Keep **OpenHuman.app** running | `codex app-server` (auto) | SDK (auto) | `cursor-agent --print …` (auto) | `aider --message …` (auto) | `mmx text chat --message …` (auto) |
| EnvoyMesh sidecar | No | Yes `:8020` | Yes `:8021` | Yes `:8023` (stdio bridge) | Yes `:8024` (in-proc) | Yes `:8025` (one-shot) | Yes `:8026` (one-shot) | Yes `:8027` (one-shot) |
| Auth | Optional bridge secret | Hermes `API_SERVER_KEY` ↔ `HERMES_API_KEY` | `/v1` API key (auto) or `/rpc` `core.token` | `OPENAI_API_KEY` env | `ANTHROPIC_API_KEY` env | `cursor-agent login` (browser OAuth) | `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` | `mmx auth login --api-key …` |
| Transport | HomeClaw channel | HTTP `:8642` | HTTP `:7788` | `codex` stdio JSON-RPC | `@anthropic-ai/claude-agent-sdk` | `cursor-agent` stdio one-shot | `aider` one-shot subprocess | `mmx` one-shot subprocess |
| Typical failure | HomeClaw down / wrong `ENVOYMESH_BRIDGE_URL` | API not enabled / key mismatch | Desktop `/rpc` 401 → use `/v1` auto-key | CLI not on `$PATH` | CLI not on `$PATH` | First-run browser login skipped | First-run prompts hang in non-TTY | `mmx auth` not run yet |
| Install | [homeclaw.cn](https://www.homeclaw.cn) (`./install.sh`) | `curl …/install.sh \| bash` | `curl …/install.sh \| bash` | `npm i -g @openai/codex` | `npm i -g @anthropic-ai/claude-code` | `curl …/cursor.com/install \| bash` | `uv tool install aider-chat` | `npm i -g mmx-cli` |

> **Phase 56 additions** (cursor / aider / mmx) all use the shared
> `OneShotCliBackend` base — one subprocess per `ask()`, no long-lived
> daemon, no JSON-RPC framing. They differ from codex (long-lived stdio
> JSON-RPC) and claudecode (in-process SDK) by being the **simplest**
> transport class in the ext-agent-adapter.

---

## Common (all agents)

1. Start the **EnvoyMesh home node** (desktop / `apps/node`).
2. Open Social (or EnvoyGo paired to home).
3. **Settings → AI → Ext Agent**:
   - Enable Ext Agent / bridge
   - Choose HomeClaw, Hermes, OpenHuman, **Codex**, **Claude Code**,
     **Cursor CLI**, **Aider**, or **MMX-CLI**
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

1. Install HomeClaw from [homeclaw.cn](https://www.homeclaw.cn/)
   ([install guide](https://www.homeclaw.cn/en/install/)):

```bash
git clone https://github.com/allenpeng0705/HomeClaw.git
cd HomeClaw
chmod +x install.sh && ./install.sh   # Mac/Linux
# Windows: .\install.ps1  or  install.bat
```

2. Start **HomeClaw Core** (EnvoyMesh does **not** start it):

```bash
python -m main start
# or Portal UI:
python -m main portal   # → http://127.0.0.1:18472
```

3. Start the **EnvoyMesh home node** with Ext Agent / bridge enabled
   (HomeClaw selected → `http://127.0.0.1:8010/message`).
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

### Autostart (Phase 55E)

**Default on.** On the first Ext Agent chat ask, EnvoyMesh probe-first
checks `GET :8642/v1/models`. If Hermes is already healthy (your own
`hermes gateway run` / service), it reuses that gateway — no second
spawn. If the core is down and the `hermes` CLI is on `$PATH`, it
lazily spawns `hermes gateway run` and respawns on crash via the 55A
`DaemonSupervisor`. Install-missing surfaces the same Install card as
codex / claudecode (55A.1 + 55D.1).

Force HTTP-only (never spawn) with
`ENVOYMESH_EXT_AGENT_AUTOSTART=0` (aliases: `false` / `no` / `off`).

**Project folder:** Settings / chat project folder for Hermes is used
as spawn `cwd` when EnvoyMesh starts the daemon. An already-running
external gateway ignores that cwd.

**Caveats**:
- Prefer letting probe-first reuse an existing gateway; only force-off
  autostart if you never want the node to spawn Hermes.

### Minimal checklist

- [ ] `API_SERVER_ENABLED=true` + `API_SERVER_KEY=<secret>` in Hermes `.env` (`hermes config env-path`)
- [ ] `HERMES_API_KEY=<same secret>` on the EnvoyMesh node (or `HERMES_ENV_FILE` / shared `HERMES_HOME`)
- [ ] `hermes gateway run` (or installed service) is running — **or** let autostart spawn it when the CLI is installed
- [ ] `curl -H "Authorization: Bearer …" http://127.0.0.1:8642/v1/models` works (after gateway is up)
- [ ] EnvoyMesh Ext Agent = Hermes, bridge enabled
- [ ] Log line `[ext-agent:hermes] listening …:8020/message`
- [ ] Chat Ext Agent contact

---

## OpenHuman

EnvoyMesh auto-starts the `:8021/message` sidecar and talks to
**OpenHuman.app** on `:7788`. Keep the app running while you chat.

**Important:** OpenHuman.app’s per-launch `/rpc` bearer is **in-memory only**.
EnvoyMesh cannot discover it. Use the **stable `/v1` OpenAI-compatible API**
(automatic key; default).

```
Ext Agent chat
  → EnvoyMesh bridge
  → POST http://127.0.0.1:8021/message     (EnvoyMesh sidecar, auto-started)
  → OpenHuman.app :7788  (/v1/chat/completions)
  → POST http://127.0.0.1:<bridgePort>/bridge/send
  → reply in chat
```

### Ports

| Process | Port | Role |
|---------|------|------|
| EnvoyMesh bridge | `3031` (or `4031` with offset) | `POST /bridge/send` replies |
| EnvoyMesh OpenHuman sidecar | `8021` | EnvoyMesh `/message` contract |
| OpenHuman.app | `7788` | `/health`, `/v1/*` |

### Setup — OpenHuman.app

Keep OpenHuman.app running (it owns `http://127.0.0.1:7788`).

Install (macOS/Linux):

```bash
curl -fsSL https://raw.githubusercontent.com/tinyhumansai/openhuman/main/scripts/install.sh | bash
# then open OpenHuman.app and leave it running
```

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

### Token / key resolution (first hit wins)

**`/v1` key:** env → dotenv → `~/.envoymesh/openhuman.api-key` → OpenHuman
keychain/`dev-keychain.json` → auto-provision (unless
`OPENHUMAN_AUTO_PROVISION_API_KEY=0`)

**Transport:** prefer `OPENHUMAN_TRANSPORT=v1` with OpenHuman.app.

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
| `OPENHUMAN_TRANSPORT` | `v1` preferred | Force `v1` with OpenHuman.app |
| `OPENHUMAN_API_KEY` | unset | Stable `/v1` Bearer (usually auto) |
| `OPENHUMAN_API_KEY_FILE` | unset | Raw key file override |
| `OPENHUMAN_AUTO_PROVISION_API_KEY` | `1` | `0` = never write into OpenHuman’s store |
| `OPENHUMAN_API_MODEL` | `openhuman` | Model id for `/v1/chat/completions` |
| `OPENHUMAN_ENV_FILE` / `OPENHUMAN_WORKSPACE` / `OPENHUMAN_HOME` | unset | Discovery roots |
| `OPENHUMAN_APP_ENV` | unset | `staging` probes `~/.openhuman-staging` first |
| `ENVOYMESH_OPENHUMAN_PORT` | `8021` | Sidecar `/message` listen port |

### Verify

```bash
# Health (public) — OpenHuman.app must be running
curl -sS http://127.0.0.1:7788/health

# Sidecar (after OpenHuman selected + bridge on)
curl -sS http://127.0.0.1:8021/status

# /v1 (after auto-key or OPENHUMAN_API_KEY)
KEY="$(cat ~/.envoymesh/openhuman.api-key 2>/dev/null)"
curl -sS http://127.0.0.1:7788/v1/models \
  -H "Authorization: Bearer $KEY"
```

### Minimal checklist

- [ ] OpenHuman.app installed and **running**
- [ ] EnvoyMesh Ext Agent = OpenHuman, bridge enabled
- [ ] Log: `[ext-agent:openhuman] listening …:8021/message`
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

## Cursor CLI (Phase 56A)

Anysphere's [Cursor CLI](https://docs.cursor.com/en/cli) is a long-running
coding agent driven by the `cursor-agent` binary. EnvoyMesh wraps it in
the same **one-shot subprocess per ask** pattern as the other Phase 56
agents (shared `OneShotCliBackend` base). Each `ask(text)` spawns:

```
cursor-agent --print --output-format json --trust [--workspace <w>] <prompt>
```

`--print` is required for non-interactive / scripted use. `--output-format
json` is the machine-readable shape (plain text if parsing fails).

### Install

```bash
curl https://cursor.com/install -fsS | bash
cursor-agent --version
```

Default install path: `~/.cursor/bin/` — add it to `$PATH` if the
installer didn't.

### Auth

First run opens a browser for OAuth login. No terminal API-key prompt.
The login state is persisted in `~/.config/cursor/`; subsequent
`ask()` calls don't re-prompt.

### Ports

- EnvoyMesh sidecar: `http://127.0.0.1:8025/message` (override with
  `ENVOYMESH_CURSOR_PORT=…`)

### Env

No required env vars. The OAuth login state is filesystem-resident.

### Minimal checklist

- [ ] `cursor-agent --version` exits 0
- [ ] First `ask()` triggers a browser login (one-time)
- [ ] EnvoyMesh Ext Agent = Cursor CLI, bridge enabled
- [ ] Log: `[ext-agent:cursor] install missing` is **not** present
- [ ] Chat Ext Agent contact

---

## Aider (Phase 56B)

[Aider](https://aider.chat/) is Paul Gauthier's open-source terminal pair
programmer. EnvoyMesh drives it in one-shot mode (`aider --message`)
via a supervised subprocess. The chat-bridge contract disables ALL git
operations — Aider cannot commit on the user's behalf from the chat
panel.

Wire per `ask(text)`:

```
aider --message <text> --no-pretty --no-git --yes-always [--model …]
```

| Flag | Why we always pass it |
|------|------------------------|
| `--message <text>` | one-shot mode (default is interactive REPL) |
| `--no-pretty` | strips ANSI color codes from stdout |
| `--no-git` | disables ALL git operations (no auto-commit, no diff, no version checks) |
| `--yes-always` | auto-accepts any prompts Aider would raise in non-TTY contexts |

### Install

EnvoyMesh must find the `aider` binary from the **home node** process
(often without your conda/venv activated). Prefer a user-global install:

```bash
# Preferred — installs to ~/.local/bin (visible to EnvoyMesh)
uv tool install aider-chat

# Alternative
pip install --user aider-chat

which aider && aider --version
# Then restart the EnvoyMesh home node
```

**Avoid** installing only into an activated conda/venv unless that
`aider` is also on PATH for the home node. If you already have a
conda install:

```bash
conda activate <env>          # where aider lives
ln -sf "$(which aider)" ~/.local/bin/aider
aider --version
```

Common Anaconda/Miniconda env bins are auto-scanned as a fallback, but
a `~/.local/bin` install is more reliable.

### Auth

Set the API key in the **home-node** environment (the process EnvoyMesh
runs as), not only in an interactive terminal:

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # Claude (recommended)
# or
export OPENAI_API_KEY=sk-...         # GPT-4o / o3-mini
# or
export DEEPSEEK_API_KEY=...          # DeepSeek (cheaper, also supported)
```

Then restart the home node so Ext Agent inherits the key. Aider
auto-detects the key by env var name. Pick a model with
`aider --model anthropic/claude-sonnet-4-20250514` (set in
`ext-agent-adapter` extraArgs or per-session).

### Ports

- EnvoyMesh sidecar: `http://127.0.0.1:8026/message` (override with
  `ENVOYMESH_AIDER_PORT=…`)

### Env

- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` —
  one of these is required.

### Minimal checklist

- [ ] `aider --version` exits 0
- [ ] At least one provider API key is set
- [ ] EnvoyMesh Ext Agent = Aider, bridge enabled
- [ ] Log: `[ext-agent:aider] install missing` is **not** present
- [ ] Chat Ext Agent contact
- [ ] Aider does **not** auto-commit (verify with `git status` in the
      working dir after an ask)

---

## MMX-CLI (Phase 56C)

[MiniMax's MMX-CLI](https://github.com/MiniMax-AI/cli) (`mmx`) is a CLI
*built for AI agents* — clean `--output json` output, semantic exit
codes, async non-blocking. EnvoyMesh drives it as a one-shot subprocess
per ask.

Wire per `ask(text)`:

```
mmx text chat --message <text> --output json [--model MiniMax-M3]
```

Output shape (mmx 1.x `--output json` — MiniMax Messages API):

```json
{
  "id": "…",
  "type": "message",
  "role": "assistant",
  "model": "MiniMax-M3",
  "content": [{ "type": "text", "text": "the assistant response" }],
  "usage": { "input_tokens": 36, "output_tokens": 10 }
}
```

The backend joins `content[].text` blocks. Older flat shapes
(`{ "text": "…" }` / `response` / `output` / `message`) still work.

### Install

```bash
npm install -g mmx-cli
# or
npx skills add MiniMax-AI/cli -y -g
mmx --version
```

### Auth

```bash
mmx auth login --api-key sk-xxxx
# saves to ~/.mmx/config.json
```

Region is **auto-detected** from the API key prefix:
- `sk-…` → global (`api.minimax.io`)
- `eyJ…` (JWT, China region) → CN (`api.minimaxi.com`)

OAuth via `mmx auth login` (browser) is also supported.

### Ports

- EnvoyMesh sidecar: `http://127.0.0.1:8027/message` (override with
  `ENVOYMESH_MMX_PORT=…`)

### Env

No required env vars if `mmx auth login` was run. To override per
process (CI / container), set `MINIMAX_API_KEY=<key>`.

### Models

Default: `MiniMax-M2.7`. Override with `--model MiniMax-M3` (or
`MiniMax-M2.7-highspeed` for lower latency) via the ext-agent
`extraArgs` path or per-session override.

### Minimal checklist

- [ ] `mmx --version` exits 0
- [ ] `mmx auth status` shows "logged in"
- [ ] EnvoyMesh Ext Agent = MMX-CLI, bridge enabled
- [ ] Log: `[ext-agent:mmx] install missing` is **not** present
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
| `homeclaw` | HomeClaw (Core) | `git clone …/HomeClaw.git && cd HomeClaw && ./install.sh` | `curl -sS http://127.0.0.1:8010/status` | <https://www.homeclaw.cn/> |
| `codex` | `codex` | `npm install -g @openai/codex` | `codex --version` | <https://github.com/openai/codex> |
| `claudecode` | `claude` | `npm install -g @anthropic-ai/claude-code` | `claude --version` | <https://docs.claude.com/en/docs/claude-code> |
| `hermes` | `hermes` | `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh \| bash` | `hermes --version` | <https://hermes-agent.nousresearch.com/docs> |
| `openhuman` | `openhuman` / app | `curl -fsSL …/install.sh \| bash` (desktop app) | Launch OpenHuman.app; `curl :7788/health` | <https://tinyhumans.ai/openhuman> |
| `cursor` (56A) | `cursor-agent` | `curl https://cursor.com/install -fsS \| bash` | `cursor-agent --version` | <https://docs.cursor.com/en/cli> |
| `aider` (56B) | `aider` | `uv tool install aider-chat` | `aider --version` | <https://aider.chat/docs/> |
| `mmx` (56C) | `mmx` | `npm install -g mmx-cli` | `mmx --version` | <https://github.com/MiniMax-AI/cli> |

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
when the guide is non-empty. Built-in Pi keeps `installed: true`
(card hidden). HomeClaw ships the website install/start recipe
(`./install.sh` → `python -m main start` → `:8010/status`).

### Shared card

`apps/social/src/components/ExtAgentInstallGuideCard.tsx`. Same
component used in all three places. Renders the install command
(with a Copy-to-clipboard that flips to "Copied" for 1.5s), verify
command, install docs link, 2-4 `commonIssues` bullets, and
optional Retry / Dismiss buttons.

---

## Per-agent common issues (Phase 56 detailed)

This section expands the high-level troubleshooting table below
with the per-agent "common issues" data shipped in
`packages/api/src/ext-agent.ts:INSTALL_TABLE.commonIssues` (the
same list rendered by the Settings UI Install Required card).

### Cursor CLI (Phase 56A)

- **First run opens a browser for OAuth login** — there is no
  terminal API-key prompt. Run `cursor-agent login` once
  interactively to persist the OAuth session to `~/.config/cursor/`.
- **`cursor-agent --version` fails** — the install path (default
  `~/.cursor/bin`) may not be on `$PATH`. Add it to your shell rc
  and re-source it.
- **Node.js version** — Cursor CLI requires Node 18+; verify with
  `node --version`.

### Aider (Phase 56B)

- **Missing API key** — set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
  in your shell before running Aider. Aider auto-detects by env
  var name.
- **First run is slow** — Aider creates a Python venv + downloads
  the model spec on first use. The chat-bridge has a 120s timeout
  by default; bump `ENVOYMESH_AIDER_REQUEST_TIMEOUT_MS=180000` if
  the first call exceeds it.
- **Aider version is too old** — `aider --version` should be ≥0.70
  for the `--no-pretty` flag to exist. Update with
  `python -m pip install aider-chat --upgrade`.
- **`aider` works in a conda shell but Ext Agent says install** —
  prefer `uv tool install aider-chat` or symlink:
  `ln -sf "$(which aider)" ~/.local/bin/aider` while the env is
  active, then restart the home node. Common conda env bins are
  auto-scanned as a fallback only.
- **Aider is editing files in the working dir** — the chat-bridge
  forces `--no-git` and `--yes-always`; if you see diffs being
  applied, the safety flags are being overridden. Report this as
  a bug; the safety-flag ordering is load-bearing (last in argv,
  so they always win).
- **Python version** — Aider requires Python 3.8+; verify with
  `python --version`.

### MMX-CLI (Phase 56C)

- **Run `mmx auth login --api-key sk-xxxx`** to authenticate;
  OAuth (browser-based) is also supported. The key is saved to
  `~/.mmx/config.json`.
- **Region is auto-detected** by the CLI from the API key prefix
  (global vs CN). No env var needed.
- **Node.js version** — MMX-CLI requires Node 18+; verify with
  `node --version`.
- **`mmx` says "rate limit" or HTTP 1305** — Token plan exhausted.
  Wait for the next billing window or upgrade at
  <https://platform.minimaxi.com/subscribe/token-plan>.
- **MMX-CLI version is too old** — `--output json` was added in a
  later release. Update: `npm install -g mmx-cli@latest`.

### Codex (Phase 55B)

- **Set `OPENAI_API_KEY`** in your shell before running codex. The
  supervisor's first healthcheck fails without it, surfacing
  `installState: "unknown"`.
- **Codex CLI requires Node 18+**; verify with `node --version`.
- **Codex app-server crashes repeatedly** — the supervisor emits
  `crash.stuck` after 5 restarts in 5 minutes. Check the logs
  (`[ext-agent:codex:stderr]`) for the actual failure cause;
  common ones are invalid API key, quota exceeded, or a CLI
  version that's too old for the JSON-RPC schema we speak.

### Claude Code (Phase 55C)

- **Set `ANTHROPIC_API_KEY`** in your shell before running Claude
  Code. `probe()` returns `false` without it.
- **Claude Code binary is `claude`**, not `claudecode`. The
  package is `@anthropic-ai/claude-code`; install via
  `npm i -g @anthropic-ai/claude-code`.
- **Claude Code requires Node 18+**; verify with `node --version`.
- **The Ext Agent chat-bridge disables all tools** (`allowedTools:
  []`) by default. If you want tool-calling, use the `claude` CLI
  directly, not Ext Agent.

### Hermes (Phase 55 + 55E)

- **Set `API_SERVER_ENABLED=true` and `API_SERVER_KEY`** in your
  Hermes config (e.g. `~/.hermes/.env`).
- **Hermes health endpoint**: `GET http://127.0.0.1:8642/v1/models`.
  If this returns 401, the key is wrong.
- **`hermes gateway run` fails to start** — check the config file
  for typos; the supervisor will retry on the next `ask()` (autostart
  is on by default; set `ENVOYMESH_EXT_AGENT_AUTOSTART=0` to disable
  spawn) or you can start the daemon manually.
- **Project folder** applies as spawn `cwd` only when EnvoyMesh
  starts Hermes; an already-running gateway ignores it.

### OpenHuman

- **Open OpenHuman.app and keep it running** on `:7788`.
- Prefer `/v1` auto-key (EnvoyMesh provisions when needed).
- Health: `GET http://127.0.0.1:7788/health`.
- OpenHuman.app’s per-launch `/rpc` token is in-memory only — use `/v1`.

### Pi (built-in)

- **Pi is built into full desktop installs.** If chat stays silent,
  reinstall a full build (Pi sidecar staged) and confirm Settings
  → AI has a real model (not mock/disabled).
- **Slim / CI-incomplete DMGs have no Pi CLI** under `resources/pi`.
  The `probe()` returns `false` in that case.

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
| Delivered, no reply (OpenHuman) | OpenHuman.app not running / auth | Open OpenHuman.app; use `/v1` auto-key |
| OpenHuman: `401` / missing bearer | Stale `/v1` creds | Restart OpenHuman.app after auto-provision |
| Settings shows "Install required" for codex / claudecode | CLI not on `$PATH` | Run the install command shown on the card, then click **Retry** |
| Ext Agent picker: codex / claudecode not in the list | Bridge off or wrong agent preset | Settings → AI → Ext Agent; bridge must be enabled; presets are additive (no `bridge-config.json` migration needed) |
| `codex app-server` crashes repeatedly | `OPENAI_API_KEY` invalid / CLI version too old | Verify `codex --version`; rotate key; supervisor will surface `crash.stuck` after 5 restarts/5 min |
| `claude --version` missing in PATH | Package not installed / wrong binary | `npm i -g @anthropic-ai/claude-code`; the binary is `claude`, not `claudecode` |
| Chat switcher opens install modal after picking an agent | Binary is missing / install state is `unknown` | Run the install command from the card, then click **Retry**. The dialog auto-closes when the agent is reachable. |
| `EADDRINUSE` on the Hermes port when autostart is enabled | A separate daemon is already bound to the port | Prefer probe-first reuse; set `ENVOYMESH_EXT_AGENT_AUTOSTART=0` if you only run an external gateway |
| `hermes: not found` in node logs (autostart spawn) | Binary isn't on `$PATH` | Run the Hermes install command; the supervisor will retry on the next `ask()` |
| Chat switcher shows 3s toast, no modal | Binary is installed but the daemon is down | Start the agent's daemon (e.g. `codex app-server`, `hermes gateway run`, or OpenHuman.app); the toast is informational. |
| `bridge unreachable` in sidecar log | Wrong bridge port | Match `ENVOYMESH_BRIDGE_PORT` (e.g. `4031`) |
| Sidecar not listening | Bridge off or wrong agent | Enable bridge; select Hermes/OpenHuman/Codex/Claude Code |
| Port in use | Another process on `8010`/`8020`/`8021`/`8023`/`8024` | Stop old process / set `ENVOYMESH_*_PORT` (e.g. `ENVOYMESH_CODEX_PORT`) |
| Hermes API works but sidecar errors | Node not restarted / wrong `HERMES_API_BASE` | Restart home node; check env |
| `cursor-agent` prompts open a browser on every ask | First-run login state not persisted | Run `cursor-agent login` once interactively to save the OAuth session to `~/.config/cursor/` |
| `aider` hangs on the first ask | First run creates a Python venv + downloads the model spec | Bump `requestTimeoutMs` to 180_000+ for the first call; subsequent calls are fast |
| `aider` is editing files in the working dir | The chat-bridge disabled `--no-git` somewhere | Verify `[ext-agent:aider] buildArgs` includes `--no-git --no-pretty --yes-always`; the chat-bridge must never auto-commit |
| `mmx` returns `auth failed: invalid API key` | Key not registered with the CLI | Run `mmx auth login --api-key sk-xxxx` and re-try |
| `mmx --output json` returns text instead of JSON | Old CLI version (pre-1.0) — `--output json` was added later | Update: `npm install -g mmx-cli@latest` |
| `mmx` says "request failed: 1305" (rate limit) | Token plan exhausted | Wait for next billing window or upgrade at <https://platform.minimaxi.com/subscribe/token-plan> |

Node log markers:

- `[sendChat] self-send … routing via bridge handler`
- `[bridge] forwardToAgent: POST http://127.0.0.1:8020/message …` (or `8010` / `8021` / `8023` / `8024` / `8025` / `8026` / `8027`)
- `[ext-agent:hermes] reply sent to …` / `[ext-agent:openhuman] …` / `[ext-agent:codex] …` / `[ext-agent:claudecode] …` / `[ext-agent:cursor] …` / `[ext-agent:aider] …` / `[ext-agent:mmx] …`
- `[ext-agent:codex] install-missing: codex (spawn-enoent)` — CLI not on PATH (same pattern for cursor / aider / mmx)

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
