#!/usr/bin/env bash
# Phase 60F — packaged three-process Agent Network smoke (release gate).
#
# Boots three in-process libp2p homes (assigner + two workers) and asserts
# Phase 60 lease wiring + Team-job completion. Does NOT replace the
# deterministic lab matrix (agent-network-lab-matrix.test.ts) — that suite
# remains the PR unit gate for leases / reconcile / speculation logic.
#
# Docs: docs/agent-network-three-process-smoke.md
#
# Usage:
#   bash scripts/agent-network-three-process-smoke.sh
#   npm run test:e2e:agent-network-three-process
#
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Phase 66 / 62 follow-up: if a live `node:dev` OpenClaw holds :18789, any
# accidental gateway spawn in this process would EADDRINUSE. Smokes mock the
# engine via wireMockTeamJobEngine; still shift ports so a stray spawn cannot
# fight the developer's home node.
export ENVOYMESH_PORT_OFFSET="${ENVOYMESH_PORT_OFFSET:-9000}"

echo "[agent-network-three-process-smoke] host=$(uname -s) arch=$(uname -m)"
echo "[agent-network-three-process-smoke] ENVOYMESH_PORT_OFFSET=${ENVOYMESH_PORT_OFFSET}"
echo "[agent-network-three-process-smoke] running Phase 60 three-process smoke (RUN_E2E=1)"

RUN_E2E=1 npx vitest run apps/node/test/agent-network-three-process-smoke.test.ts

echo "[agent-network-three-process-smoke] running Phase 64C remote-Assigner-kill chaos (RUN_E2E=1)"
RUN_E2E=1 npx vitest run apps/node/test/agent-network-remote-assigner-chaos-smoke.test.ts

echo "[agent-network-three-process-smoke] OK"
