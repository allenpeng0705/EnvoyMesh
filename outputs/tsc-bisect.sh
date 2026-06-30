#!/bin/bash
# Exit 0 if `npm run typecheck` passes with 0 errors in node-service-impl.ts
# Exit 1 otherwise.
set -e
cd /Users/shileipeng/Documents/mygithub/EnvoyMesh
LOG=/tmp/tsc-bisect.log
npm run typecheck > "$LOG" 2>&1 || true
N=$(grep -c "error TS" "$LOG" || echo 0)
echo "  tsc errors in this commit: $N"
if [ "$N" = "0" ]; then
  exit 0
else
  exit 1
fi