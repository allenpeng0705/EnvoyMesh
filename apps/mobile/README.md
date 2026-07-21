# apps/mobile — Capacitor backup (not the product mobile app)

**Do not use this tree for new mobile product work.**

The product mobile app is **EnvoyGo**: [`../envoygo/`](../envoygo/) (Flutter thin client).

This Capacitor project (Phase 11) is a **backup / legacy experiment**: Social UI + `mobile-node` in one WebView. It may be removed. Prefer EnvoyGo unless you are explicitly maintaining this backup path.

**Tests:** `apps/mobile/test/**` and `packages/mobile-*` unit suites are **excluded from vitest / `npm run test:*`** (see root `vitest.config.ts`). Do not re-add them to CI reports without an explicit decision to revive Capacitor.

See:
- [`.cursor/rules/mobile-app.mdc`](../../.cursor/rules/mobile-app.mdc)
- [`CLAUDE.md`](../../CLAUDE.md) / [`AGENTS.md`](../../AGENTS.md)
- Phase 11 in [`docs/implementation-plan.md`](../../docs/implementation-plan.md) (marked BACKUP / LEGACY)
