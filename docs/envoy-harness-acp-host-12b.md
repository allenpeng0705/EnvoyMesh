# envoy-harness ACP host (Phase G / 12b)

> Companion to envoy-harness
> [`packages/envoy-harness/docs/tauri-acp-host.md`](../../envoy-harness/packages/envoy-harness/docs/tauri-acp-host.md).

## Product constraints

1. **Simple UI** — reuse Pi chat panel + `pi:proposal` dock (no new surfaces).
2. **EnvoyGo compatible** — keep `sendToPi`, `getPiStatus`, `piRespondToProposal`,
   `pi:proposal`, push `pi_proposal`. Optional EnvoyGo UI mirrors Social's
   `codingBackend` switch; old apps omit the control but still honor Social.

## What landed

| Piece | Behavior |
|-------|----------|
| `piSettings.codingBackend` | `"pi"` (default) \| `"envoy-harness"` — Social **and** EnvoyGo Pi Agent settings |
| `sendToPi` | Routes to Pi sidecar **or** envoy-harness ACP |
| `getPiStatus` | Reports EH readiness when backend is envoy-harness (+ `codingBackend` field) |
| Permissions | Per-tool ACP → emit existing `pi:proposal`; answer via `piRespondToProposal` |
| Auto-run | `autoRunPolicy`: `off` never asks; `safe-only` auto-allows safe tools; `always-confirm` asks every tool |
| Social | Settings → AI → Coding backend; Terminal → **Chat** opens `PiChatPanel` |
| Pi TUI PTY | Still Pi-only (`ensurePiTerminalSession`) |

## EnvoyGo

**Additive UI (optional upgrade):** Me → Pi Agent → **Coding backend** writes the
same `piSettings.codingBackend` as Social. No new RPC.

**Old EnvoyGo (no upgrade):** still works. Switch from Social Settings → AI;
mobile `sendToPi` / `pi:proposal` / `piRespondToProposal` unchanged.
