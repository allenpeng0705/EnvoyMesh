# EnvoyMesh channel for OpenClaw

OpenClaw side of the EnvoyMesh **P2P bridge** (Phase 9K). This folder is the **canonical source** in the EnvoyMesh repo. It does not replace HomeClaw’s `channels/envoymesh` — both use the same HTTP wire format; you pick one external agent per bridge.

**Full guide:** [docs/agent_bridge_guide.md](../docs/agent_bridge_guide.md) (overview) · [docs/openclaw-extension.md](../docs/openclaw-extension.md) (OpenClaw setup)

## Install into OpenClaw

From the EnvoyMesh repo root:

```bash
./scripts/install-openclaw-extension.sh /path/to/openclaw --with-docs
```

Or manually:

```bash
cp -R OpenClawExtension /path/to/openclaw/extensions/envoymesh
cd /path/to/openclaw && pnpm install
```

Then configure OpenClaw and EnvoyMesh as in the doc above and restart the OpenClaw Gateway.

## Examples

- `examples/openclaw-channels.envoymesh.json5` — OpenClaw config fragment
- EnvoyMesh node: `apps/node/data/default/bridge-config.openclaw.example.json`

## EnvoyMesh-side contract test

```bash
# From EnvoyMesh repo root (mocks OpenClaw webhook + /bridge/send loop)
npx vitest run apps/node/test/bridge-openclaw-agent-mock.test.ts
```

## Tests (run inside OpenClaw)

After copying the extension:

```bash
cd /path/to/openclaw
node scripts/run-vitest.mjs run extensions/envoymesh/src
```

## Layout

Same structure as other OpenClaw bundled channels (`extensions/synology-chat`):

- `index.ts` — plugin entry
- `src/channel.ts` — ChannelPlugin + gateway webhook
- `src/webhook-handler.ts` — inbound JSON from EnvoyMesh bridge
- `src/bridge-client.ts` — outbound `POST /bridge/send`
