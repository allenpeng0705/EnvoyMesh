# Ext Agent — getting started (operators)

This guide is for **home node owners** who want to connect HomeClaw, Hermes, or OpenHuman to EnvoyMesh **without being a developer**. Technical details live in [agent_bridge_guide.md](./agent_bridge_guide.md).

You can also read these steps inside the app: **Settings → AI → AI Engine → How to install & run external agents**. The guide follows your language setting (English, 中文, 한국어, 日本語, Français, Deutsch, Italiano).

---

## How it works (30 seconds)

1. **EnvoyMesh home node** runs on your computer and forwards chat to one external program at a time.
2. That program (**HomeClaw**, **Hermes**, etc.) must be **running on the same computer**.
3. In **Settings → AI → AI Engine**, pick the active backend. **Status** should show **Running** (green).
4. If it shows **Stopped**, start the agent using the steps below, then click **Refresh status**.

---

## Before you start

| Item | What you need |
|------|----------------|
| **Same machine** | The external agent and EnvoyMesh home node run on one computer (not on your phone alone). |
| **Registry file** | `bridge-config.json` in your node profile folder lists which agents are available. |
| **Example file** | Copy from `apps/node/data/default/bridge-config.multi-agent.example.json` in your EnvoyMesh install. |

After editing `bridge-config.json`, reopen **Settings → AI** or restart the home node.

---

## HomeClaw (recommended for everyday chat)

**Port:** 8010 · **Best for:** normal chat and assistant replies

### Install

1. Install **HomeClaw** on this computer (see the HomeClaw project documentation).
2. In HomeClaw, enable the **EnvoyMesh** (mesh) channel.
3. Set the channel port to **8010** (default).

### Run

1. Start HomeClaw and leave it running.
2. In EnvoyMesh: **Settings → AI → AI Engine**.
3. Choose **HomeClaw** in the **Active backend** dropdown.
4. Wait up to 30 seconds — **Status** should show **Running**, badge **Reachable**.

### Check

- Send a message to the Ext Agent thread in chat or from EnvoyGo on your phone.

---

## Hermes

**Port:** 8020 · **Best for:** alternative assistant

EnvoyMesh **starts the connection helper automatically** when you select Hermes — you do not need to open Terminal.

### Install

1. Install **Hermes** on this computer (same machine as the home node).

### Connect (in the app)

1. Open **Settings → AI → AI Engine**.
2. Turn on **External Agent Bridge** if it is off.
3. Choose **Hermes** in **Active backend**.
4. Click **Refresh status** — Hermes should show **Running** within a few seconds.

### Check

- Send a message to the Ext Agent thread in chat.
- If the Hermes CLI is not on your PATH yet, replies may look like `[Hermes echo] your message` until Hermes is fully wired.

### Advanced (developers)

Manual sidecar control and `HERMES_CMD` customization: [tools/ext-agent-adapters/hermes/README.md](../tools/ext-agent-adapters/hermes/README.md).

---

## OpenHuman

**Port:** 8021 · **Best for:** users who already use OpenHuman desktop

### Install

1. Install and open **OpenHuman** on this computer.

### Run (test helper)

1. Open Terminal in the EnvoyMesh folder.
2. Run:

```bash
node tools/ext-agent-adapters/openhuman/server.mjs
```

3. Leave the window open; select **OpenHuman** in Settings → AI → AI Engine.

Live OpenHuman chat (not echo) needs `OPENHUMAN_RPC_URL` pointing at OpenHuman’s local helper — see [openhuman/README.md](../tools/ext-agent-adapters/openhuman/README.md).

---

## Switching agents

1. **Settings → AI → AI Engine**
2. Use the **Active backend** dropdown (no need to click Configure).
3. Only agents with **Running** status will reply reliably — start the program first if **Stopped**.

---

## Troubleshooting

| Problem | What to do |
|---------|------------|
| **Status: Stopped** | Start that agent’s program (see sections above). Click **Refresh status**. |
| **Unreachable badge** | Active backend is not responding on its port. Check firewall allows **local** (127.0.0.1) connections. |
| **Agent not in dropdown** | Add it to `bridge-config.json` under `extAgents`, set `"enabled": true`. |
| **Port in use** | Close duplicate Terminal windows running the same helper, or change `PORT=8023 node …` and update the `url` in `bridge-config.json`. |
| **401 errors** | `secret` in `bridge-config.json` must match what the agent sends to `/bridge/send`. |

---

## Where to get help

| Topic | Document |
|-------|----------|
| Wire protocol | [envoymesh-bridge-protocol.md](./envoymesh-bridge-protocol.md) |
| Multi-agent registry | [agent_bridge_guide.md § Multi-agent registry](./agent_bridge_guide.md#multi-agent-registry-phase-44) |
| Sidecar source | [tools/ext-agent-adapters/](../tools/ext-agent-adapters/) |
| Pi coding harness (developers) | [tools/ext-agent-adapters/pi/README.md](../tools/ext-agent-adapters/pi/README.md) — add `"pi"` to `bridge-config.json` first; not a general chat agent |
