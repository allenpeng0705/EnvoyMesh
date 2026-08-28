# Fleet bootstrap (headless apply)

> **Who this is for:** operators who already know node WS URLs (and optionally
> identities) and want to wire a fleet from a **config file + script** instead
> of clicking through Social UI.
>
> Product model (bonds vs Join vs Team jobs): [`agent-network-guide.md`](./agent-network-guide.md)  
> UI playbook: [`agent-network-fleet.md`](./agent-network-fleet.md)  
> Wire schemas for Paths A–D: [`fleet-onboarding.md`](./fleet-onboarding.md)

## What this is

`fleet.yaml` / `fleet.json` describes:

1. **Shared settings** — Join Agent Network, LAN Auto-Bond token, optional bond autonomy
2. **Nodes** — each with a Social WS URL and a join method (`lan` | `manifest` | `invite` | `none`)
3. **Apply steps** — ordered RPC calls against running nodes

Then:

```bash
cp fleet.example.yaml fleet.yaml
# edit wsUrls / identities
export LAN_FLEET_TOKEN="$(openssl rand -hex 16)"
export SPONSOR_TOKEN="$(openssl rand -hex 16)"   # only if using bondAutonomy

npm run fleet:apply -- --file fleet.yaml --dry-run
npm run fleet:apply -- --file fleet.yaml
```

The script talks **existing** JSON-RPC methods (`updateNodeConfig`,
`createFleetManifest`, `importFleetManifest`, `createCompanyInvite`,
`redeemCompanyInvite`, `refreshAgentNetworkWorkers`, `getBonds`,
`listAgentCards`). No new P2P protocol.

## Prerequisites

- Each listed node is **running** and reachable at `rpc.wsUrl`
- Exactly **one** node has `role: sponsor`
- Secrets via env refs (`tokenRef`), not committed inline tokens
- For `join.method: manifest`, member identities must be known or
  `fetchIfMissing: true` (default) so apply can call `getProfile`

## Join methods (mix per node)

| method | What apply does |
|--------|-----------------|
| `lan` | Sets shared `lanAutoBond*` on nodes; relies on mDNS + token match |
| `manifest` | Sponsor `createFleetManifest`; each member (+ sponsor) `importFleetManifest` |
| `invite` | Sponsor `createCompanyInvite`; member `redeemCompanyInvite`; URIs written to JSON |
| `none` | Config patch only |

## Default steps

1. `ensureOnline` — `getProfile` until timeout  
2. `patchNodeConfig` — Join / LAN / autonomy / bootstrap  
3. `createOrImportManifest` — Path B for `manifest` members  
4. `mintInvites` / `redeemInvites` — Path A for `invite` members  
5. `refreshAgentNetworkWorkers` — cards + capability index  
6. `verifyRoster` — print bond / card / worker counts  

Override with `--steps patchNodeConfig,verifyRoster` or `apply.steps` in the file.

## Schema

Zod source: [`packages/api/src/fleet-bootstrap.ts`](../packages/api/src/fleet-bootstrap.ts)  
Example: [`fleet.example.yaml`](../fleet.example.yaml)

## Limits / non-goals

- Does **not** skip bonds; trust still comes from manifest / invite / LAN
- Does **not** start node processes for you
- Sponsor must have the owner private key available (for signing manifests)
- Social UI paths remain fully supported; this is an operator shortcut

## Related

| Piece | Path |
|-------|------|
| Apply script | `scripts/fleet-apply.ts` |
| npm entry | `npm run fleet:apply` |
| Unit tests | `packages/api/test/fleet-bootstrap.test.ts` |
