# Agent Network — Phase 60 release checklist

Human sign-off companion to automated gates (`agent-network-lab-matrix.test.ts`,
`scripts/agent-network-three-process-smoke.sh`, `npm run test:dev`).

## Automated gates (CI / pre-tag)

| Gate | Command | Expect |
|------|---------|--------|
| Unit + typecheck | `npm run test:dev` | Green |
| Lab matrix (14 scenarios) | `npx vitest run apps/node/test/agent-network-lab-matrix.test.ts` | Green, no network |
| Three-process libp2p smoke | `bash scripts/agent-network-three-process-smoke.sh` | Leases + preview + award + report |
| Chain three-home (Phase 43) | `RUN_E2E=1 npx vitest run apps/node/test/chain-three-home-smoke.test.ts` | Optional when engines available |

## Per-OS smoke (manual)

Run on each target OS before a user-facing tag:

1. **macOS (Tauri primary)** — two or three homes on loopback; three-process script above.
2. **Linux** — same script in CI-like environment (Node 22+, no GUI required).
3. **Windows** — `scripts/agent-network-three-process-smoke.sh` via Git Bash or WSL; spot-check Social Team jobs start flow.

Record pass/fail + commit SHA in the release notes.

## Social + EnvoyGo spot-check

- [ ] **Settings → Agent Network → Test Agent Network** — readiness + dry-plan copy matches “no spend”; dry-plan shows ranked candidates when workers exist.
- [ ] **Team job start** — strategy hint mentions policy vs wire; worker cards show lease badge + “why ranked” when reasons exist.
- [ ] **Active job detail** — recovery badge + honesty line; speculative disagree banner offers pick / reassign when triggered.
- [ ] **EnvoyGo** — Test Agent Network card strings (en/zh); start flow strategy hint not over-promising dual workers.
- [ ] **Localization** — skim `en` / `zh` for Test AN and strategy strings (no developer jargon in headlines).

## Accessibility (spot-check)

- [ ] Test AN mode `<select>` and run button reachable by keyboard.
- [ ] Chain detail speculation review buttons have visible focus; pick/reassign actions announced via toast.
- [ ] High-contrast / reduced-motion: no new motion-only affordances (project defaults apply).

## Threat / privacy sign-off (human)

Automated unit coverage exists for lease spoof/replay/TTL, privacy-local gate, diagnostics redaction, speculative late-final retention. Before release, a human reviewer confirms:

- [ ] Lease accept path rejects wrong owner / stale sequence (spot-read `worker-lease-store` tests).
- [ ] Diagnostics export redacts peer IDs appropriately (`redactAgentNetworkDiagnosticsJson`).
- [ ] No raw model prompts in provenance summaries surfaced to non-owner clients.

## Deferred (not blocking 60.1)

- Chat → Team Job recruitment
- Richer cross-home handoff as default
- Broader autonomy without stronger sandbox
- Full hedged / verify-only wire paths (policy helpers only today)
