#!/usr/bin/env bash
# Generate (or rotate) Tauri updater signing keys.
#
# Writes:
#   ~/.tauri/envoymesh.key           — private (GitHub Secret TAURI_SIGNING_PRIVATE_KEY)
#   ~/.tauri/envoymesh.key.pub       — public (paste into tauri.conf*.json)
#   ~/.tauri/envoymesh.key.password  — password (GitHub Secret TAURI_SIGNING_PRIVATE_KEY_PASSWORD)
#
# Never commit these files. See docs/ota.md.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY_DIR="${TAURI_UPDATER_KEY_DIR:-$HOME/.tauri}"
KEY_PATH="${TAURI_UPDATER_KEY_PATH:-$KEY_DIR/envoymesh.key}"
PUB_PATH="${KEY_PATH}.pub"
PASS_PATH="${KEY_PATH}.password"
FORCE="${TAURI_UPDATER_FORCE:-0}"

mkdir -p "$(dirname "$KEY_PATH")"

if [[ -f "$KEY_PATH" || -f "$PUB_PATH" ]]; then
  if [[ "$FORCE" != "1" ]]; then
    echo "Refusing to overwrite existing key material:"
    echo "  private:  $KEY_PATH"
    echo "  public:   $PUB_PATH"
    echo "  password: $PASS_PATH"
    echo "Set TAURI_UPDATER_FORCE=1 to rotate (invalidates installs that trust the old pubkey)."
    exit 1
  fi
  rm -f "$KEY_PATH" "$PUB_PATH" "$PASS_PATH"
fi

if [[ -z "${TAURI_UPDATER_PASSWORD:-}" ]]; then
  TAURI_UPDATER_PASSWORD="$(openssl rand -base64 32)"
fi
printf '%s' "$TAURI_UPDATER_PASSWORD" > "$PASS_PATH"
chmod 600 "$PASS_PATH"

cd "$ROOT"
npm exec -w @envoymesh/tauri -- tauri signer generate --ci \
  -p "$TAURI_UPDATER_PASSWORD" \
  -w "$KEY_PATH"

if [[ ! -f "$PUB_PATH" ]]; then
  echo "Expected public key at $PUB_PATH after signer generate."
  exit 1
fi

PUB_CONTENTS="$(tr -d '\n\r' < "$PUB_PATH")"

echo ""
echo "=== Keypair created ==="
echo "  private:  $KEY_PATH"
echo "  public:   $PUB_PATH"
echo "  password: $PASS_PATH"
echo ""
echo "=== Paste public key into plugins.updater.pubkey ==="
echo "  apps/tauri/src-tauri/tauri.conf.json"
echo "  apps/tauri/src-tauri/tauri.conf.full.json"
echo "  apps/tauri/src-tauri/tauri.conf.slim.json"
echo ""
echo "  pubkey value:"
echo "  $PUB_CONTENTS"
echo ""
echo "=== GitHub Secrets ==="
echo "  gh secret set TAURI_SIGNING_PRIVATE_KEY --repo allenpeng0705/EnvoyMesh < \"$KEY_PATH\""
echo "  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo allenpeng0705/EnvoyMesh < \"$PASS_PATH\""
echo ""
echo "Rotating keys requires a new desktop build (new pubkey) + manual reinstall for old clients."
echo "See docs/ota.md."
