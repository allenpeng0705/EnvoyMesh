# Shared macOS codesign helpers (source from bash scripts — do not execute directly).
# Handles Apple timestamp server flakes with retry + optional --timestamp=none fallback.
# After the main pass, retries any no-timestamp signatures once Apple is reachable again.
#
# Important: if nested Mach-O files are re-signed after the .app container, the
# container signature is invalid until re-signed. Set CODESIGN_APP_BUNDLE to the
# .app path (sign-macos-app-bundle.sh does this) so the final pass re-seals it.

codesign_macos_init() {
  CODESIGN_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
  CODESIGN_SIGNED=0
  CODESIGN_FAILED=0
  CODESIGN_NO_TIMESTAMP=0
  # More patient defaults — timestamp.apple.com is often briefly unavailable.
  CODESIGN_MAX_ATTEMPTS="${CODESIGN_TIMESTAMP_RETRIES:-8}"
  CODESIGN_RETRY_SLEEP_SEC="${CODESIGN_TIMESTAMP_RETRY_SLEEP:-4}"
  CODESIGN_ALLOW_NO_TIMESTAMP="${CODESIGN_ALLOW_NO_TIMESTAMP:-1}"
  CODESIGN_NO_TIMESTAMP_FILES=()
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
  local ent_args=()
  if [[ "$f" == *.app ]] && [ -n "${CODESIGN_ENTITLEMENTS:-}" ] && [ -f "${CODESIGN_ENTITLEMENTS}" ]; then
    ent_args=(--entitlements "${CODESIGN_ENTITLEMENTS}")
  fi
  codesign_macos_remove_signature "$f"
  if err=$(codesign --force --sign "$CODESIGN_IDENTITY" --options runtime --timestamp=none ${ent_args[@]+"${ent_args[@]}"} "$f" 2>&1); then
    return 0
  fi
  printf '%s\n' "$err" >&2
  return 1
}

# Sign with secure timestamp only (no --timestamp=none). Used by the final retry pass.
codesign_macos_sign_with_timestamp_only() {
  local f="$1"
  local max_attempts="${2:-${CODESIGN_MAX_ATTEMPTS}}"
  local attempt=1
  local err=""
  local ent_args=()
  if [[ "$f" == *.app ]] && [ -n "${CODESIGN_ENTITLEMENTS:-}" ] && [ -f "${CODESIGN_ENTITLEMENTS}" ]; then
    ent_args=(--entitlements "${CODESIGN_ENTITLEMENTS}")
  fi
  while [ "$attempt" -le "$max_attempts" ]; do
    codesign_macos_remove_signature "$f"
    if err=$(codesign --force --sign "$CODESIGN_IDENTITY" --options runtime --timestamp ${ent_args[@]+"${ent_args[@]}"} "$f" 2>&1); then
      return 0
    fi
    if codesign_macos_is_timestamp_flake "$err"; then
      echo "  ↻ timestamp retry (attempt ${attempt}/${max_attempts}): $(basename "$f")" >&2
      sleep $((CODESIGN_RETRY_SLEEP_SEC * attempt))
      attempt=$((attempt + 1))
      continue
    fi
    printf '%s\n' "$err" >&2
    return 1
  done
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
          # Keep this line quiet-ish: many nested Mach-Os hit the same flake.
          if [ "$attempt" -eq 1 ] || [ "$attempt" -eq "$CODESIGN_MAX_ATTEMPTS" ]; then
            echo "  ↻ timestamp unavailable (attempt ${attempt}/${CODESIGN_MAX_ATTEMPTS}): $(basename "$f")" >&2
          fi
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
    echo "  ⚠ signing without timestamp (will retry later): $(basename "$f")" >&2
    if codesign_macos_sign_without_timestamp "$f"; then
      CODESIGN_NO_TIMESTAMP=$((CODESIGN_NO_TIMESTAMP + 1))
      CODESIGN_NO_TIMESTAMP_FILES+=("$f")
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
          if [ "$attempt" -eq 1 ] || [ "$attempt" -eq "$CODESIGN_MAX_ATTEMPTS" ]; then
            echo "  ↻ timestamp unavailable (attempt ${attempt}/${CODESIGN_MAX_ATTEMPTS}): $(basename "$bundle")" >&2
          fi
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
    echo "  ⚠ signing bundle without timestamp (will retry later): $(basename "$bundle")" >&2
    codesign_macos_remove_signature "$bundle"
    if err=$(codesign --force --sign "$CODESIGN_IDENTITY" --options runtime --timestamp=none ${ent_args[@]+"${ent_args[@]}"} "$bundle" 2>&1); then
      CODESIGN_NO_TIMESTAMP=$((CODESIGN_NO_TIMESTAMP + 1))
      CODESIGN_NO_TIMESTAMP_FILES+=("$bundle")
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

# Second pass: re-sign any --timestamp=none leftovers with a real timestamp.
# Nested files first; .app container last (required if any nested code changed).
codesign_macos_retry_missing_timestamps() {
  # bash 3.2 + set -u: empty "${arr[@]}" is an unbound-variable error.
  if [ "${#CODESIGN_NO_TIMESTAMP_FILES[@]}" -eq 0 ]; then
    return 0
  fi

  local nested=()
  local app_pending=""
  local f
  local recovered=0
  local nested_changed=0
  local app_path="${CODESIGN_APP_BUNDLE:-}"

  for f in "${CODESIGN_NO_TIMESTAMP_FILES[@]}"; do
    if [[ "$f" == *.app ]]; then
      app_pending="$f"
      app_path="$f"
    else
      nested+=("$f")
    fi
  done

  echo "  Re-trying ${#CODESIGN_NO_TIMESTAMP_FILES[@]} file(s) for a secure timestamp…"
  sleep "${CODESIGN_RETRY_SLEEP_SEC}"

  local still_missing=()
  if [ "${#nested[@]}" -gt 0 ]; then
    for f in "${nested[@]}"; do
      if codesign_macos_sign_with_timestamp_only "$f" 4; then
        recovered=$((recovered + 1))
        CODESIGN_NO_TIMESTAMP=$((CODESIGN_NO_TIMESTAMP - 1))
        nested_changed=1
      else
        still_missing+=("$f")
        if [ "$CODESIGN_ALLOW_NO_TIMESTAMP" = "1" ]; then
          codesign_macos_sign_without_timestamp "$f" || true
        fi
      fi
    done
  fi

  # Re-seal the app whenever nested code changed, or the container itself lacked a timestamp.
  if [ -n "$app_path" ] && { [ "$nested_changed" -eq 1 ] || [ -n "$app_pending" ]; }; then
    echo "  Re-signing app container after nested timestamp recovery…"
    if codesign_macos_sign_with_timestamp_only "$app_path" 4; then
      if [ -n "$app_pending" ]; then
        recovered=$((recovered + 1))
        CODESIGN_NO_TIMESTAMP=$((CODESIGN_NO_TIMESTAMP - 1))
      fi
    else
      if [ -n "$app_pending" ]; then
        still_missing+=("$app_path")
      fi
      if [ "$CODESIGN_ALLOW_NO_TIMESTAMP" = "1" ]; then
        codesign_macos_sign_without_timestamp "$app_path" || true
      fi
    fi
  elif [ -n "$app_pending" ]; then
    still_missing+=("$app_pending")
  fi

  CODESIGN_NO_TIMESTAMP_FILES=("${still_missing[@]+"${still_missing[@]}"}")
  # Clamp counter to remaining list length (avoid negatives from double-count edge cases).
  CODESIGN_NO_TIMESTAMP=${#CODESIGN_NO_TIMESTAMP_FILES[@]}

  if [ "$recovered" -gt 0 ]; then
    echo "  ✓ Recovered secure timestamp on ${recovered} file(s)"
  fi
}

codesign_macos_print_summary() {
  local label="${1:-files}"
  codesign_macos_retry_missing_timestamps
  echo "  ✓ Signed ${CODESIGN_SIGNED} ${label}"
  if [ "$CODESIGN_NO_TIMESTAMP" -gt 0 ]; then
    echo "  ⚠ ${CODESIGN_NO_TIMESTAMP} item(s) still signed with --timestamp=none (Apple timestamp service was down)." >&2
    echo "    Notarization may fail — retry when timestamp.apple.com is reachable." >&2
  fi
  if [ "$CODESIGN_FAILED" -gt 0 ]; then
    echo "error: ${CODESIGN_FAILED} codesign failure(s)" >&2
    return 1
  fi
  return 0
}
