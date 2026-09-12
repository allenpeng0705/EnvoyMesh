import 'dart:async';
import 'dart:developer' as developer;

import 'package:envoy_thin_client/services/home_remote_client.dart';
import 'package:envoy_thin_client/services/pairing_uri.dart' as pairing_uri;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../connection/home_connection_hooks.dart';
import '../connection/node_connection_provider.dart';
import '../navigation/owner_tabs.dart';
import '../services/product/library_read_cache.dart';
import '../services/product/node_service_client.dart';
import '../services/product/pairing_service.dart';
import '../services/product/push_notification_service.dart';
import '../services/product/push_preferences.dart';
import '../storage/local_database.dart';
import 'chat_provider.dart';
import 'contact_provider.dart';
import 'content_engage_provider.dart';
import 'feed_notify_provider.dart';
import 'social_context_provider.dart';
import 'terminal_provider.dart';

/// Log a message that is always visible, even in release builds.
void _log(String msg) {
  developer.log(msg, name: 'HomeProductSync');
}

/// The product half of the home connection — everything `NodeNotifier` used to
/// do by reaching into the product providers directly.
///
/// **Workstream A5 (dependency inversion).** The connection layer no longer
/// imports a single product module. It dispatches the same lifecycle moments
/// through [HomeConnectionHooks]; this class implements them and does the
/// product work: contact/room/terminal/inbox sync, AI-chat bridge status,
/// family-profile application to chat, push-token registration, per-node cache
/// clearing, and the pairing handshake RPC.
///
/// Installed into the container's [HomeConnectionHooksRegistry] by
/// [homeProductSyncProvider], which `main.dart` reads at app start.
class HomeProductSync implements HomeConnectionHooks {
  HomeProductSync(this._ref);

  final Ref _ref;

  /// Live transport of the active home node, or `null` when not connected.
  HomeRemoteClient? get _client => _ref.read(nodeProvider.notifier).client;

  /// Typed RPC client for the active transport (product provider).
  NodeServiceClient? get _nodeService => _ref.read(nodeServiceProvider);

  /// True while the Social plane is the on-device phone mesh, not the home.
  bool get _isPhone => _ref.read(socialContextProvider).isPhone;

  /// Guard used by every home push handler: on-device mesh owns Social then.
  bool _skipForPhonePlane() => _isPhone;

  @override
  void onConnected() {
    final client = _client;
    final nodeService = _nodeService;
    if (client == null || nodeService == null) return;

    final chatNotifier = _ref.read(chatProvider.notifier);
    final contactNotifier = _ref.read(contactProvider.notifier);
    final nodeState = _ref.read(nodeProvider);

    // Sync contacts / mesh rooms / terminals — owner only (Phase 51E).
    // Skip when Social context is phone — phone persona uses SocialBackend.
    if (nodeState.isOwnerProfile && !_isPhone) {
      _syncBondsDirect(nodeService, contactNotifier).then((_) {
        final node = nodeState.activeNode;
        if (node != null) {
          chatNotifier.loadThreads(node.id);
        }
        // Create threads for all bonded contacts, then refresh display names.
        _ref.read(chatProvider.notifier).createContactThreads();
        _ref.read(chatProvider.notifier).refreshThreadDisplayNames();
      });

      // Rooms and terminals — same pattern as EH: one sync call with stale prune.
      _syncRoomsDirect(nodeService, chatNotifier);
      unawaited(chatNotifier.syncTerminals());
      unawaited(chatNotifier.syncEhChats());
      _syncInboxDirect(nodeService, chatNotifier);
      // Phase 45E — pull persisted feed.notify Inbox rows from home.
      _ref.read(feedNotifyProvider.notifier).refresh();
      _ref.read(contentEngageProvider.notifier).refresh();
    } else if (!nodeState.isOwnerProfile) {
      // Family members: restore cached AI + family threads only.
      final node = nodeState.activeNode;
      if (node != null) {
        unawaited(chatNotifier.loadThreads(node.id));
      }
      unawaited(chatNotifier.syncFamilyRooms());
    }

    // EnvoyAI (OpenClaw) — always create, built-in.
    chatNotifier.onBridgeStatus({
      'enabled': true,
      'agentName': 'EnvoyAI',
      'agentType': 'envoyai',
    });

    // Ext Agent (HomeClaw / Pi / Hermes / …) — create the thread, then
    // refresh name from bridge status (current agent name, no Online/Offline).
    chatNotifier.onBridgeStatus({
      'enabled': false,
      'agentName': 'Ext Agent',
      'agentType': 'external',
    });
    nodeService.getBridgeStatus().then((status) {
      chatNotifier.onBridgeStatus(status);
    }).catchError((e) {
      _log('getBridgeStatus failed: $e');
    });

    // Pi coding TUI lives under Terminals (New Pi), not as an AI chat row.
  }

  @override
  void onPushEvent(String event, dynamic data) {
    final nodeState = _ref.read(nodeProvider);
    final chatNotifier = _ref.read(chatProvider.notifier);
    switch (event) {
      case 'chat:message':
        if (_skipForPhonePlane()) return;
        _log('[push] chat:message received: $data');
        if (data is Map<String, dynamic>) {
          chatNotifier.onChatMessage(data);
        }
      case 'chat:room-message':
        if (_skipForPhonePlane()) return;
        if (data is Map<String, dynamic>) {
          chatNotifier.onRoomMessage(data);
        }
      case 'chat:delivered':
        if (_skipForPhonePlane()) return;
        if (data is Map<String, dynamic>) {
          chatNotifier.onChatDelivered(data);
        }
      case 'chat:delivery-failed':
        if (_skipForPhonePlane()) return;
        if (data is Map<String, dynamic>) {
          chatNotifier.onChatDeliveryFailed(data);
        }
      case 'chat:room-updated':
        if (_skipForPhonePlane()) return;
        // Mesh room events are owner-only; family rooms also arrive here
        // remapped — family members still need room-updated for groups.
        if (data is Map<String, dynamic>) {
          chatNotifier.onRoomUpdated(data);
        }
      case 'chat:room-removed':
        if (_skipForPhonePlane()) return;
        if (data is Map<String, dynamic>) {
          final roomId = data['roomId'] as String?;
          if (roomId != null && roomId.isNotEmpty) {
            chatNotifier.onRoomRemoved(roomId);
          }
        }
      case 'bond:established':
        if (_skipForPhonePlane()) return;
        if (!nodeState.isOwnerProfile) return;
        _ref.read(contactProvider.notifier).onBondEstablished();
      case 'bond:revoked':
        if (_skipForPhonePlane()) return;
        if (!nodeState.isOwnerProfile) return;
        if (data is Map<String, dynamic>) {
          _ref
              .read(contactProvider.notifier)
              .onBondRevoked(data['peerOwnerId'] as String? ?? '');
        }
      case 'bridge:status':
        if (data is Map<String, dynamic>) {
          chatNotifier.onBridgeStatus(data);
        }
      case 'agent:activity':
        // Mesh agent activity is owner-only — family members must not get
        // these as chat:message (they showed up as Inbox-like threads).
        if (!nodeState.isOwnerProfile) return;
        _log('[push] agent:activity received: $data');
        if (data is Map<String, dynamic>) {
          chatNotifier.onChatMessage(data);
        }
      case 'terminal:session-updated':
        if (!nodeState.isOwnerProfile) return;
        unawaited(chatNotifier.syncTerminals());
      case 'feed:notify':
        if (!nodeState.isOwnerProfile) return;
        if (data is Map<String, dynamic>) {
          _ref.read(feedNotifyProvider.notifier).upsertFromEvent(data);
        }
      case 'content:engage':
        if (!nodeState.isOwnerProfile) return;
        if (data is Map<String, dynamic>) {
          _ref.read(contentEngageProvider.notifier).upsertFromEvent(data);
        }
    }
  }

  @override
  void onNodeConfig(Map<String, dynamic> config) {
    // Sync dynamic AI character bots for this session's profile.
    // Family members must still call sync (often with []) so a leaked owner
    // bot like Luna is removed from local chat threads.
    final node = _ref.read(nodeProvider).activeNode;
    if (node != null) {
      final raw = config['aiBots'];
      final bots = raw is List ? raw : const [];
      _ref.read(chatProvider.notifier).syncAiBots(bots, node.id);
    }
    unawaited(_ref.read(chatProvider.notifier).syncEhChats());
  }

  @override
  void onProfilesChanged(List<Map<String, dynamic>> profiles, String nodeId) {
    _ref.read(chatProvider.notifier).syncFamilyContacts(profiles, nodeId);
    unawaited(_ref.read(chatProvider.notifier).syncFamilyRooms());
  }

  @override
  void onOwnerRoleChanged(bool isOwner) {
    // Tab sets differ by role; reset to Social/Chats (id-based — no index
    // collision).
    _ref
        .read(chatProvider.notifier)
        .selectTab(fallbackHomeTabId(isOwner: isOwner));
  }

  @override
  void onExtAgentVisibilityRefreshNeeded() {
    // Owner toggled Ext Agent allow — refresh chat-row visibility from RPC
    // (masked getBridgeStatus) so we do not wait for an unrelated bridge push.
    unawaited(_refreshExtAgentBridgeVisibility());
  }

  Future<void> _refreshExtAgentBridgeVisibility() async {
    final ns = _nodeService;
    if (ns == null) return;
    try {
      final status = await ns.getBridgeStatus();
      _ref.read(chatProvider.notifier).onBridgeStatus(status);
    } catch (e) {
      _log('refresh Ext Agent bridge visibility failed: $e');
    }
  }

  @override
  Future<void> onPushRegistrationNeeded() async {
    final client = _client;
    if (client == null) return;
    final nodeState = _ref.read(nodeProvider);
    // If the user disabled push in the app settings, skip registration
    // entirely. The home node has no token → no push.
    final profileId = nodeState.effectiveFamilyProfileId;
    if (!await PushPreferences.isEnabled(profileId: profileId)) {
      return;
    }
    final push = PushNotificationService();
    await push.initialize();
    await push.registerWithHomeNode(
      (method, [params]) => client.call(method, params),
      ownerId: nodeState.ownerId ?? nodeState.activeNode?.ownerId,
      profileId: profileId,
    );
  }

  @override
  void onDisconnected() {
    _ref.read(feedNotifyProvider.notifier).clear();
    _ref.read(contentEngageProvider.notifier).clear();
  }

  @override
  void onNodeForgotten(String nodeId) {
    // Drop in-memory UI state so chats don't linger after unpair.
    _ref.read(chatProvider.notifier).clearForNode(nodeId);
    _ref.read(contactProvider.notifier).clear();
    _ref.read(terminalProvider.notifier).clear();
  }

  @override
  Future<void> onNodeSwitched() async {
    // Avoid serving the previous home's vault/media under the same paths.
    await LibraryReadCache.instance.clear();
  }

  @override
  Future<Map<String, dynamic>> pairHome({
    required String pairingToken,
    required String deviceName,
    required String deviceId,
    required Map<String, dynamic> profileBindings,
  }) async {
    final client = _client;
    if (client == null) {
      throw StateError('pairHome called without a connected pairing transport');
    }
    final nodeService = NodeServiceClient(client);
    final service = PairingService(nodeService);
    final result = await service.pair(
      pairingToken: pairingToken,
      deviceName: deviceName,
      deviceId: deviceId,
      profileId: profileBindings['profileId'] as String?,
      profileName: profileBindings['profileName'] as String?,
      profileAvatarColor: profileBindings['profileAvatarColor'] as String?,
    );
    return {
      'sessionToken': result.sessionToken,
      'ownerId': result.ownerId,
      'profileId': result.profileId,
      'isOwnerProfile': result.isOwnerProfile,
      'familyProfiles': result.familyProfiles,
    };
  }

  // -- Direct sync helpers (moved here from NodeNotifier) --

  Future<void> _syncBondsDirect(
    NodeServiceClient nodeService,
    ContactNotifier contactNotifier,
  ) async {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    try {
      final bonds = await nodeService.getBonds();
      // Filter out self-identity (shared-identity devices are bonds to self).
      // Same rule as `ContactNotifier.syncBonds`; both call sites
      // go through the shared helper to keep the behaviour identical.
      final filtered = filterSelfBonds(bonds, nodeState.ownerId);
      final localDb = LocalDatabase();
      await localDb.upsertContacts(
        nodeState.activeNode!.id,
        filtered.map((c) => c.toJson()).toList(),
      );
      // Update contact state directly (avoid nodeServiceProvider null cache).
      // Home reconnect updates Home bonds only (phone section stays intact).
      contactNotifier.setBonds(filtered);
    } catch (e) {
      _log('_syncBondsDirect failed: $e');
    }
  }

  void _syncRoomsDirect(
    NodeServiceClient nodeService,
    ChatNotifier chatNotifier,
  ) {
    // Use ChatNotifier.syncRooms() — creates group threads for every room
    // (including quiet ones). Do NOT funnel through onRoomMessage (that
    // path drops empty text and was hiding rooms after listChatRooms).
    chatNotifier.syncRooms(client: nodeService).catchError((Object e) {
      _log('_syncRoomsDirect failed: $e');
    });
  }

  void _syncInboxDirect(
    NodeServiceClient nodeService,
    ChatNotifier chatNotifier,
  ) {
    nodeService.listPendingSocialIntroProposals().then((result) {
      for (final item in result) {
        final from = item['fromOwnerId'] as String?;
        final displayName = item['fromDisplayName'] as String?;
        if (from != null) {
          chatNotifier.onChatMessage({
            'senderOwnerId': from,
            'senderDisplayName': displayName ?? from,
            'text': 'Wants to connect',
            'messageId': 'intro_${from}',
            'createdAt': DateTime.now().toIso8601String(),
          });
        }
      }
    }).catchError((e) {
      _log('_syncInboxDirect failed: $e');
    });
  }
}

/// Installs the product hooks for this container.
///
/// Read once at app start (`main.dart`); non-autoDispose, so the installed
/// hooks stay alive for the life of the container.
final homeProductSyncProvider = Provider<HomeProductSync>((ref) {
  final sync = HomeProductSync(ref);
  ref.read(homeConnectionHooksRegistryProvider).install(sync);
  return sync;
});

/// Preview the profiles a pre-auth family invite can bind to.
///
/// Moved out of `NodeNotifier` (Workstream A5): it is a product-plane RPC, and
/// the connection layer only contributes the transport factory and device id.
Future<List<Map<String, dynamic>>> previewFamilyInviteProfiles(
  NodeNotifier notifier,
  pairing_uri.PairingData data,
  List<HomeRemoteCandidate> candidates,
) async {
  final client = HomeRemoteClient(
    notifier.buildClientOptionsForCandidates(candidates),
  );
  try {
    await client.ensureConnected();
    final nodeService = NodeServiceClient(client);
    final deviceId = await notifier.clientDeviceId();
    return await nodeService.previewFamilyInvite(
      pairingToken: data.token,
      deviceId: deviceId,
    );
  } finally {
    client.dispose();
  }
}
