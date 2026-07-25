# Phase 48 interop smoke (MCP + A2A)

Operator checklist for the paths Claude Desktop / Cursor / A2A SDKs exercise.
Automated coverage lives in:

- `apps/node/test/mcp-stdio-live.test.ts` — live MCP stdio (consumer + server adapter)
- `apps/node/test/a2a-card-fetch-live.test.ts` — Agent Card HTTP fetch (+ optional public URL)

```bash
npx vitest run apps/node/test/mcp-stdio-live.test.ts apps/node/test/a2a-card-fetch-live.test.ts
```

Optional public card probe:

```bash
A2A_CARD_FETCH_URL=https://YOUR_RELAY:15432/.well-known/agent-card.json \
  npx vitest run apps/node/test/a2a-card-fetch-live.test.ts
```

---

## 1. Claude Desktop / Cursor MCP (48B)

Requires a running EnvoyMesh node with the bridge HTTP listener (default `http://127.0.0.1:3031`) and tools enabled.

### Config (`~/Library/Application Support/Claude/claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "envoymesh": {
      "command": "npx",
      "args": ["envoymesh", "mcp-server"],
      "env": {
        "ENVOYMESH_BRIDGE_SECRET": ""
      }
    }
  }
}
```

If the node sets `bridge.secret` / `ENVOYMESH_BRIDGE_SECRET`, either:

- put the same value in `env.ENVOYMESH_BRIDGE_SECRET`, or
- use `"args": ["envoymesh", "mcp-server", "--bridge-token", "YOUR_SECRET"]`.

Non-loopback bridge URL:

```json
"args": ["envoymesh", "mcp-server", "--bridge", "http://192.168.1.10:3031", "--bridge-allow-remote"]
```

### Manual checks

1. Restart Claude Desktop after editing the config.
2. Confirm **envoymesh** appears under MCP servers / tools.
3. Ask Claude to list tools — expect `mesh.*` entries from the home node.
4. Call a read-only tool (e.g. a mesh ping / list contacts tool your node exposes).
5. On the node, confirm audit / logs show `auditTag: "mcp-server"` for the call.

CLI equivalent of what Claude spawns:

```bash
npx envoymesh mcp-server --bridge http://127.0.0.1:3031
# or from repo:
npx tsx apps/node/src/mcp-server-adapter.ts --bridge http://127.0.0.1:3031
```

---

## 2. A2A Agent Card fetch (48C / 48D.5)

Relay must be started with A2A bridge enabled:

```bash
# example
ENVOYMESH_A2A_BRIDGE=1 ENVOYMESH_A2A_GATEWAY_URL=https://relay.example:15432 \
  npm run relay:dev -- --a2a-bridge --a2a-gateway-url https://relay.example:15432
```

```bash
curl -sS https://relay.example:15432/.well-known/agent-card.json | jq .
```

Expect:

- `capabilities.streaming: true`
- `metadata["x-envoymesh-taskBridgeStatus"]: "available"`
- optional `signatures[]` with `type: "envoymesh-ed25519"` (relay control identity)

JSON-RPC task path (bearer required):

```bash
curl -sS -X POST https://relay.example:15432/.well-known/a2a/jsonrpc \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tasks/get","params":{"id":"demo"}}'
```

Home tunnel must be up for `forwardToHome` to reach the node’s `POST /a2a/jsonrpc`.

---

## 3. FileArtifact vault fetch (48D.5)

File parts advertise `uri: <gateway>/vault/<encodedPath>?hash=…`.

- **Home bridge:** `GET http://127.0.0.1:3031/vault/…` (A2A bearer)
- **Public relay:** `GET https://relay/vault/…` proxies via home-tunnel to the home bridge

```bash
curl -sS -H "Authorization: Bearer A2A_TOKEN" \
  "http://127.0.0.1:3031/vault/$(python3 -c 'import urllib.parse; print(urllib.parse.quote(\"notes/hello.txt\", safe=\"\"))')"
```

Use a token from `a2aBridge.bearerTokens` in `node-config.json`. Optional `?hash=` must match the file’s sha256 (hex, base64url, or `sha256:`-prefixed).
