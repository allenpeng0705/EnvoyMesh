#!/bin/bash
# Cherry-pick safe commits from main branch onto stable/00b5b5d-plus-features
# Skips commits that touch packages/network/ or apps/node/src/node-service-impl.ts
set -e
cd /Users/shileipeng/Documents/mygithub/EnvoyMesh

NETWORK_FILES="packages/network/src apps/node/src/node-service-impl.ts apps/node/src/index.ts apps/node/src/outbound-dial-hints.ts"

echo "=== Commits on main after 00b5b5d ==="
git log --oneline --reverse 00b5b5d..main
echo ""

for c in $(git log --reverse --format='%H' 00b5b5d..main); do
  if git diff-tree --no-commit-id -r $c -- $NETWORK_FILES 2>/dev/null | grep -q 'diff'; then
    echo "SKIP (network): $(git log -1 --format='%h %s' $c)"
  else
    echo "PICK: $(git log -1 --format='%h %s' $c)"
    git cherry-pick $c || {
      echo "CONFLICT on $(git log -1 --format='%h %s' $c) - skipping"
      git cherry-pick --abort
    }
  fi
done

echo ""
echo "=== Done ==="
echo "Current branch: $(git branch --show-current)"
echo "Last 5 commits:"
git log --oneline -5
