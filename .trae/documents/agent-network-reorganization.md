# Move Agent Network Settings → Team Jobs (Tiered)

## Context

The Agent Network configuration is currently scattered across two places in Settings:
- **Settings → Agent Network tab** ([SettingsAgentNetworkTab.tsx](file:///Users/shileipeng/Documents/mygithub/EnvoyMesh/apps/social/src/components/views/SettingsAgentNetworkTab.tsx), 1769 lines, 10 sections) — worker membership, fleet onboarding, bond autonomy, sponsor friend
- **Settings → AI tab** ([SettingsAiTab.tsx:2562](file:///Users/shileipeng/Documents/mygithub/EnvoyMesh/apps/social/src/components/views/SettingsAiTab.tsx)) — `ChainDefaultsPanel` (award mode, iteration rounds, cost UI) — these are literally team-job defaults but hidden under "AI"

Meanwhile **Team jobs** ([ChainsView.tsx](file:///Users/shileipeng/Documents/mygithub/EnvoyMesh/apps/social/src/components/views/ChainsView.tsx)) already duplicates the "Workers status" section via its bonded-contacts list.

**Goal**: Consolidate ALL agent-network configuration into Team jobs, organized in tiers by frequency of use. Remove the Settings → Agent Network tab entirely. Remove `ChainDefaultsPanel` from the AI tab.

## Approach — Tiered reorganization

### Tier 1: Inline in Team jobs (daily-use controls)

Shown directly in ChainsView, above the active-chains list:

1. **Chain Defaults** — move `ChainDefaultsPanel` from SettingsAiTab into a collapsible "Team job defaults" section at the top of ChainsView. Collapsed by default; expands inline (no modal).
2. **Worker Membership toggle** — "Join Agent Network" checkbox + `AgentNetworkProfilePanel` (scoring profile). Extracted from `WorkerMembershipSection`.
3. **Worker pool status** — already exists as the bonded-contacts list in ChainsView's empty state. Promote it to always-visible (not just empty state) with a refresh button.

### Tier 2: "Manage workers" modal (fleet onboarding, rarely touched)

A new `AgentNetworkSettingsModal` opened via a "Manage workers" / gear button in the ChainsView header. Contains (as collapsible accordion sections):
- Office LAN preset (`OfficeLanPresetSection`)
- LAN auto-bond (`LanAutoBondSection`)
- Company invites (`CompanyInvitesSection`)
- Pairing kiosk (`PairingKioskSection`)
- Fleet manifest (`FleetManifestSection`)

Uses the existing `ModalPortal` + `.modal-overlay` / `.modal-panel` CSS pattern from [chat.css:3305](file:///Users/shileipeng/Documents/mygithub/EnvoyMesh/apps/social/src/styles/chat.css).

### Tier 3: In the same modal, under "Advanced" (not team-job-specific)

Also inside `AgentNetworkSettingsModal`, in a separate "Advanced" accordion group at the bottom:
- Bond autonomy (`BondAutonomySection`)
- Setup sponsor friend (`SetupSponsorFriendSection`)

## Files to modify

### New files
1. **`apps/social/src/components/AgentNetworkSettingsModal.tsx`** — the Tier 2+3 modal. Reuses the 8 existing section components (OfficeLanPresetSection, LanAutoBondSection, CompanyInvitesSection, PairingKioskSection, FleetManifestSection, BondAutonomySection, SetupSponsorFriendSection, AgentNetworkProfilePanel) by extracting them from `SettingsAgentNetworkTab.tsx` into a shared module.

2. **`apps/social/src/components/views/settings/agent-network-sections.ts`** (or `.tsx`) — shared module exporting all 10 section components so both the old tab (during transition) and the new modal can import them. Actually since we're removing the tab, this becomes the home for the section components.

### Modified files
3. **`apps/social/src/components/views/ChainsView.tsx`**:
   - Add a "Manage workers" (gear) button next to "New team job" in the header
   - Add `showSettings` state to control the modal
   - Add an inline collapsible "Team job defaults" section (renders `ChainDefaultsPanel`)
   - Add an inline "Join Agent Network" toggle + profile panel (Tier 1)
   - Promote the bonded-contacts list from empty-state-only to always-visible (with refresh button)
   - Render `<AgentNetworkSettingsModal>` when `showSettings` is true

4. **`apps/social/src/components/views/SettingsView.tsx`**:
   - Remove `"agentNetwork"` from the `SettingsTabId` union
   - Remove the agentNetwork tab button (lines 45-51)
   - Remove the `SettingsAgentNetworkTab` import and render (lines 5, 77)

5. **`apps/social/src/components/views/SettingsAiTab.tsx`**:
   - Remove `<ChainDefaultsPanel />` render (line 2562) and its import (line 12)
   - The AI tab keeps model-provider config; chain defaults move to Team jobs

6. **`apps/social/src/components/views/SettingsAgentNetworkTab.tsx`**:
   - Refactor: extract the 10 section components into `agent-network-sections.tsx`, then delete this file (or make it a thin re-export if anything else imports it — nothing does per grep).

7. **i18n files** — `en.ts` / `zh.ts` (and `ko/ja/fr/de/it` if we want all locales, but en+zh are the priority per project conventions):
   - The `settings.agentNetwork.*` keys stay as-is (the section components still use them via `t("settings.agentNetwork.*")`) — they're just rendered in a new location. No key renames needed.
   - Add new keys under `chains.*` for: the "Manage workers" button label, the "Team job defaults" section header, the "Advanced" accordion label. Mirror in en-chains.ts / zh-chains.ts.
   - Optionally remove `settings.tabs.agentNetwork` from each locale (since the tab is gone), but leaving it is harmless. I'll remove it from en+zh for cleanliness.

### CSS
8. **`apps/social/src/styles.css`**:
   - Add styles for the collapsible "Team job defaults" section in ChainsView (accordion header + body). Reuse existing `.chain-composer` / `.chain-workers` patterns.
   - Add a `.chains-view__manage-btn` style for the gear button (mirror `.chains-view__new-btn`).

## Key reuse points (don't reinvent)
- **Modal shell**: `ModalPortal` ([ModalPortal.tsx](file:///Users/shileipeng/Documents/mygithub/EnvoyMesh/apps/social/src/components/ModalPortal.tsx)) + `.modal-overlay` / `.modal-panel` CSS ([chat.css:3305](file:///Users/shileipeng/Documents/mygithub/EnvoyMesh/apps/social/src/styles/chat.css))
- **Section components**: all 10 already exist in SettingsAgentNetworkTab.tsx — extract, don't rewrite
- **ChainDefaultsPanel**: already a standalone component — just move where it's rendered
- **Bonded contacts list**: already in ChainsView (lines 354-386) — promote to always-visible
- **i18n keys**: `settings.agentNetwork.*` keys remain valid; components keep using them

## Implementation order

1. Extract the 10 section components from `SettingsAgentNetworkTab.tsx` into a new `agent-network-sections.tsx` file (pure extraction, no logic changes)
2. Create `AgentNetworkSettingsModal.tsx` that imports those sections + renders in a ModalPortal with accordion groups
3. Update `ChainsView.tsx`: add manage button, inline defaults + membership, promote contacts list, render modal
4. Remove `ChainDefaultsPanel` from `SettingsAiTab.tsx`
5. Remove the agentNetwork tab from `SettingsView.tsx`
6. Delete `SettingsAgentNetworkTab.tsx` (or leave as thin re-export if needed)
7. Add new i18n keys (en + zh) for the new ChainsView sections
8. CSS for the new inline sections + manage button

## Verification

1. **Typecheck**: `npx tsc -p apps/social/tsconfig.json --noEmit` — must pass with 0 errors
2. **Browser (EN + ZH)**:
   - Team jobs tab shows: defaults section (collapsed), membership toggle, bonded contacts list (always visible), active chains, "Manage workers" button
   - Clicking "Manage workers" opens modal with all 8 fleet/advanced sections
   - Settings no longer has an "Agent Network" tab
   - Settings → AI tab no longer has chain defaults
   - All toggles/inputs in the modal still work (join, LAN auto-bond, invites, etc.)
3. **Mobile guard**: the modal should respect `useIsInProcessMobileNode()` — show "not available" for mobile-node sections (same as the current tab does)
