/// Cross-persona bond suggestions (Home ↔ phone). Suggestions only — no auto-merge.
library;

import 'models.dart';

/// Where the suggested contact is already bonded.
enum CrossPersonaSource { home, phone }

class CrossPersonaSuggestion {
  const CrossPersonaSuggestion({
    required this.ownerId,
    required this.source,
    this.displayName,
    this.bondLevel,
    this.libp2pPeerId,
  });

  final String ownerId;
  final CrossPersonaSource source;
  final String? displayName;
  final String? bondLevel;

  /// Present when source is phone (helps phone→mesh dial after Hello).
  final String? libp2pPeerId;

  String get sourceLabel =>
      source == CrossPersonaSource.home ? 'home' : 'phone';
}

/// Build suggestions from [sourceBonds] for the *other* persona.
///
/// Match key is peer [BondContact.ownerId] only (never libp2p PeerId alone).
/// Skips self, already-bonded-on-target, and dismissed ids.
List<CrossPersonaSuggestion> buildCrossPersonaSuggestions({
  required List<BondContact> sourceBonds,
  required CrossPersonaSource source,
  required Set<String> targetBondedOwnerIds,
  Set<String> dismissedOwnerIds = const {},
  String? selfOwnerIdOnTarget,
  Map<String, String> libp2pPeerIdByOwner = const {},
}) {
  final out = <CrossPersonaSuggestion>[];
  final seen = <String>{};
  for (final bond in sourceBonds) {
    final id = bond.ownerId.trim();
    if (id.isEmpty) continue;
    if (selfOwnerIdOnTarget != null && id == selfOwnerIdOnTarget) continue;
    if (id.startsWith('envoy_device_')) continue;
    if (targetBondedOwnerIds.contains(id)) continue;
    if (dismissedOwnerIds.contains(id)) continue;
    if (!seen.add(id)) continue;
    out.add(CrossPersonaSuggestion(
      ownerId: id,
      source: source,
      displayName: bond.displayName,
      bondLevel: bond.bondLevel,
      libp2pPeerId: libp2pPeerIdByOwner[id],
    ));
  }
  out.sort((a, b) {
    final an = (a.displayName ?? a.ownerId).toLowerCase();
    final bn = (b.displayName ?? b.ownerId).toLowerCase();
    return an.compareTo(bn);
  });
  return out;
}
