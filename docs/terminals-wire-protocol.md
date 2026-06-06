# Terminal PTY WebSocket wire protocol (v1)

Slice 1 uses a dedicated WebSocket endpoint on the home node, separate from JSON-RPC (`:3030/ws`).

## Endpoint

```
ws://127.0.0.1:3031/ws/terminal/{sessionId}?token={attachToken}
```

- `{sessionId}` — UUID from `createTerminalSession` / `listTerminalSessions`
- `{attachToken}` — short-lived token from `terminalAttach` JSON-RPC
- **Loopback only (v1):** server accepts connections from `127.0.0.1` / `::1` only
- Mobile remote (Slice 2) will tunnel the same binary frames via HomeRemote

## Attach flow

1. Client calls `terminalAttach({ sessionId, cols?, rows? })` over JSON-RPC
2. Server returns `{ wsUrl, token, sessionId, cols, rows }`
3. Client opens `wsUrl` and sends/receives binary frames below
4. On connect, server sends buffered scrollback as `stdout` frames, then live PTY output

## Binary frame format

All frames:

| Offset | Size | Field |
|--------|------|-------|
| 0 | 1 | `version` — must be `1` |
| 1 | 1 | `type` — see below |
| 2 | N | `payload` — type-specific |

### Frame types

| Type | Value | Direction | Payload |
|------|-------|-----------|---------|
| `stdin` | 0 | client → server | raw bytes written to PTY stdin |
| `stdout` | 1 | server → client | raw PTY output (includes scrollback on attach) |
| `resize` | 2 | client → server | `cols` u16 BE, `rows` u16 BE (4 bytes) |
| `exit` | 3 | server → client | `exitCode` i32 BE (4 bytes) |
| `ping` | 4 | either | empty — keepalive |
| `pong` | 5 | either | empty — keepalive reply |

Invalid version or type → server closes the socket.

## Auth

- Attach token is bound to `sessionId`, TTL **10 minutes**, reusable for reconnect within TTL (herdr-style detach/reattach)
- Token is issued only via authenticated JSON-RPC on loopback (Social UI / Tauri)
- Slice 2 adds `sessionToken` validation for paired mobile clients on home `homeTerminalWsOpen`

## Mobile remote (Slice 2)

When paired via relay proxy, mobile calls `homeTerminalWsOpen` over JSON-RPC; the home node bridges to loopback `/ws/terminal/...` and pushes `homeTerminalWs:rx` events with `{ dataBase64 }` (same binary frames, base64-wrapped).

- Codec: `@envoymesh/api` → `terminal-wire.ts`
- Server: `apps/node/src/terminal-ws-server.ts`
- Manager: `apps/node/src/terminal-manager.ts`
