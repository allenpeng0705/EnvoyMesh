#!/usr/bin/env bash
# Fetch pinned fd + ripgrep binaries into resources/pi/bin/.
#
# Why: Pi auto-downloads these on first run when missing from PATH. In a
# Tauri GUI app PATH is stripped (no Homebrew), and the GitHub download
# often hangs or 404s — so Ext Agent Pi "works in terminal, fails in DMG/EXE".
# Bundling the tools next to Pi makes the desktop app self-contained.
#
# Usage: bash scripts/fetch-pi-tools.sh
# Output: apps/tauri/src-tauri/resources/pi/bin/{fd,rg} (or .exe on Windows)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${ROOT}/apps/tauri/src-tauri/resources/pi/bin"
# Pin known-good releases that still publish all common platform assets.
FD_VERSION="${ENVOYMESH_FD_VERSION:-10.2.0}"
RG_VERSION="${ENVOYMESH_RG_VERSION:-14.1.1}"

case "$(uname -s)" in
  Darwin) OS=apple-darwin ;;
  Linux) OS=unknown-linux-gnu ;;
  MINGW*|MSYS*|CYGWIN*) OS=pc-windows-msvc ;;
  *) echo "error: unsupported OS $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) ARCH=aarch64 ;;
  x86_64|amd64) ARCH=x86_64 ;;
  *) echo "error: unsupported arch $(uname -m)" >&2; exit 1 ;;
esac

FD_TARGET="${ARCH}-${OS}"
RG_TARGET="${ARCH}-${OS}"
FD_EXE="fd"
RG_EXE="rg"
EXT="tar.gz"
if [ "$OS" = "pc-windows-msvc" ]; then
  FD_EXE="fd.exe"
  RG_EXE="rg.exe"
  EXT="zip"
fi

MARKER="${DEST}/.tools-version"
WANT="fd=${FD_VERSION};rg=${RG_VERSION};target=${FD_TARGET}"
if [ -f "${DEST}/${FD_EXE}" ] && [ -f "${DEST}/${RG_EXE}" ] && [ -f "$MARKER" ] && [ "$(cat "$MARKER")" = "$WANT" ]; then
  echo "  ✓ Pi tools already staged ($WANT)"
  exit 0
fi

echo "  Fetching fd ${FD_VERSION} + ripgrep ${RG_VERSION} for ${FD_TARGET}..."
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

download() {
  local url="$1" out="$2"
  local attempt=1
  while [ "$attempt" -le 4 ]; do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsSL --retry 2 --retry-delay 2 --connect-timeout 20 -o "$out" "$url"; then
        return 0
      fi
    else
      if wget -q -O "$out" "$url"; then
        return 0
      fi
    fi
    echo "    retry $attempt downloading $(basename "$url")..." >&2
    attempt=$((attempt + 1))
    sleep $((attempt * 2))
  done
  return 1
}

copy_from_user_cache() {
  local cache="$HOME/.pi/agent/bin"
  if [ -x "${cache}/${FD_EXE}" ] && [ -x "${cache}/${RG_EXE}" ]; then
    # Smoke-test: cached binaries must actually run on this host (wrong-arch
    # copies would otherwise mark the stage "complete" and ship broken).
    if ! "${cache}/${FD_EXE}" --version >/dev/null 2>&1; then
      echo "  ⚠ cache ${cache}/${FD_EXE} present but not runnable on this host — skipping" >&2
      return 1
    fi
    if ! "${cache}/${RG_EXE}" --version >/dev/null 2>&1; then
      echo "  ⚠ cache ${cache}/${RG_EXE} present but not runnable on this host — skipping" >&2
      return 1
    fi
    echo "  ⚠ GitHub download failed — copying fd/rg from ${cache}"
    mkdir -p "$DEST"
    cp "${cache}/${FD_EXE}" "${DEST}/${FD_EXE}"
    cp "${cache}/${RG_EXE}" "${DEST}/${RG_EXE}"
    chmod +x "${DEST}/${FD_EXE}" "${DEST}/${RG_EXE}" 2>/dev/null || true
    # Marker notes cache origin so a later successful download can refresh.
    printf '%s\n' "${WANT};source=user-cache" > "$MARKER"
    echo "  ✓ Pi tools staged from user cache at $DEST"
    return 0
  fi
  return 1
}

FD_URL="https://github.com/sharkdp/fd/releases/download/v${FD_VERSION}/fd-v${FD_VERSION}-${FD_TARGET}.${EXT}"
RG_URL="https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-${RG_TARGET}.${EXT}"

if ! download "$FD_URL" "$TMP/fd.${EXT}" || ! download "$RG_URL" "$TMP/rg.${EXT}"; then
  if copy_from_user_cache; then
    exit 0
  fi
  echo "error: failed to download fd/rg from GitHub (and no ~/.pi/agent/bin cache)." >&2
  echo "  Tried: $FD_URL" >&2
  echo "  Tried: $RG_URL" >&2
  echo "  Install manually: brew install fd ripgrep   (or winget install sharkdp.fd BurntSushi.ripgrep.MSVC)" >&2
  exit 1
fi

mkdir -p "$DEST"
rm -f "${DEST}/${FD_EXE}" "${DEST}/${RG_EXE}"

extract_bin() {
  local archive="$1" wanted="$2" dest_name="$3"
  mkdir -p "$TMP/extract"
  rm -rf "$TMP/extract"/*
  case "$archive" in
    *.zip)
      if command -v unzip >/dev/null 2>&1; then
        unzip -q -o "$archive" -d "$TMP/extract"
      else
        tar -xf "$archive" -C "$TMP/extract"
      fi
      ;;
    *)
      tar -xzf "$archive" -C "$TMP/extract"
      ;;
  esac
  local found
  found="$(find "$TMP/extract" -type f -name "$wanted" | head -n 1)"
  if [ -z "$found" ]; then
    echo "error: $wanted not found in $archive" >&2
    find "$TMP/extract" -type f | head -n 40 >&2
    exit 1
  fi
  cp "$found" "${DEST}/${dest_name}"
  chmod +x "${DEST}/${dest_name}" 2>/dev/null || true
}

extract_bin "$TMP/fd.${EXT}" "$FD_EXE" "$FD_EXE"
extract_bin "$TMP/rg.${EXT}" "$RG_EXE" "$RG_EXE"
printf '%s\n' "$WANT" > "$MARKER"
echo "  ✓ Pi tools staged at $DEST ($FD_EXE, $RG_EXE)"
