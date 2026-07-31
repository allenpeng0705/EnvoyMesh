import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'app.dart';
import 'providers/chat_provider.dart';
import 'providers/node_provider.dart';
import 'screens/browser/browser_screen.dart';
import 'screens/chat/chat_detail_screen.dart';
import 'services/push_notification_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Phase 50 — initialize push BEFORE runApp so getInitialMessage()
  // (Android cold-start) resolves before _EnvoyGoRootState.initState()
  // drains the pending-tap buffer. initialize() is idempotent + swallows
  // errors for missing google-services.json, so this is safe to call
  // unconditionally. The pushEnabled preference is NOT checked here —
  // that's checked at registerPushToken() time. initialize() just
  // acquires the token + sets up listeners; it doesn't register.
  // ignore: unawaited_futures
  PushNotificationService().initialize();
  runApp(
    const ProviderScope(
      child: _EnvoyGoRoot(),
    ),
  );
}

/// Root widget that initializes node loading on startup.
class _EnvoyGoRoot extends ConsumerStatefulWidget {
  const _EnvoyGoRoot();

  @override
  ConsumerState<_EnvoyGoRoot> createState() => _EnvoyGoRootState();
}

class _EnvoyGoRootState extends ConsumerState<_EnvoyGoRoot>
    with WidgetsBindingObserver {
  StreamSubscription<Map<String, dynamic>>? _pushTapSub;
  /// Buffered cold-start tap waiting for the active node to load.
  Map<String, dynamic>? _pendingColdStartTap;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Load paired nodes on app start.
    Future.microtask(() async {
      try {
        await ref.read(nodeProvider.notifier).loadPairedNodes();
      } catch (e) {
        developer.log('[main] loadPairedNodes threw: $e', name: 'EnvoyGo');
      }
      // Phase 50 — after nodes load, retry any buffered cold-start tap
      // that couldn't route because activeNode was null.
      if (_pendingColdStartTap != null) {
        final tap = _pendingColdStartTap;
        _pendingColdStartTap = null;
        _routeNotificationTap(tap!);
      }
    });
    // Phase 50 — subscribe to push-notification taps for deep-link navigation.
    _subscribeToPushTaps();
  }

  void _subscribeToPushTaps() {
    final push = PushNotificationService();
    _pushTapSub = push.onNotificationTap.listen((raw) {
      _routeNotificationTap(raw);
    });
    // Replay any cold-start tap that arrived before the subscriber attached
    // (Android: getInitialMessage buffered during _initAndroidFcm).
    // Because initialize() now runs in main() before runApp, the buffer
    // is populated by the time initState runs.
    final pending = push.consumePendingInitialTap();
    if (pending != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _routeNotificationTap(pending);
      });
    }
  }

  /// Map a push-notification payload to the target screen and navigate.
  void _routeNotificationTap(Map<String, dynamic> raw) {
    final nav = EnvoyGoApp.navigatorKey.currentState;
    if (nav == null) return; // navigator not ready yet
    final hint = PushNotificationService().handleNotificationTap(raw);
    if (hint == null) return;

    final isOwner = ref.read(nodeProvider).isOwnerProfile;
    final type = hint['type'];
    switch (type) {
      case 'feed_notify':
        // Feed / vault is owner-only (Phase 51E).
        if (!isOwner) {
          ref.read(chatProvider.notifier).selectTab(0);
          break;
        }
        final url = hint['url'] as String?;
        if (url != null && url.isNotEmpty) {
          nav.push(MaterialPageRoute(
            builder: (_) => BrowserScreen(initialUrl: url),
          ));
        }
        break;
      case 'bond_request':
      case 'approval':
        // Inbox is owner-only; family stack has no Inbox tab.
        if (!isOwner) {
          ref.read(chatProvider.notifier).selectTab(0);
          break;
        }
        ref.read(chatProvider.notifier).selectTab(1);
        break;
      case 'pi_proposal':
        // Pi is owner-only.
        ref.read(chatProvider.notifier).selectTab(0);
        break;
      default:
        // Chat thread (direct, room, or Ext Agent).
        final threadType = hint['threadType'] as String?;
        final senderOwnerId = hint['senderOwnerId'] as String?;
        final roomId = hint['roomId'] as String?;
        final senderName = hint['senderName'] as String?;
        final agentType = hint['agentType'] as String?;
        final nodeId = ref.read(nodeProvider).activeNode?.id;
        if (nodeId == null) {
          _pendingColdStartTap = raw;
          return;
        }
        ref.read(chatProvider.notifier).selectTab(0);
        if (threadType == 'external' || agentType == 'external') {
          nav.push(MaterialPageRoute(
            builder: (_) => ChatDetailScreen(
              threadId: '$nodeId:external',
              displayName: senderName ?? 'Ext Agent',
              agentType: 'external',
            ),
          ));
          break;
        }
        if (threadType == 'bot' ||
            (senderOwnerId != null && senderOwnerId.startsWith('bot:'))) {
          final botKey = (senderOwnerId != null && senderOwnerId.startsWith('bot:'))
              ? senderOwnerId
              : null;
          if (botKey == null || botKey.length <= 4) return;
          nav.push(MaterialPageRoute(
            builder: (_) => ChatDetailScreen(
              threadId: '$nodeId:$botKey',
              displayName: senderName ?? botKey.substring(4),
              agentType: botKey,
            ),
          ));
          break;
        }
        if (threadType == 'envoyai' || agentType == 'envoyai') {
          nav.push(MaterialPageRoute(
            builder: (_) => ChatDetailScreen(
              threadId: '$nodeId:envoyai',
              displayName: 'EnvoyAI',
              agentType: 'envoyai',
            ),
          ));
          break;
        }
        if (threadType == 'family') {
          final threadKey = hint['threadKey'] as String?;
          if (threadKey == null || !threadKey.startsWith('family:')) return;
          nav.push(MaterialPageRoute(
            builder: (_) => ChatDetailScreen(
              threadId: '$nodeId:$threadKey',
              displayName: senderName ?? senderOwnerId ?? 'Family',
              contactOwnerId: senderOwnerId,
            ),
          ));
          break;
        }
        if (threadType == 'room' || roomId != null) {
          var bareRoomId = roomId ?? '';
          if (bareRoomId.startsWith('room:')) {
            bareRoomId = bareRoomId.substring('room:'.length);
          }
          if (bareRoomId.isEmpty) return;
          final isFamilyRoom = hint['roomKind'] == 'family';
          final threadId = '$nodeId:room:$bareRoomId';
          if (isFamilyRoom) {
            ref.read(chatProvider.notifier).onRoomUpdated({
              'roomId': bareRoomId,
              'title': senderName ?? 'Family group',
              'kind': 'family',
            });
          }
          nav.push(MaterialPageRoute(
            builder: (_) => ChatDetailScreen(
              threadId: threadId,
              displayName: senderName ?? bareRoomId,
              chatRoomId: bareRoomId,
              isFamilyRoom: isFamilyRoom,
            ),
          ));
          break;
        }
        if (senderOwnerId == null) return;
        // Mesh DMs are owner-only.
        if (!isOwner) {
          ref.read(chatProvider.notifier).selectTab(0);
          break;
        }
        nav.push(MaterialPageRoute(
          builder: (_) => ChatDetailScreen(
            threadId: '$nodeId:$senderOwnerId',
            displayName: senderName ?? senderOwnerId,
            contactOwnerId: senderOwnerId,
          ),
        ));
        break;
    }
  }

  @override
  void dispose() {
    _pushTapSub?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Delegate to the supervisor via kickReconnect(). It already
      // short-circuits when connected, so calling it on every
      // resume (including transient notification-bar peeks) is
      // safe. The supervisor also picks up the new candidate
      // list if the user moved networks while backgrounded.
      ref.read(nodeProvider.notifier).kickReconnect();
    }
  }

  @override
  Widget build(BuildContext context) {
    return EnvoyGoApp();
  }
}
