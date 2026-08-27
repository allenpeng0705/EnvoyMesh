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

echo "[agent-network-three-process-smoke] host=$(uname -s) arch=$(uname -m)"
echo "[agent-network-three-process-smoke] running Phase 60 three-process smoke (RUN_E2E=1)"

RUN_E2E=1 npx vitest run apps/node/test/agent-network-three-process-smoke.test.ts

echo "[agent-network-three-process-smoke] OK"
