# EnvoyMesh Node Discovery Guide

This document explains how EnvoyMesh nodes discover each other, what "healthy" discovery looks like, and how to debug failures.

## Discovery Model At A Glance

EnvoyMesh discovery is layered:

1. **LAN-first discovery (fast path)** via mDNS.
2. **WAN-capable discovery (fallback path)** via bootstrap peers + DHT + relay stack.
3. **Identity-level continuity** via verified `system.signal` and local owner-to-peer mapping.
4. **Operational observability** via audit `p2p.trace`, CLI `connectivity-status`, and Dashboard Discovery Health.

The goal is resilience: local networks should connect quickly, while non-LAN environments should still converge through the WAN stack.

## Discovery Profiles

EnvoyMesh supports profile-level defaults:

- `lan-fast` (default)
  - Optimized for same-LAN testing and local development.
  - mDNS enabled by default.

- `wan-default`
  - Optimized for non-LAN and unstable mDNS environments.
  - Enables:
    - DHT client mode
    - Circuit relay transport
    - AutoNAT
    - DCUtR

Set profile with:

```bash
--discovery-profile lan-fast
--discovery-profile wan-default
```

Or environment variable:

```bash
ENVOYMESH_DISCOVERY_PROFILE=wan-default
```

Or node config YAML:

```yaml
discovery:
  profile: wan-default
```

## Bootstrap Peers And Presets

WAN discovery needs at least one reachable bootstrap/relay source.

You can provide peers directly:

```bash
--bootstrap "<multiaddr>"
```

Or use managed presets:

```bash
--bootstrap-preset public-libp2p
--bootstrap-preset public-libp2p-am6
--bootstrap-preset public-libp2p-am7
```

Or environment variables:

```bash
ENVOYMESH_BOOTSTRAP_PEERS="<addr1>,<addr2>"
ENVOYMESH_BOOTSTRAP_PRESETS="public-libp2p,public-libp2p-am6,public-libp2p-am7"
```

Or node config YAML:

```yaml
discovery:
  bootstrapPresets:
    - public-libp2p
    - public-libp2p-am6
    - public-libp2p-am7
  bootstrapPeers:
    - "<addr1>"
    - "<addr2>"
```

EnvoyMesh deduplicates peers when combining env values, repeated flags, and presets.

Built-in preset names:

- `public-libp2p`
- `public-libp2p-am6`
- `public-libp2p-am7`

## Known-Good Seed Persistence (Phase D Start)

EnvoyMesh also persists discovery seeds under each profile directory and reuses them on startup.

Seed sources include:

- manually configured bootstrap peers (`--bootstrap`)
- successful bootstrap probe targets
- multiaddrs observed from `peer:discovery` events
- listen addresses remembered from verified `system.signal` peer directory records

On startup, these sources are merged and deduplicated into an effective bootstrap set. This improves cold-start discovery after prior successful sessions, especially on non-LAN networks.

## Strict Connectivity Gate

Use strict startup mode when you want fail-fast behavior in WAN deployments:

```bash
--connectivity-strict
```

With this flag, startup fails if all bootstrap probes fail under `wan-default`.

Env override:

```bash
ENVOYMESH_CONNECTIVITY_STRICT=1
```

Or node config YAML:

```yaml
discovery:
  connectivityStrict: true
```

## Runtime Discovery Signals

At runtime, EnvoyMesh writes connectivity telemetry to audit as `p2p.trace` events, including:

- profile selection and discovery posture
- connectivity warnings
- discovered peers
- bootstrap probe success/failure
- periodic bootstrap reprobe success/failure (`connectivity.reprobe.ok` / `connectivity.reprobe.fail`)
- periodic health checkpoints

These traces power:

- CLI:
  - `npm run cli -w @envoymesh/node -- connectivity-status --profile "<profile>"`
- Dashboard:
  - Discovery Health panel (bootstrap/discovered/relay/warnings/checkpoint fields)

## End-To-End Discovery Flow

1. Node starts with `lan-fast` or `wan-default`.
2. Discovery modules initialize (mDNS and/or WAN stack).
3. Node attempts peer discovery through active mechanisms.
4. For `wan-default`, bootstrap probes are executed and recorded.
5. A discovered peer becomes dialable and traffic can flow (`system.signal`, `system.ping`, chat/task/data).
6. Verified `system.signal` helps stabilize addressing by owner identity over time.

## Recommended Startup Commands

LAN-focused:

```bash
npm run node:dev -- --profile ./data/primary --listen /ip4/0.0.0.0/tcp/0 --p2p-debug
```

WAN-focused:

```bash
npm run node:dev -- --profile ./data/primary --listen /ip4/0.0.0.0/tcp/0 --discovery-profile wan-default --bootstrap-preset public-libp2p --connectivity-strict --p2p-debug
```

## Common Failure Modes

1. **No reachable bootstrap peers**
   - Symptom: zero progress in WAN mode, strict mode startup failure.
   - Fix: add a known-good bootstrap/relay with `--bootstrap`.

2. **Firewall or NAT limits**
   - Symptom: discovery appears partial; dialing is unreliable.
   - Fix: permit outbound TCP, consider fixed listen ports, verify network policy.

3. **Stale multiaddrs**
   - Symptom: explicit sends fail after restart.
   - Fix: recopy current `Listening on:` address.

4. **Profile path mismatch**
   - Symptom: Dashboard/CLI appears empty while node logs activity.
   - Fix: use the same absolute profile path across node, CLI, and dashboard.

5. **mDNS-only expectation in non-LAN environments**
   - Symptom: works on LAN, fails across networks.
   - Fix: switch to `wan-default` + bootstrap/relay strategy.

## Validation Checklist

1. Start both nodes with intended discovery profile.
2. Run `connectivity-status` on each node profile.
3. Confirm non-zero bootstrap count (WAN mode).
4. Send `system.signal` and `system.ping`.
5. Send chat/task/data commands.
6. Verify audit rows, task updates, and dashboard Discovery Health.

## Related Docs

- [QuickStart](../QuickStart.md)
- [Live Connectivity Testing](./live-connectivity-testing.md)
- [Developer CLI](./developer-cli.md)
- [Desktop Dashboard](./desktop-dashboard.md)
