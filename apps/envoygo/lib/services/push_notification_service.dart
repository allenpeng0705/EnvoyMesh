import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../utils/localized_labels.dart';

/// Alert (chat / bond / feed / **incoming-call**) push notifications for
/// EnvoyGo — Phase 31I.
///
/// - **iOS:** native APNs via `envoygo/alert_push` MethodChannel
///   (`AppDelegate.swift`). No Firebase — China-friendly; home
///   `sendApns` expects a raw APNs hex token.
/// - **Android:** Firebase Cloud Messaging when `google-services.json`
///   is present; otherwise initialize is a silent no-op.
/// - **Web / desktop:** unsupported.
///
/// ### Incoming-call flow (replaces the old VoIP/CallKit path)
///
/// The home dispatches a standard alert push with
/// `data.type == "incomingCall"`. On iOS the push carries
/// `aps.content-available: 1` (best-effort wake; no PushKit). Native
/// `AppDelegate` and Android FCM both route that type to
/// [onIncomingCall] (not the chat deep-link router). [CallProvider]
/// consumes the stream; a one-shot pending buffer covers cold start
/// before the provider has subscribed.
class PushNotificationService {
  static const String _channelName = 'envoygo/alert_push';

  static PushNotificationService? _instance;

  factory PushNotificationService() {
    _instance ??= PushNotificationService._();
    return _instance!;
  }

  PushNotificationService._();

  static const MethodChannel _channel = MethodChannel(_channelName);

  bool _initialized = false;
  String? _token;
  String? _ownerId;
  String? _profileId;
  Future<dynamic> Function(String method, [Map<String, dynamic>? params])?
      _homeRpc;

  /// Whether alert pushes are supported on this platform.
  bool get isSupported {
    if (kIsWeb) return false;
    try {
      return Platform.isIOS || Platform.isAndroid;
    } catch (_) {
      return false;
    }
  }

  /// Cached APNs (hex) or FCM device token.
  String? get token => _token;

  /// Stream of notification-tap payloads from native / FCM.
  Stream<Map<String, dynamic>> get onNotificationTap =>
      _tapController.stream;
  final _tapController = StreamController<Map<String, dynamic>>.broadcast();

  /// Stream of incoming-call payloads (post-CallKit-removal flow).
  ///
  /// Emitted when native/FCM delivers `data.type == "incomingCall"`:
  /// banner tap, iOS `content-available` wake, iOS cold-start
  /// `launchOptions`, Android foreground `onMessage`, or Android
  /// notification open. Payload shape:
  /// `{ callId, callerOwnerId, callerName? }`.
  ///
  /// Subscribers should treat arrival as idempotent: the same callId
  /// may arrive more than once, and WebSocket `call:incoming` may
  /// already have filled SDP before the push lands.
  Stream<Map<String, dynamic>> get onIncomingCall =>
      _incomingCallController.stream;
  final _incomingCallController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Cold-start incoming-call payload buffered when no listener is
  /// attached yet (same role as [consumePendingInitialTap] for chats).
  Map<String, dynamic>? _pendingIncomingCall;

  /// Request permission, obtain a device token, and install listeners.
  ///
  /// Safe to call multiple times. Does not throw when credentials /
  /// Firebase are missing — push is optional.
  Future<void> initialize() async {
    if (_initialized) return;
    if (!isSupported) {
      _initialized = true;
      return;
    }
    _initialized = true;

    _channel.setMethodCallHandler(_handleNativeCall);

    try {
      if (Platform.isIOS) {
        await _channel.invokeMethod<void>('requestPermissionAndRegister');
      } else if (Platform.isAndroid) {
        await _initAndroidFcm();
      }
    } catch (_) {
      // Best-effort — missing entitlements / google-services.json.
    }
  }

  /// Remember [ownerId] and register the token with the home node when ready.
  Future<void> registerWithHomeNode(
    Future<dynamic> Function(String method, [Map<String, dynamic>? params])
        callRpc, {
    String? ownerId,
    String? profileId,
  }) async {
    if (!isSupported) return;
    _homeRpc = callRpc;
    if (ownerId != null && ownerId.isNotEmpty) {
      _ownerId = ownerId;
    }
    if (profileId != null && profileId.isNotEmpty) {
      _profileId = profileId;
    }
    await _registerIfReady();
  }

  /// Drop cached token (e.g. on sign-out).
  Future<void> clearToken() async {
    _token = null;
  }

  /// Normalize a notification payload into navigation hints.
  ///
  /// Returns `null` when [data] is not a known EnvoyGo push type.
  /// Note: `data.type == "incomingCall"` is intentionally NOT routed
  /// here — it must go through [onIncomingCall] to the in-app call
  /// screen, not through the chat/bond deep-link router.
  Map<String, dynamic>? handleNotificationTap(Map<String, dynamic> data) {
    final type = data['type'] as String?;
    if (type == 'incomingCall') {
      // Incoming-call push: the AppDelegate will have already surfaced
      // it via onIncomingCall. Skip the chat-thread router so we
      // don't try to open a chat thread for the call.
      return null;
    }
    if (type == 'feed_notify' || type == 'feed.notify') {
      final url = data['url'] as String?;
      if (url == null || url.isEmpty) return null;
      return {
        'type': 'feed_notify',
        'url': url,
        'title': data['title'],
        'notificationId': data['notificationId'],
      };
    }
    if (type == 'bond_request') {
      return {'type': 'bond_request'};
    }
    if (type == 'approval') {
      return {
        'type': 'approval',
        'itemId': data['itemId'],
      };
    }
    // Phase 50 — Pi tool-action push only (type=pi_proposal).
    // Do NOT treat senderOwnerId=envoy:pi as a proposal — Ext Agent Pi
    // chat replies used that id historically and must open Ext Agent.
    if (type == 'pi_proposal') {
      return {'type': 'pi_proposal'};
    }
    // Legacy Ext Agent Pi push → Ext Agent thread (not Contacts).
    if (data['senderOwnerId'] == 'envoy:pi') {
      return {
        'threadType': 'external',
        'senderOwnerId': null,
        'agentType': 'external',
        'senderName': data['senderName'] ?? ThreadTitleSentinels.extAgent,
        'messageId': data['messageId'],
      };
    }
    final threadType = data['threadType'] as String?;
    if (threadType == null) return null;
    return {
      'threadType': threadType,
      'senderOwnerId': data['senderOwnerId'],
      'roomId': data['roomId'],
      'messageId': data['messageId'],
      'senderName': data['senderName'],
      'threadKey': data['threadKey'],
    };
  }

  Future<void> _initAndroidFcm() async {
    try {
      await Firebase.initializeApp();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        _token = token;
        await _registerIfReady();
      }
      messaging.onTokenRefresh.listen((t) async {
        if (t.isEmpty) return;
        _token = t;
        await _registerIfReady();
      });
      FirebaseMessaging.onMessage.listen((message) {
        _routePushData(Map<String, dynamic>.from(message.data));
      });
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        _routePushData(Map<String, dynamic>.from(message.data));
      });
      // Cold-start: onMessageOpenedApp only fires for warm taps.
      // Buffer until main.dart / CallProvider attach their listeners.
      final initial = await messaging.getInitialMessage();
      if (initial != null && initial.data.isNotEmpty) {
        final data = Map<String, dynamic>.from(initial.data);
        if (data['type'] == 'incomingCall') {
          _pendingIncomingCall = data;
        } else {
          _pendingInitialTap = data;
        }
      }
    } catch (e, st) {
      // No google-services.json / Firebase not configured / Play Services.
      debugPrint('[push] Android FCM init failed: $e\n$st');
    }
  }

  /// Buffered cold-start tap (Android). The deep-link subscriber in
  /// main.dart calls [consumePendingInitialTap] after attaching to
  /// [onNotificationTap] to replay any cold-start tap that arrived
  /// before the subscriber was ready.
  Map<String, dynamic>? _pendingInitialTap;
  Map<String, dynamic>? consumePendingInitialTap() {
    final tap = _pendingInitialTap;
    _pendingInitialTap = null;
    return tap;
  }

  /// Buffered cold-start incoming call. [CallProvider] drains this when
  /// it attaches to [onIncomingCall].
  Map<String, dynamic>? consumePendingIncomingCall() {
    final call = _pendingIncomingCall;
    _pendingIncomingCall = null;
    return call;
  }

  /// Route FCM / MethodChannel payloads: calls → [onIncomingCall],
  /// everything else → [onNotificationTap].
  void _routePushData(Map<String, dynamic> data) {
    if (data.isEmpty) return;
    if (data['type'] == 'incomingCall') {
      _emitIncomingCall(data);
    } else {
      _tapController.add(data);
    }
  }

  void _emitIncomingCall(Map<String, dynamic> data) {
    debugPrint(
      '[push] incomingCall callId=${data['callId']} '
      'caller=${data['callerOwnerId']}',
    );
    if (_incomingCallController.hasListener) {
      _incomingCallController.add(data);
    } else {
      _pendingIncomingCall = data;
    }
  }

  Future<void> _registerIfReady() async {
    final callRpc = _homeRpc;
    final token = _token;
    if (callRpc == null || token == null || token.isEmpty) return;
    try {
      final params = <String, dynamic>{
        'platform': Platform.isIOS ? 'ios' : 'android',
        'token': token,
        'tokenType': 'alert',
      };
      final ownerId = _ownerId;
      if (ownerId != null && ownerId.isNotEmpty) {
        params['ownerId'] = ownerId;
      }
      final profileId = _profileId;
      if (profileId != null && profileId.isNotEmpty) {
        params['profileId'] = profileId;
      }
      await callRpc('registerPushToken', params);
      debugPrint(
        '[push] registerPushToken ok platform=${params['platform']} '
        'owner=${ownerId ?? '(home default)'} '
        'profile=${profileId ?? '(session)'} '
        'token=${token.length > 12 ? '${token.substring(0, 12)}…' : token}',
      );
    } catch (e) {
      debugPrint('[push] registerPushToken failed: $e');
    }
  }

  Future<dynamic> _handleNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onAlertToken':
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        final token = args['token'] as String?;
        if (token != null && token.isNotEmpty) {
          _token = token;
          debugPrint(
            '[push] got alert token len=${token.length} '
            'prefix=${token.length > 12 ? '${token.substring(0, 12)}…' : token}',
          );
          await _registerIfReady();
        }
        return null;
      case 'onAlertTokenError':
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        debugPrint('[push] APNs registration failed: ${args['error']}');
        return null;
      case 'onNotificationTap':
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        _routePushData(args);
        return null;
      case 'onIncomingCall':
        // iOS AppDelegate routes incomingCall here (tap, content-available
        // wake, or cold-start launchOptions).
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        if (args.isNotEmpty) _emitIncomingCall(args);
        return null;
      default:
        return null;
    }
  }

  /// Test seam — same dispatch path as the MethodChannel handler.
  @visibleForTesting
  Future<void> debugDispatch(String method, Map<String, dynamic> args) async {
    await _handleNativeCall(MethodCall(method, args));
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }
}
