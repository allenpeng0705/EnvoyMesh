#!/usr/bin/env bash
# Drop cross-platform native prebuild dirs from a staged bundle tree.
# Keeps only the host OS+arch combo (e.g. darwin-arm64 on Apple Silicon).
#
# Usage: prune-staged-native-prebuilds.sh <dest-dir> [<dest-dir> …]
#
# Skipped when ENVOYMESH_KEEP_ALL_NATIVE_PREBUILDS=1 (universal DMG builds
# need both darwin-x64 and darwin-arm64 under resources/).
set -euo pipefail

if [ "${ENVOYMESH_KEEP_ALL_NATIVE_PREBUILDS:-0}" = "1" ]; then
  echo "prune-staged-native-prebuilds: ENVOYMESH_KEEP_ALL_NATIVE_PREBUILDS=1 — skip"
  exit 0
fi

if [ "$#" -lt 1 ]; then
  echo "usage: prune-staged-native-prebuilds.sh <dest-dir> [<dest-dir> …]" >&2
  exit 1
fi

HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"   # darwin | linux | …
HOST_ARCH="$(uname -m)"
case "${HOST_ARCH}" in
  x86_64|amd64) HOST_ARCH_NORM="x64" ;;
  arm64|aarch64) HOST_ARCH_NORM="arm64" ;;
  *) HOST_ARCH_NORM="${HOST_ARCH}" ;;
esac

prune_tree() {
  local dest="$1"
  [ -d "$dest" ] || return 0

  local native_pruned=0
  while IFS= read -r prebuild_dir; do
    [ -d "${prebuild_dir}" ] || continue
    local parent
    parent="$(dirname "${prebuild_dir}")"
    for sibling in "${parent}"/*; do
      [ -d "${sibling}" ] || continue
      local name
      name="$(basename "${sibling}")"
      case "${name}" in
        "${HOST_OS}-${HOST_ARCH_NORM}"|"${HOST_OS}"|"${HOST_ARCH_NORM}") continue ;;
        *-x64|*-arm64|*-armv7l|*-ia32|*-universal|darwin-*|linux-*|win32-*)
          rm -rf "${sibling}" 2>/dev/null && native_pruned=$((native_pruned + 1))
          ;;
      esac
    done
  done < <(find "${dest}" -type d -name "prebuilds" 2>/dev/null)

  # Optional platform-specific package dirs (@img/sharp-darwin-x64, clipboard-darwin-x64, …).
  while IFS= read -r pkg_dir; do
    [ -d "${pkg_dir}" ] || continue
    local base
    base="$(basename "${pkg_dir}")"
    case "${base}" in
      *"-${HOST_OS}-${HOST_ARCH_NORM}"|*"-${HOST_OS}-universal"|*"-darwin-universal") continue ;;
      *-darwin-x64|*-darwin-arm64|*-linux-x64|*-linux-arm64|*-win32-*)
        rm -rf "${pkg_dir}" 2>/dev/null && native_pruned=$((native_pruned + 1))
        ;;
    esac
  done < <(find "${dest}/node_modules" -maxdepth 2 -type d 2>/dev/null || true)

  if [ "${native_pruned}" -gt 0 ]; then
    echo "  ✓ Pruned ${native_pruned} cross-platform native dir(s) from $(basename "$dest") (keeping ${HOST_OS}-${HOST_ARCH_NORM})"
  fi
}

for dest in "$@"; do
  prune_tree "$dest"
done
