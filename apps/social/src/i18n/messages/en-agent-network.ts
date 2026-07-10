export const agentNetworkSettingsMessages = {
  title: "Devices & Fleet",
  intro:
    "Configure how this node bonds with other fleet members. Four paths are available — pick the one that fits your team. All four are **off by default** until you turn them on.",
  quickReferenceTitle: "Which path should I use?",
  groupAutoBondTitle: "Auto-bond (sponsor node + installer)",
  groupAutoBondDesc:
    "These two work as a pair: the sponsor node auto-accepts hellos that carry a matching proof token, and installer builds send that token on first launch. Set the **same token** on both sides.",
  groupInvitesTitle: "Invites",
  groupInvitesDesc:
    "Mint links a colleague can paste into their Social UI to join this node.",
  groupOperatorTitle: "Operator tools",
  groupOperatorDesc:
    "Pre-stage trust for many nodes at once, or auto-bond everyone on the office Wi-Fi.",
  quickReference: {
    companyInvites:
      "Long-lived bearer links. Best when members are remote or the LAN is unreliable. Each invite is single-use.",
    lanAutoBond:
      "Zero-touch for desks on the same Wi-Fi. Both sides flip a toggle with the same token. Off by default.",
    pairingKiosk:
      "Browser button for visiting laptops. Off by default. Requires loopback binding unless you opt in to LAN.",
    fleetManifest:
      "Operator-signed roster. Pre-stages trust for an entire fleet at once. Use when you onboard many nodes at once.",
  },
  lanAutoBond: {
    heading: "LAN Auto-Bond",
    desc: "When enabled with a matching fleet token, this node will silently bond with other fleet members on the same local network. **Off by default** — enable only on trusted company networks.",
    enableLabel: "Enable LAN auto-bond",
    tokenLabel: "Fleet token",
    tokenPlaceholder: "paste a long random string (32+ chars recommended)",
    tokenHelp:
      "Shared secret. Pick the same value on every fleet node. The token is never written to the audit log.",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    generate: "Generate",
    enabled: "Enabled",
    disabled: "Disabled",
    noToken:
      "No token configured — auto-bond will not fire even when enabled.",
    validationTokenTooShort: "Fleet token must be at least 8 characters.",
    hint: "Auto-bond only fires when both sides have this toggle on and the same token. A wrong token is silently ignored.",
  },
  companyInvites: {
    sectionTitle: "Company Invites",
    sectionDesc:
      "Mint a long-lived invite a colleague can paste into their Social UI to join this node. Best for company-scale fleet onboarding where QR scanning or LAN access is not practical.",
    createButton: "New company invite",
    creating: "Creating…",
    expiresInHoursLabel: "Expires in (hours, default 168 = 7 days)",
    noteLabel: "Note (optional label, e.g. \"Marketing laptop\")",
    empty: "No company invites yet.",
    loading: "Loading invites…",
    refresh: "Refresh",
    copyUri: "Copy URI",
    copyUriCopied: "Copied!",
    revoke: "Revoke",
    revoking: "Revoking…",
    revokeConfirmMessage: "This invite will be invalidated.",
    revoked: "Company invite revoked",
    revokeFailed: "Failed to revoke invite",
    statusActive: "active",
    statusUsed: "used",
    statusRevoked: "revoked",
    statusExpired: "expired",
    noUri: "no URI",
    error: "Failed to manage company invites: {error}",
    notePlaceholder: "Marketing laptop",
  },
  pairingKiosk: {
    sectionTitle: "Pairing Kiosk",
    sectionDesc:
      "Spin up a tiny web page on this home node so a fleet member can mint a one-shot company invite by clicking a button. **Off by default** — turn on only on trusted company networks.",
    enableLabel: "Enable pairing kiosk",
    bindAddressLabel: "Bind address (default 127.0.0.1)",
    bindPortLabel: "Bind port (default 3737)",
    allowLanBindLabel: "Allow binding to a non-loopback address (LAN exposure)",
    adminTokenLabel:
      "Kiosk admin token (Bearer; min 16 chars; never written to the audit log)",
    generateToken: "Generate",
    expiresAtLabel:
      "Optional ISO 8601 expiry for the kiosk (e.g. 2025-12-31T00:00:00Z)",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    statusRunning: "Kiosk running at http://{address}:{port}",
    statusStopped: "Kiosk stopped",
    statusExpired: "Kiosk expired",
    refreshStatus: "Refresh status",
    error: "Failed to manage pairing kiosk: {error}",
  },
  fleetManifest: {
    sectionTitle: "Fleet Manifest",
    sectionDesc:
      "Apply a signed Fleet Manifest roster to pre-stage trust for every member. The operator pastes member JSON, the home node signs the manifest, then imports it. Re-importing the same manifest id is idempotent.",
    labelLabel: "Manifest label (optional)",
    membersLabel:
      "Members as JSON: an array of { ownerId, deviceId, devicePublicKeyPem, role, trustLevel, displayName? }",
    roleTemplateLabel: "Start from a role template:",
    roleTemplate: {
      operator: {
        label: "Operator",
        hint: "Full trust — co-admin who can manage the fleet. trustLevel: direct.",
      },
      engineer: {
        label: "Engineer",
        hint: "Standard team member — chat, share, chains. trustLevel: direct.",
      },
      contractor: {
        label: "Contractor",
        hint: "Introduced member — limited access, introduced-only sensitivity. trustLevel: referred.",
      },
      visitor: {
        label: "Visitor",
        hint: "Minimal trust — public-tier access only. trustLevel: public.",
      },
    },
    signButton: "Sign manifest with this node's owner key",
    signing: "Signing…",
    importButton: "Import on this node",
    importing: "Importing…",
    signedHint:
      "Signed manifest {manifestId} with {members} member(s). Click **Import** to apply on this node, or copy the JSON and apply it on the other member's node.",
    copyButton: "Copy signed manifest JSON",
    copyCopied: "Copied",
    summaryImport:
      "Imported: {added} new, {updated} updated, {skipped} skipped.",
    errorImport: "Failed to import manifest: {reason}",
    invalidMembersJson:
      "Members must be a non-empty JSON array of { ownerId, deviceId, devicePublicKeyPem, role, trustLevel }.",
    loading: "Loading manifests…",
    empty: "No fleet manifests imported yet.",
    rowSummary:
      "{memberCount} member(s) • issuer {issuer} • imported {importedAt}",
    revoked: "Revoked at {at}",
    revoke: "Revoke",
    revoking: "Revoking…",
    refresh: "Refresh manifests",
    error: "Failed to manage fleet manifests: {error}",
  },
  mobileNotAvailable:
    "Agent network onboarding is not available on mobile devices. Manage your fleet from a desktop or laptop.",
  bondAutonomy: {
    heading: "Bond autonomy (auto-accept hellos)",
    desc:
      "When enabled, your node automatically accepts inbound bond requests that pass the policy below. Pair with **Setup sponsor friend** on installer builds: set the same proof token on both sides.",
    enableLabel: "Enable bond autonomy auto-accept",
    maxPerDayLabel: "Max auto-accepts per day (0 = unlimited)",
    requireReferralProofLabel: "Require referral proof (proofOfContext or intro correlation)",
    maxTierLabel: "Max bond tier to auto-accept",
    maxTierDirect: "Direct (full friend)",
    maxTierReferred: "Referred only",
    minOverlapLabel: "Min trust overlap score (0–1, 0 = skip check)",
    notifyOwnerLabel: "Notify owner after auto-accept",
    sponsorTokenLabel: "Sponsor proof token (matches installer's proofOfContext)",
    sponsorTokenPlaceholder: "paste the same value from the installer",
    sponsorTokenHelp:
      "Shared secret with installer nodes. Paste the exact value the installer operator sets in their **Setup sponsor friend** > `proofOfContext` field. If left blank, the token gate is disabled and bond requests are evaluated only by the other auto-accept rules above. Mismatched tokens are rejected as `proof-token-mismatch`.",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
  },
  setupSponsorFriend: {
    heading: "Setup sponsor friend (installer)",
    desc:
      "Zero-step first friend after setup. Bundled defaults come from bundled-sponsor-friend.json at build time; override here for testing. Runs once after the setup wizard.",
    enableLabel: "Enable auto-hello to sponsor on first setup",
    contactUriLabel: "Contact URI (envoy://contact?…)",
    contactUriPlaceholder: "envoy://contact?v=1&ownerId=…&peerId=…&join=…",
    ownerIdLabel: "Sponsor owner ID (alternative to contact URI)",
    helloMessageLabel: "Hello message",
    proofLabel: "Proof of context (must match sponsor bondAutonomySponsorProofToken)",
    maxAttemptsLabel: "Max attempts",
    retryDelayLabel: "Retry delay (ms)",
    statusCompleted: "Completed at {at}",
    statusPending: "Not run yet (or in progress)",
    statusLastError: "Last error: {error}",
    runNow: "Run sponsor hello now",
    running: "Running…",
    runOk: "Sponsor hello sent",
    runFailed: "Sponsor hello failed: {error}",
    save: "Save overrides",
    saving: "Saving…",
    saved: "Saved",
    resolvedLabel: "Effective config source: {source}",
    sourceBundled: "bundled defaults (read-only unless you save an override)",
    sourcePersisted: "your saved overrides",
    sourceMerged: "merged (bundled + your overrides)",
    sourceNone: "no sponsor configured",
    bundledReadonlyHint:
      "These values come from the bundled installer config. Save overrides to change them for this node.",
  },
} as const;