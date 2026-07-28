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

    final type = hint['type'];
    switch (type) {
      case 'feed_notify':
        // Feed notification → open Browser at the published URL.
        final url = hint['url'] as String?;
        if (url != null && url.isNotEmpty) {
          nav.push(MaterialPageRoute(
            builder: (_) => BrowserScreen(initialUrl: url),
          ));
        }
        break;
      case 'bond_request':
        // Contact request → switch to the Inbox tab (index 1) so the
        // user can review and approve. Bond request payloads don't yet
        // carry a target id for deeper routing.
        ref.read(chatProvider.notifier).selectTab(1);
        break;
      case 'approval':
        // Approval-queue item → switch to the Inbox tab where approvals live.
        ref.read(chatProvider.notifier).selectTab(1);
        break;
      case 'pi_proposal':
        // Pi tool-action request → switch to the Chats tab where the Pi
        // thread lives. The confirm dialog appears when the user opens Pi.
        ref.read(chatProvider.notifier).selectTab(0);
        break;
      default:
        // Chat thread (direct or room). The payload carries senderOwnerId
        // (for direct chat) or roomId (for group chat). We assemble the
        // threadId as "<nodeId>:<ownerId>" or "<nodeId>:<roomId>" to match
        // the existing ChatDetailScreen navigation pattern.
        final senderOwnerId = hint['senderOwnerId'] as String?;
        final roomId = hint['roomId'] as String?;
        if (senderOwnerId == null && roomId == null) return;
        final nodeId = ref.read(nodeProvider).activeNode?.id;
        if (nodeId == null) {
          // Cold-start: active node not loaded yet. Buffer and retry
          // after loadPairedNodes completes (in initState's microtask).
          _pendingColdStartTap = raw;
          return;
        }
        // Switch to Chats tab (index 0) so the back stack makes sense.
        ref.read(chatProvider.notifier).selectTab(0);
        final threadId = roomId != null ? '$nodeId:$roomId' : '$nodeId:$senderOwnerId';
        nav.push(MaterialPageRoute(
          builder: (_) => ChatDetailScreen(
            threadId: threadId,
            displayName: senderOwnerId ?? roomId ?? '',
            contactOwnerId: senderOwnerId,
            chatRoomId: roomId,
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
