/// Onboarding gating rules.
library;

/// Whether EnvoyGo should open on the pairing guide instead of the app shell.
///
/// With the mobile node off (the default) every feature runs on a home node, so
/// pairing is offered up front. It is **not** a block: `pairingDeferred` records
/// that the user chose "Pair later", after which the app opens the shell as it
/// always did (every feature shows its own pairing CTA).
///
/// With the mobile node on, unpaired use is a supported mode (phone mesh), so
/// nothing is forced.
bool needsPairingGate({
  required bool mobileNodeEnabled,
  required bool hasActiveNode,
  required bool pairingDeferred,
}) {
  if (mobileNodeEnabled) return false;
  if (hasActiveNode) return false;
  return !pairingDeferred;
}

/// Whether onboarding copy should state that pairing is required.
///
/// Stricter than [needsPairingGate]: it stays true even after the user deferred,
/// because the facts have not changed — this phone still has no home node until
/// one is paired.
bool shouldSayPairingRequired({
  required bool mobileNodeEnabled,
  required bool hasActiveNode,
}) {
  return !mobileNodeEnabled && !hasActiveNode;
}
