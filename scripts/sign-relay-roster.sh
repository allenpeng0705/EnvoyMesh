#!/usr/bin/env bash
# Sign a relay-roster JSON for Phase 46E publication.
#
# Usage:
#   export ENVOYMESH_RELAY_ROSTER_SIGNING_KEY_PEM="$(cat roster-signing-key.pem)"
#   node scripts/sign-relay-roster.mjs path/to/unsigned-or-signed.json > relay-roster.json
#
# The input may be unsigned (no signature field) or previously signed (re-sign).
# Output is the full signed document on stdout.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/sign-relay-roster.mjs" "$@"
