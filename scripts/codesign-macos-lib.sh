# Shared macOS codesign helpers (source from bash scripts — do not execute directly).
# Handles Apple timestamp server flakes with retry + --timestamp=none fallback.

codesign_macos_init() {
  CODESIGN_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
  CODESIGN_SIGNED=0
  CODESIGN_FAILED=0
  CODESIGN_NO_TIMESTAMP=0
  CODESIGN_MAX_ATTEMPTS="${CODESIGN_TIMESTAMP_RETRIES:-5}"
  CODESIGN_RETRY_SLEEP_SEC="${CODESIGN_TIMESTAMP_RETRY_SLEEP:-3}"
  CODESIGN_ALLOW_NO_TIMESTAMP="${CODESIGN_ALLOW_NO_TIMESTAMP:-1}"
}

codesign_macos_unlock_keychain() {
  # Best-effort — avoids silent failures when login keychain is locked.
  security unlock-keychain -u login.keychain 2>/dev/null || true
}

codesign_macos_is_macho() {
  local f="$1"
  case "$(file -b "$f" 2>/dev/null || true)" in
    Mach-O*) return 0 ;;
    *) return 1 ;;
  esac
}

codesign_macos_is_timestamp_flake() {
  case "$1" in
    *"timestamp service is not available"*|*"timestamp server"*|*"unable to contact"*|*"timestamp was expected"*|*"A timestamp was expected"*)
      return 0
      ;;
  esac
  return 1
}

codesign_macos_remove_signature() {
  codesign --remove-signature "$1" 2>/dev/null || true
}

codesign_macos_sign_without_timestamp() {
  local f="$1"
  local err=""
  codesign_macos_remove_signature "$f"
  if err=$(codesign --force --sign "$CODESIGN_IDENTITY" --options runtime --timestamp=none "$f" 2>&1); then
    return 0
  fi
  printf '%s\n' "$err" >&2
  return 1
}

codesign_macos_sign_one() {
  local f="$1"
  local attempt=1
  local err=""
  while [ "$attempt" -le "$CODESIGN_MAX_ATTEMPTS" ]; do
    if err=$(codesign --force --sign "$CODESIGN_IDENTITY" --options runtime --timestamp "$f" 2>&1); then
      return 0
    fi
    if codesign_macos_is_timestamp_flake "$err"; then
      case "$err" in
        *"timestamp service is not available"*|*"timestamp server"*|*"unable to contact"*)
          echo "  ↻ timestamp unavailable (attempt ${attempt}/${CODESIGN_MAX_ATTEMPTS}): $(basename "$f")" >&2
          sleep $((CODESIGN_RETRY_SLEEP_SEC * attempt))
          attempt=$((attempt + 1))
          ;;
        *)
          break
          ;;
      esac
    else
      printf '%s\n' "$err" >&2
      return 1
    fi
  done

  if [ "$CODESIGN_ALLOW_NO_TIMESTAMP" = "1" ]; then
    echo "  ⚠ signing without timestamp: $(basename "$f")" >&2
    if codesign_macos_sign_without_timestamp "$f"; then
      CODESIGN_NO_TIMESTAMP=$((CODESIGN_NO_TIMESTAMP + 1))
      return 0
    fi
  elif [ -n "$err" ]; then
    printf '%s\n' "$err" >&2
  fi
  return 1
}

codesign_macos_sign_file() {
  local f="$1"
  if codesign_macos_sign_one "$f"; then
    CODESIGN_SIGNED=$((CODESIGN_SIGNED + 1))
    return 0
  fi
  CODESIGN_FAILED=$((CODESIGN_FAILED + 1))
  echo "  ✗ codesign failed: $f" >&2
  return 1
}

codesign_macos_sign_bundle_container() {
  local bundle="$1"
  local err=""
  local attempt=1
  # Under `set -u`, empty `"${ent_args[@]}"` is an unbound-variable error on
  # some bash builds — use ${arr[@]+"${arr[@]}"} so a missing entitlements
  # file still signs the container.
  local ent_args=()
  if [ -n "${CODESIGN_ENTITLEMENTS:-}" ] && [ -f "${CODESIGN_ENTITLEMENTS}" ]; then
    ent_args=(--entitlements "${CODESIGN_ENTITLEMENTS}")
  fi
  while [ "$attempt" -le "$CODESIGN_MAX_ATTEMPTS" ]; do
    if err=$(codesign --force --sign "$CODESIGN_IDENTITY" --options runtime --timestamp ${ent_args[@]+"${ent_args[@]}"} "$bundle" 2>&1); then
      CODESIGN_SIGNED=$((CODESIGN_SIGNED + 1))
      return 0
    fi
    if codesign_macos_is_timestamp_flake "$err"; then
      case "$err" in
        *"timestamp service is not available"*|*"timestamp server"*|*"unable to contact"*)
          echo "  ↻ timestamp unavailable (attempt ${attempt}/${CODESIGN_MAX_ATTEMPTS}): $(basename "$bundle")" >&2
          sleep $((CODESIGN_RETRY_SLEEP_SEC * attempt))
          attempt=$((attempt + 1))
          ;;
        *)
          break
          ;;
      esac
    else
      printf '%s\n' "$err" >&2
      CODESIGN_FAILED=$((CODESIGN_FAILED + 1))
      return 1
    fi
  done

  if [ "$CODESIGN_ALLOW_NO_TIMESTAMP" = "1" ]; then
    echo "  ⚠ signing bundle without timestamp: $(basename "$bundle")" >&2
    codesign_macos_remove_signature "$bundle"
    if err=$(codesign --force --sign "$CODESIGN_IDENTITY" --options runtime --timestamp=none ${ent_args[@]+"${ent_args[@]}"} "$bundle" 2>&1); then
      CODESIGN_NO_TIMESTAMP=$((CODESIGN_NO_TIMESTAMP + 1))
      CODESIGN_SIGNED=$((CODESIGN_SIGNED + 1))
      return 0
    fi
    printf '%s\n' "$err" >&2
  elif [ -n "$err" ]; then
    printf '%s\n' "$err" >&2
  fi
  CODESIGN_FAILED=$((CODESIGN_FAILED + 1))
  return 1
}

codesign_macos_print_summary() {
  local label="${1:-files}"
  echo "  ✓ Signed ${CODESIGN_SIGNED} ${label}"
  if [ "$CODESIGN_NO_TIMESTAMP" -gt 0 ]; then
    echo "  ⚠ ${CODESIGN_NO_TIMESTAMP} item(s) signed with --timestamp=none (Apple timestamp service was down)." >&2
    echo "    Notarization may fail — retry when timestamp.apple.com is reachable." >&2
  fi
  if [ "$CODESIGN_FAILED" -gt 0 ]; then
    echo "error: ${CODESIGN_FAILED} codesign failure(s)" >&2
    return 1
  fi
  return 0
}
