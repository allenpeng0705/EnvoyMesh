#!/usr/bin/env bash
# Source or eval this file to export TEST_RELAY_ADDR for relay E2E tests.
#
# Usage:
#   source scripts/relay-e2e-env.sh              # use .env or running relay /info
#   source scripts/relay-e2e-env.sh --start      # start local relay first
#
# Then run tests, e.g.:
#   npx vitest run apps/node/test/relay-chat-e2e.test.ts
#   npm run test:e2e:relay

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELAY_PROFILE="${ENVOYMESH_RELAY_PROFILE:-$ROOT/data/test-relay-e2e}"
RELAY_PORT="${RELAY_PORT:-4001}"
RELAY_HTTP_PORT="${RELAY_HTTP_PORT:-8080}"
RELAY_ADVERTISE="${RELAY_ADVERTISE:-127.0.0.1}"

load_dotenv() {
  local env_file="$ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%#*}"
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -n "$line" ]] || continue
    [[ "$line" == *=* ]] || continue
    local key="${line%%=*}"
    local val="${line#*=}"
    val="${val#\"}"; val="${val%\"}"
    val="${val#\'}"; val="${val%\'}"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$val"
    fi
  done < "$env_file"
}

fetch_relay_addr_from_info() {
  curl -sf "http://127.0.0.1:${RELAY_HTTP_PORT}/info" \
    | node -e "
      let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{
        const j=JSON.parse(s);
        const addr=(j.addrs||[]).find(a=>a.includes('/ip4/127.0.0.1/'))||(j.addrs||[])[0];
        if(!addr) process.exit(1);
        process.stdout.write(addr);
      });
    "
}

start_local_relay() {
  if fetch_relay_addr_from_info >/dev/null 2>&1; then
    echo "[relay-e2e] relay already listening on port ${RELAY_PORT}"
    return 0
  fi
  echo "[relay-e2e] starting relay (profile=${RELAY_PROFILE})"
  "$ROOT/scripts/run-relay.sh" \
    --profile "$RELAY_PROFILE" \
    --port "$RELAY_PORT" \
    --advertise "$RELAY_ADVERTISE" \
    --http-port "$RELAY_HTTP_PORT" &
  local pid=$!
  for _ in $(seq 1 30); do
    if fetch_relay_addr_from_info >/dev/null 2>&1; then
      echo "[relay-e2e] relay ready (pid=${pid})"
      return 0
    fi
    sleep 1
  done
  echo "[relay-e2e] timed out waiting for relay /info" >&2
  return 1
}

if [[ "${1:-}" == "--start" ]]; then
  start_local_relay
fi

load_dotenv

if [[ -z "${TEST_RELAY_ADDR:-}" ]]; then
  if addr="$(fetch_relay_addr_from_info 2>/dev/null)"; then
    export TEST_RELAY_ADDR="$addr"
  fi
fi

if [[ -z "${TEST_RELAY_ADDR:-}" ]]; then
  echo "TEST_RELAY_ADDR is not set." >&2
  echo "Start a relay:" >&2
  echo "  ./scripts/run-relay.sh --profile ./data/test-relay-e2e --advertise 127.0.0.1 --http-port 8080" >&2
  echo "Or set TEST_RELAY_ADDR in .env (see .env.example)." >&2
  return 1 2>/dev/null || exit 1
fi

echo "TEST_RELAY_ADDR=${TEST_RELAY_ADDR}"
