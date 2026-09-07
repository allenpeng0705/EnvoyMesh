# Envoy mobile SDK — Level 1 & Level 2

Third-party Flutter/Dart apps integrate EnvoyMesh mobile capabilities in
**two encapsulation levels**. EnvoyGo itself is a Level-2 product app.

## Level 1 — Thin client only

**Package:** [`envoy_thin_client`](envoy-thin-client-dart/)

Your app pairs to a home node (QR / `envoy://pair`) and drives product
features over JSON-RPC. The home node owns mesh identity, bonds, vault, and
Social. The phone does not run a social mesh persona.

```
App ── envoy_thin_client ──► Home Node
```

**Use when:** remote UI for a desktop/home Envoy install; smallest deps.

## Level 2 — Thin client + separate mobile node

**Packages:**

| Package | Responsibility |
|---------|----------------|
| [`envoy_thin_client`](envoy-thin-client-dart/) | Home persona (unchanged L1) |
| [`envoy_mesh`](envoy-mesh-dart/) | Phone Envoy identity, EMP, `PhoneSocialBackend` |
| [`envoy_mesh_libp2p`](envoy-mesh-libp2p-dart/) | Shared libp2p host, mesh session, WAN/LAN discovery |

```
App
  ├─ envoy_thin_client     → Home Social / vault / terminals / …
  ├─ envoy_mesh            → Phone Social (bonds, hello, 1:1 chat store)
  └─ envoy_mesh_libp2p     → dial/listen, DHT, relay.checkin, mDNS
```

**Use when:** users need an independent “On this phone” social face that works
without (or alongside) a paired home, without merging the two contact graphs.

### Hard rules (Level 2)

1. **Shared libp2p PeerId**, separate phone Envoy owner/device PEMs.
2. **Paired / Home context** = thin client only (no phone-signed Home envelopes).
3. **No auto-merge** of Home ↔ phone bonds or chats (optional ownerId suggestions).
4. **Foreground discovery** — checkin/provide/mDNS only while phone Social is active and the app is open.

## Reference implementation

EnvoyGo (`apps/envoygo`) is Level 2: Riverpod UI + secure-storage seed adapter +
SQLite phone store. Prefer copying package APIs from the READMEs above rather
than forking EnvoyGo screens.

## Choosing a level

| Need | Level |
|------|------:|
| Pair + remote control home | 1 |
| Phone-only social mesh / LAN discover | 2 |
| Both Home and phone Social in one app | 2 |
| Background always-on mesh on phone | — (not supported; use home node) |
