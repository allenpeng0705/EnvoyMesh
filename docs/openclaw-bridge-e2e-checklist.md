# OpenClaw + EnvoyMesh bridge — manual E2E checklist

**Setup overview:** [agent_bridge_guide.md](./agent_bridge_guide.md)

Use this after automated smokes pass:

```bash
npx vitest run apps/node/test/bridge-openclaw-agent-mock.test.ts
npm run smoke:openclaw-bridge
```

`smoke:openclaw-bridge` (also run in **ci-smoke-local** on every PR) spawns two processes: mock OpenClaw webhook + EnvoyMesh bridge. It does **not** start the full OpenClaw Gateway or libp2p node.

**Automated live Gateway** (real OpenClaw + bridge, smoke echo — no LLM):

```bash
cd /path/to/openclaw && pnpm install && pnpm build
export OPENCLAW_ROOT=/path/to/openclaw
npm run smoke:openclaw-bridge:live
```

Nightly CI: workflow `ci-smoke-openclaw-live` (checkout OpenClaw, build, then `smoke:openclaw-bridge:live`).

Use the steps below for full manual validation (bonded peer, agent replies, mesh tools).

**Prerequisite:** HomeClaw bridge left unchanged unless you intentionally switch `agentUrl`.

## A. Install

- [ ] `git clone` / pull EnvoyMesh and OpenClaw
- [ ] `./scripts/install-openclaw-extension.sh /path/to/openclaw --with-docs`
- [ ] `cd openclaw && pnpm install`
- [ ] EnvoyMesh: `npm install` (repo root)

## B. EnvoyMesh node

- [ ] Copy `apps/node/data/default/bridge-config.openclaw.example.json` → `~/.envoymesh/<profile>/bridge-config.json`
- [ ] Set `agentUrl` to `http://127.0.0.1:<gateway-port>/webhook/envoymesh`
- [ ] Set `secret` (optional but recommended)
- [ ] Start node; log shows `[bridge] HTTP on http://127.0.0.1:3031/bridge/send`
- [ ] Note bridge **agent peer id** (for addressing `chat.message`)

## C. OpenClaw Gateway

- [ ] Configure `channels.envoymesh` (see `docs/openclaw-extension.md` or `openclaw channels add`)
- [ ] `bridgeUrl` = `http://127.0.0.1:3031/bridge/send`
- [ ] `bridgeSecret` / `inboundSecret` match EnvoyMesh `secret`
- [ ] `allowedOwnerIds` includes a bonded peer’s `envoy:owner:…`
- [ ] Restart Gateway
- [ ] Log: `Registered EnvoyMesh HTTP route: /webhook/envoymesh`

## D. Chat round-trip

- [ ] From a **bonded** peer, send `chat.message` to the bridge agent peer id
- [ ] OpenClaw receives inbound (check Gateway / agent session)
- [ ] Agent reply appears on mesh as `chat.message` from the agent
- [ ] No duplicate messages (webhook HTTP body should not echo chat text for delivery)

## E. Mesh tools (optional)

- [ ] In OpenClaw agent session, run `envoymesh_list_mesh_tools`
- [ ] Run `envoymesh_execute_mesh_tool` with `mesh_listContacts` (or similar)
- [ ] Bridge audit / node logs show allow/deny as expected

## F. Async replies (optional)

- [ ] Trigger `knowledge.response` or `discovery.response` to the bridge agent
- [ ] OpenClaw shows `[EnvoyMesh async …]` style inbound
- [ ] Agent can follow up via chat or tools if needed

## G. Regression — HomeClaw (if still used)

- [ ] Restore `bridge-config.json` `agentUrl` → `http://localhost:8010/message`
- [ ] HomeClaw `channels/envoymesh` channel running
- [ ] One chat round-trip still works

## Troubleshooting

| Issue | Action |
|-------|--------|
| 401 inbound | Align `inboundSecret` and bridge `Authorization: Bearer` |
| 401 `/bridge/send` | Align `bridgeSecret` and `bridge-config.json` `secret` |
| 403 sender | Add peer `fromOwnerId` to `allowedOwnerIds` |
| No route | Gateway restart; `channels.envoymesh.enabled` |
| Reply routing error | Ensure inbound included `from` (peer id); reply `to` must be peer id |

## References

- [openclaw-extension.md](./openclaw-extension.md)
- [openclaw-agent-bridge-adr.md](./openclaw-agent-bridge-adr.md)
- `OpenClawExtension/docs/channels/envoymesh.md` (after `--with-docs` install)
