#!/bin/bash
# Fetch the upstream Pi coding-agent package for the target platform.
# Called during Tauri build to bundle Pi inside the app.
#
# Unlike OpenClaw (prebuilt per-OS binaries), Pi is a Node.js package
# (@earendil-works/pi-coding-agent) that runs under the bundled Node
# runtime. So we install it (and its transitive deps) into a clean
# staging dir via npm, then the desktop build copies that tree into
# apps/tauri/src-tauri/resources/pi/.
#
# Usage: bash scripts/fetch-pi-sidecar.sh [version]
#   version: Pi version to fetch (default: 0.82.1 — pinned, see §4 of
#            docs/pi-integration-design.md; bump deliberately, never "latest")
#
# Output: a self-contained Pi install at $OUTPUT_DIR containing:
#   $OUTPUT_DIR/
#     package.json                  # synthetic manifest (name, version, type:module)
#     node_modules/                 # Pi + all transitive deps, npm-installed
#       @earendil-works/pi-coding-agent/
#         dist/cli.js               # the `pi` CLI entry (bin field)
#         dist/index.js             # the SDK entry (main field)
#         package.json
#       @earendil-works/pi-ai/
#       @earendil-works/pi-agent-core/
#       @earendil-works/pi-tui/
#       chalk/, cross-spawn/, ...   # ~16 other npm deps
#
# Re-runs are idempotent: if the requested version is already staged,
# this script exits 0 without re-downloading. Force a re-fetch by
# removing $OUTPUT_DIR first.

set -euo pipefail

# Pin by default — supply-chain hygiene, see design doc §4. Pass a
# different version as $1 to test a newer Pi (never use "latest" in CI).
#
# Override precedence (highest first):
#   1. $1 positional argument           (this script)
#   2. ENVOYMESH_PI_VERSION env var    (single source of truth across
#                                      build-desktop.{sh,ps1},
#                                      fetch-pi-sidecar.{sh,ps1},
#                                      stage-tauri-pi-bundle.sh)
#   3. Pinned default (0.82.1)
if [ -n "${1:-}" ]; then
  PI_VERSION="$1"
elif [ -n "${ENVOYMESH_PI_VERSION:-}" ]; then
  PI_VERSION="${ENVOYMESH_PI_VERSION}"
else
  PI_VERSION="0.82.1"
fi
PI_PACKAGE="@earendil-works/pi-coding-agent@${PI_VERSION}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${ROOT}/apps/tauri/src-tauri/resources/pi"
STAGED_VERSION_FILE="${OUTPUT_DIR}/.pi-version"

echo "Fetching Pi coding-agent ${PI_VERSION}..."

# Idempotency: skip if the same version is already staged.
if [ -f "${STAGED_VERSION_FILE}" ] && [ "$(cat "${STAGED_VERSION_FILE}")" = "${PI_VERSION}" ]; then
  if [ -f "${OUTPUT_DIR}/node_modules/@earendil-works/pi-coding-agent/dist/cli.js" ]; then
    echo "  ✓ Pi ${PI_VERSION} already staged at ${OUTPUT_DIR/$ROOT\//}"
    exit 0
  fi
fi

# Clean any prior staging (different version, or partial install).
rm -rf "${OUTPUT_DIR}"
mkdir -p "${OUTPUT_DIR}"

# Install Pi + all transitive deps into a clean node_modules under
# $OUTPUT_DIR. We need a minimal package.json so npm treats this dir as
# the project root and hoists deps here (not to the repo root).
cat > "${OUTPUT_DIR}/package.json" <<EOF
{
  "name": "@envoymesh/pi-bundle",
  "version": "${PI_VERSION}",
  "private": true,
  "type": "module",
  "dependencies": {
    "@earendil-works/pi-coding-agent": "${PI_VERSION}"
  }
}
EOF

echo "  Installing ${PI_PACKAGE} + transitive deps..."
# --prefix .        → install into this dir's node_modules (npm auto-detects
#                     from package.json, but be explicit for clarity)
# --omit=dev        → skip devDependencies (we only ship the runtime)
# --no-audit --no-fund → quieten npm
# --loglevel=error  → only surface failures
( cd "${OUTPUT_DIR}" && npm install --omit=dev --no-audit --no-fund --loglevel=error )

# Verify the CLI + SDK entry points landed where we expect them.
PI_CLI="${OUTPUT_DIR}/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
PI_SDK="${OUTPUT_DIR}/node_modules/@earendil-works/pi-coding-agent/dist/index.js"
PI_PKG="${OUTPUT_DIR}/node_modules/@earendil-works/pi-coding-agent/package.json"
missing=()
[ -f "${PI_CLI}" ] || missing+=("dist/cli.js")
[ -f "${PI_SDK}" ] || missing+=("dist/index.js")
[ -f "${PI_PKG}" ] || missing+=("package.json")
if [ "${#missing[@]}" -gt 0 ]; then
  echo "  ✗ Pi package incomplete after npm install — missing: ${missing[*]}" >&2
  echo "    Expected under node_modules/@earendil-works/pi-coding-agent/." >&2
  exit 1
fi

# Record the staged version so subsequent runs skip re-installing.
echo "${PI_VERSION}" > "${STAGED_VERSION_FILE}"

# Report what we got.
CLI_SIZE=$(du -sh "${OUTPUT_DIR}" | awk '{print $1}')
PI_DEPS=$(ls "${OUTPUT_DIR}/node_modules/@earendil-works/" 2>/dev/null | tr '\n' ' ')
echo "  ✓ Pi ${PI_VERSION} staged at ${OUTPUT_DIR/$ROOT\//} (${CLI_SIZE})"
echo "    @earendil-works packages: ${PI_DEPS}"
echo "    CLI entry: node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
echo "    SDK entry: node_modules/@earendil-works/pi-coding-agent/dist/index.js"
