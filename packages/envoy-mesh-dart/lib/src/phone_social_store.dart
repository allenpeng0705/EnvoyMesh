/// In-memory + optional disk-shaped store for phone-local social state.
library;

import 'dart:convert';

import 'models.dart';
import 'lan_owner_id.dart';
import 'social_backend.dart';

/// Known mesh peer (owner ↔ transport dial map).
class PhonePeerRecord {
  const PhonePeerRecord({
    required this.ownerId,
    required this.libp2pPeerId,
    this.devicePeerId,
    this.displayName,
    this.multiaddrs = const [],
    this.profile = const {},
    this.hopFreshUntilMs,
  });

  final String ownerId;
  final String libp2pPeerId;
  final String? devicePeerId;
  final String? displayName;
  final List<String> multiaddrs;
  final Map<String, dynamic> profile;

  /// Relay-hop state from the last discovery that saw this peer, as epoch ms.
  ///
  /// `null` = never reported (unknown), `0` = explicitly reported as *not* live,
  /// otherwise the deadline of a positive report. Stored addresses can be
  /// `/p2p-circuit/` paths, which stop working when the reservation lapses —
  /// without this a remembered peer would keep looking dialable forever.
  /// Read it with [hopSlotForRecord]; write it with [hopFreshUntilForReport].
  final int? hopFreshUntilMs;

  PhonePeerRecord copyWith({
    String? displayName,
    String? devicePeerId,
    List<String>? multiaddrs,
    Map<String, dynamic>? profile,
    int? hopFreshUntilMs,
  }) {
    return PhonePeerRecord(
      ownerId: ownerId,
      libp2pPeerId: libp2pPeerId,
      devicePeerId: devicePeerId ?? this.devicePeerId,
      displayName: displayName ?? this.displayName,
      multiaddrs: multiaddrs ?? this.multiaddrs,
      profile: profile ?? this.profile,
      hopFreshUntilMs: hopFreshUntilMs ?? this.hopFreshUntilMs,
    );
  }

  Map<String, dynamic> toJson() => {
        'ownerId': ownerId,
        'libp2pPeerId': libp2pPeerId,
        if (devicePeerId != null) 'devicePeerId': devicePeerId,
        if (displayName != null) 'displayName': displayName,
        'multiaddrs': multiaddrs,
        'profile': profile,
        if (hopFreshUntilMs != null) 'hopFreshUntilMs': hopFreshUntilMs,
      };

  factory PhonePeerRecord.fromJson(Map<String, dynamic> json) {
    final addrs = json['multiaddrs'];
    final hop = json['hopFreshUntilMs'];
    return PhonePeerRecord(
      ownerId: json['ownerId'] as String,
      libp2pPeerId: json['libp2pPeerId'] as String,
      devicePeerId: json['devicePeerId'] as String?,
      displayName: json['displayName'] as String?,
      multiaddrs: addrs is List ? addrs.map((e) => e.toString()).toList() : const [],
      profile: (json['profile'] as Map?)?.cast<String, dynamic>() ?? const {},
      hopFreshUntilMs: hop is num ? hop.toInt() : null,
    );
  }
}

/// How long a positive relay-hop report stays trusted without a refresh.
///
/// Comfortably longer than the phone's discovery/checkin cadence, so an open
/// Discover list does not flicker between dialable and pending; far shorter
/// than the relay's ~30 min reservation TTL, so a lapsed reservation is caught
/// within minutes instead of never.
const int phoneHopFreshWindowMs = 5 * 60 * 1000;

/// Encode a discovery hop report for persistence.
///
/// `null` (source silent) keeps whatever was stored before; `false` is recorded
/// as `0` ("reported not live") so it also *clears* an earlier positive report.
int? hopFreshUntilForReport(bool? hasHopSlot, {int? nowMs}) {
  if (hasHopSlot == null) return null;
  if (!hasHopSlot) return 0;
  return (nowMs ?? DateTime.now().millisecondsSinceEpoch) + phoneHopFreshWindowMs;
}

/// Relay-hop state for a stored peer, or `null` when never reported.
///
/// The deadline is inclusive: `hopFreshUntilMs` is the instant the report stops
/// being fresh.
bool? hopSlotForRecord(PhonePeerRecord record, {int? nowMs}) {
  final until = record.hopFreshUntilMs;
  if (until == null) return null;
  if (until <= 0) return false;
  return until >= (nowMs ?? DateTime.now().millisecondsSinceEpoch);
}

/// Pending inbound hello awaiting user accept.
class PendingHello {
  const PendingHello({
    required this.fromOwnerId,
    required this.fromDisplayName,
    required this.message,
    required this.libp2pPeerId,
    this.devicePeerId,
    required this.receivedAt,
  });

  final String fromOwnerId;
  final String? fromDisplayName;
  final String message;
  final String libp2pPeerId;
  final String? devicePeerId;
  final DateTime receivedAt;
}

/// Thread id for a phone-local DM (matches Home pattern `{nodeId}:{ownerId}`).
String phoneDmThreadId(String peerOwnerId) =>
    '$phoneLocalContextId:$peerOwnerId';

class PhoneSocialStore {
  Map<String, dynamic> profile = {};
  final Map<String, BondContact> bonds = {};
  final Map<String, PhonePeerRecord> peersByOwner = {};
  final Map<String, List<MeshChatMessage>> messagesByThread = {};
  final List<PendingHello> pendingHellos = [];

  BondContact? bondFor(String ownerId) => bonds[ownerId];

  PhonePeerRecord? peerFor(String ownerId) => peersByOwner[ownerId];

  void upsertPeer(PhonePeerRecord peer) {
    final prev = peersByOwner[peer.ownerId];
    if (prev == null) {
      peersByOwner[peer.ownerId] = peer;
    } else {
      // Merge so discovery refresh doesn't wipe devicePeerId / profile.
      peersByOwner[peer.ownerId] = PhonePeerRecord(
        ownerId: peer.ownerId,
        libp2pPeerId: peer.libp2pPeerId.isNotEmpty
            ? peer.libp2pPeerId
            : prev.libp2pPeerId,
        devicePeerId: peer.devicePeerId ?? prev.devicePeerId,
        displayName: peer.displayName ?? prev.displayName,
        multiaddrs: peer.multiaddrs.isEmpty
            ? prev.multiaddrs
            : {...prev.multiaddrs, ...peer.multiaddrs}.toList(),
        profile: peer.profile.isEmpty
            ? prev.profile
            : {...prev.profile, ...peer.profile},
        // Newest hop report wins — including an explicit `0` (not live), which
        // clears an earlier positive report for the same peer.
        hopFreshUntilMs: peer.hopFreshUntilMs ?? prev.hopFreshUntilMs,
      );
    }
    // Real owner supersedes any locally invented placeholder (`lan:` /
    // `relay:<libp2pPeerId>`) for the same libp2p peer.
    if (!isProvisionalOwnerId(peer.ownerId) &&
        peer.libp2pPeerId.isNotEmpty) {
      final libp2p = peer.libp2pPeerId;
      peersByOwner.removeWhere(
        (id, p) =>
            isProvisionalOwnerId(id) && p.libp2pPeerId == libp2p,
      );
    }
  }

  void upsertBond(BondContact contact) {
    bonds[contact.ownerId] = contact;
  }

  void removeBond(String ownerId) {
    bonds.remove(ownerId);
  }

  void addPendingHello(PendingHello hello) {
    pendingHellos.removeWhere((h) => h.fromOwnerId == hello.fromOwnerId);
    pendingHellos.add(hello);
  }

  void clearPendingHello(String fromOwnerId) {
    pendingHellos.removeWhere((h) => h.fromOwnerId == fromOwnerId);
  }

  void appendMessage(MeshChatMessage message) {
    final list = messagesByThread.putIfAbsent(message.threadId, () => []);
    // Dedupe by id
    list.removeWhere((m) => m.id == message.id);
    list.insert(0, message); // newest first
  }

  List<MeshChatMessage> history(String peerOwnerId, {int limit = 50}) {
    final threadId = phoneDmThreadId(peerOwnerId);
    final list = messagesByThread[threadId] ?? const [];
    if (list.length <= limit) return List.unmodifiable(list);
    return List.unmodifiable(list.take(limit));
  }

  /// Snapshot suitable for SecureStorage / file persistence.
  String encodeSnapshot() {
    return jsonEncode({
      'profile': profile,
      'bonds': bonds.values
          .map((c) => {
                'peerOwnerId': c.ownerId,
                'displayName': c.displayName,
                'level': c.bondLevel,
              })
          .toList(),
      'peers': peersByOwner.values.map((p) => p.toJson()).toList(),
      'pendingHellos': pendingHellos
          .map((h) => {
                'fromOwnerId': h.fromOwnerId,
                'fromDisplayName': h.fromDisplayName,
                'message': h.message,
                'libp2pPeerId': h.libp2pPeerId,
                'devicePeerId': h.devicePeerId,
                'receivedAt': h.receivedAt.toIso8601String(),
              })
          .toList(),
      'messages': messagesByThread.map(
        (threadId, msgs) => MapEntry(
          threadId,
          msgs
              .map((m) => {
                    'id': m.id,
                    'threadId': m.threadId,
                    'senderOwnerId': m.senderOwnerId,
                    'senderDisplayName': m.senderDisplayName,
                    'text': m.text,
                    'createdAt': m.createdAt,
                    'isOutbound': m.isOutbound,
                  })
              .toList(),
        ),
      ),
    });
  }

  void loadSnapshot(String raw) {
    final root = jsonDecode(raw) as Map<String, dynamic>;
    profile = (root['profile'] as Map?)?.cast<String, dynamic>() ?? {};
    bonds.clear();
    for (final row in (root['bonds'] as List? ?? const [])) {
      final c = BondContact.fromJson(Map<String, dynamic>.from(row as Map));
      bonds[c.ownerId] = c;
    }
    peersByOwner.clear();
    for (final row in (root['peers'] as List? ?? const [])) {
      final p = PhonePeerRecord.fromJson(Map<String, dynamic>.from(row as Map));
      peersByOwner[p.ownerId] = p;
    }
    pendingHellos.clear();
    for (final row in (root['pendingHellos'] as List? ?? const [])) {
      final m = Map<String, dynamic>.from(row as Map);
      pendingHellos.add(PendingHello(
        fromOwnerId: m['fromOwnerId'] as String,
        fromDisplayName: m['fromDisplayName'] as String?,
        message: (m['message'] as String?) ?? '',
        libp2pPeerId: m['libp2pPeerId'] as String,
        devicePeerId: m['devicePeerId'] as String?,
        receivedAt: DateTime.tryParse(m['receivedAt'] as String? ?? '') ??
            DateTime.now().toUtc(),
      ));
    }
    messagesByThread.clear();
    final msgsRoot = root['messages'] as Map? ?? {};
    for (final entry in msgsRoot.entries) {
      final threadId = entry.key.toString();
      final list = <MeshChatMessage>[];
      for (final row in (entry.value as List? ?? const [])) {
        final m = Map<String, dynamic>.from(row as Map);
        list.add(MeshChatMessage(
          id: m['id'] as String,
          threadId: (m['threadId'] as String?) ?? threadId,
          senderOwnerId: m['senderOwnerId'] as String?,
          senderDisplayName: m['senderDisplayName'] as String?,
          text: m['text'] as String?,
          createdAt: m['createdAt'] as String?,
          isOutbound: m['isOutbound'] == true,
        ));
      }
      messagesByThread[threadId] = list;
    }
  }
}
