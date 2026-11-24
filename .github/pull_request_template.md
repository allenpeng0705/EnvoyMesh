## Summary

<!-- What changed and why (1–3 sentences). -->

## Test plan

- [ ] `npm run test:dev` (or targeted vitest) for touched areas
- [ ] Manual smoke when user-facing

## Coding provider / featured harness (FH-P1-E)

<!-- Uncheck or delete when this PR does not touch `coding-provider-catalog` or featured harness lists. -->

- [ ] This PR adds or changes a **featured** Tier B harness or Coding catalog row
- [ ] `packages/harness` spawn + `askingControl` delivery updated
- [ ] Social `coding-composer-capabilities.ts` (+ EnvoyGo wire when featured on mobile)
- [ ] `scripts/family-catalog-snapshot.json` regenerated; `npm run check:family-catalog` passes
- [ ] EnvoyCoder `asking-control` cross-check documented in PR body if hand-synced