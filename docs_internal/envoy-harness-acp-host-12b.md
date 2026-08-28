# Coding agents: Envoy Harness + Pi

> Historical Phase G / 12b note — product model updated (no shared `codingBackend` switch).

## Product model

| Surface | Engine |
|---------|--------|
| Coding chat (`EnvoyHarnessPanel`) | **Envoy Harness** (`startEnvoyHarnessTurn` / `askEnvoyHarness`) |
| Terminal | **Both** — Envoy TUI and Pi TUI |
| Ext Agent / `sendToPi` | **Pi** sidecar only |

Settings → AI shows two independent blocks (Envoy Harness auto-run; Pi enable / auto-run / model). There is no active-engine radio.

## RPCs

| RPC | Behavior |
|-----|----------|
| `sendToPi` / `sendToPiForExtAgent` | Always Pi |
| `getPiStatus` / `restartPi` | Always Pi sidecar |
| `getEnvoyHarnessStatus` / `setEnvoyHarnessAutoRunPolicy` | Envoy Harness |
| Permissions | EH and Pi each use their own auto-run / proposal flows |

## EnvoyGo

Me → Coding agents mirrors Social: Envoy Harness auto-run + Pi enable/model. No coding-backend switch.
