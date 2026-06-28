import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/peer_connection_info.dart';
import 'contact_provider.dart';
import 'node_provider.dart';

const _backgroundPollMs = 60000;
const _watchPollMs = 10000;

class ContactReachabilityState {
  final Map<String, PeerConnectionInfo> infoByOwnerId;
  final Set<String> checkingOwnerIds;
  final Set<String> watchedOwnerIds;

  const ContactReachabilityState({
    this.infoByOwnerId = const {},
    this.checkingOwnerIds = const {},
    this.watchedOwnerIds = const {},
  });

  PeerConnectionInfo? infoFor(String ownerId) => infoByOwnerId[ownerId];

  bool isChecking(String ownerId) => checkingOwnerIds.contains(ownerId);

  ContactReachabilityState copyWith({
    Map<String, PeerConnectionInfo>? infoByOwnerId,
    Set<String>? checkingOwnerIds,
    Set<String>? watchedOwnerIds,
  }) {
    return ContactReachabilityState(
      infoByOwnerId: infoByOwnerId ?? this.infoByOwnerId,
      checkingOwnerIds: checkingOwnerIds ?? this.checkingOwnerIds,
      watchedOwnerIds: watchedOwnerIds ?? this.watchedOwnerIds,
    );
  }
}

final contactReachabilityProvider = StateNotifierProvider<
    ContactReachabilityNotifier, ContactReachabilityState>((ref) {
  return ContactReachabilityNotifier(ref);
});

class ContactReachabilityNotifier
    extends StateNotifier<ContactReachabilityState> {
  ContactReachabilityNotifier(this._ref)
      : super(const ContactReachabilityState()) {
    _ref.listen(nodeProvider, (prev, next) {
      final wasConnected =
          prev?.connectionState == NodeConnectionState.connected;
      final isConnected =
          next.connectionState == NodeConnectionState.connected;
      if (isConnected && !wasConnected) {
        _startPolling();
        unawaited(refreshAll(warm: true));
      } else if (!isConnected && wasConnected) {
        _stopPolling();
        state = const ContactReachabilityState();
      }
    });

    _ref.listen(contactProvider, (prev, next) {
      if (_ref.read(nodeProvider).connectionState !=
          NodeConnectionState.connected) {
        return;
      }
      final prevIds = prev?.bonds.map((c) => c.ownerId).toSet() ?? {};
      final nextIds = next.bonds.map((c) => c.ownerId).toSet();
      if (prevIds.length != nextIds.length || !prevIds.containsAll(nextIds)) {
        unawaited(refreshAll());
      }
    });

    if (_ref.read(nodeProvider).connectionState ==
        NodeConnectionState.connected) {
      _startPolling();
      unawaited(refreshAll(warm: true));
    }
  }

  final Ref _ref;
  Timer? _pollTimer;
  int _pollTick = 0;
  final Set<String> _refreshInFlight = {};

  void _startPolling() {
    _pollTimer ??= Timer.periodic(
      const Duration(milliseconds: _watchPollMs),
      (_) => _onPollTick(),
    );
  }

  void _stopPolling() {
    _pollTimer?.cancel();
    _pollTimer = null;
    _pollTick = 0;
    _refreshInFlight.clear();
  }

  void _onPollTick() {
    if (_ref.read(nodeProvider).connectionState !=
        NodeConnectionState.connected) {
      return;
    }
    _pollTick++;
    final watched = state.watchedOwnerIds.toList();
    if (watched.isNotEmpty) {
      unawaited(refreshMany(watched, keepAlive: true));
    }
    if (_pollTick * _watchPollMs >= _backgroundPollMs) {
      _pollTick = 0;
      unawaited(refreshAll(verifyOnly: true));
    }
  }

  /// Faster polling while a direct-chat screen is open.
  void watch(String ownerId) {
    if (ownerId.isEmpty) return;
    final watched = {...state.watchedOwnerIds, ownerId};
    state = state.copyWith(watchedOwnerIds: watched);
    unawaited(refreshOne(ownerId, warm: true));
  }

  void unwatch(String ownerId) {
    if (!state.watchedOwnerIds.contains(ownerId)) return;
    final watched = {...state.watchedOwnerIds}..remove(ownerId);
    state = state.copyWith(watchedOwnerIds: watched);
  }

  Future<void> refreshAll({bool warm = false, bool verifyOnly = false}) async {
    final bonds = _ref.read(contactProvider).bonds;
    if (bonds.isEmpty) return;
    await refreshMany(
      bonds.map((c) => c.ownerId).toList(),
      warm: warm,
      verifyOnly: verifyOnly,
    );
  }

  Future<void> refreshMany(
    List<String> ownerIds, {
    bool warm = false,
    bool verifyOnly = false,
    bool keepAlive = false,
  }) async {
    await Future.wait(
      ownerIds.map(
        (id) => refreshOne(
          id,
          warm: warm,
          verifyOnly: verifyOnly,
          keepAlive: keepAlive,
        ),
      ),
    );
  }

  Future<void> refreshOne(
    String ownerId, {
    bool warm = false,
    bool verifyOnly = false,
    bool keepAlive = false,
  }) async {
    if (ownerId.isEmpty || _refreshInFlight.contains(ownerId)) return;

    final client = _ref.read(nodeServiceProvider);
    if (client == null ||
        _ref.read(nodeProvider).connectionState !=
            NodeConnectionState.connected) {
      return;
    }

    _refreshInFlight.add(ownerId);
    final checking = {...state.checkingOwnerIds, ownerId};
    state = state.copyWith(checkingOwnerIds: checking);

    try {
      final PeerConnectionInfo info;
      if (warm || keepAlive || verifyOnly) {
        info = await client.warmContactConnection(
          ownerId,
          warm: warm,
          verifyOnly: verifyOnly,
          keepAlive: keepAlive,
        );
      } else {
        info = await client.getPeerConnectionInfo(ownerId);
      }
      final nextInfo = Map<String, PeerConnectionInfo>.from(
        state.infoByOwnerId,
      )..[ownerId] = info;
      state = state.copyWith(infoByOwnerId: nextInfo);
    } catch (_) {
      final nextInfo = Map<String, PeerConnectionInfo>.from(
        state.infoByOwnerId,
      )..[ownerId] = PeerConnectionInfo.offline;
      state = state.copyWith(infoByOwnerId: nextInfo);
    } finally {
      _refreshInFlight.remove(ownerId);
      final doneChecking = {...state.checkingOwnerIds}..remove(ownerId);
      state = state.copyWith(checkingOwnerIds: doneChecking);
    }
  }

  @override
  void dispose() {
    _stopPolling();
    super.dispose();
  }
}
