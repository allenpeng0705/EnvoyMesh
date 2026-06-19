import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Phase 42I — iOS VoIP push listener for backgrounded calls.
///
/// On iOS, PushKit (`PKPushRegistry`) is the only mechanism that can
/// wake a terminated app to deliver an incoming call. This service:
///
/// 1. Subscribes to the native `envoygo/voip_push` MethodChannel that
///    `AppDelegate.swift` registers.
/// 2. Forwards the VoIP device token to the home node, with
///    `tokenType: "voip"` so the home picks the right APNs topic and
///    push-type header.
/// 3. Surfaces incoming-call metadata to [CallProvider] via
///    [onIncomingCall], which in turn presents a CallKit screen
///    through `flutter_callkit_incoming`.
///
/// On non-iOS platforms, the service is a no-op stub.
class VoipPushService {
  /// The MethodChannel name registered by `AppDelegate.swift`.
  static const String _channelName = 'envoygo/voip_push';

  /// Singleton — there is at most one VoIP push listener per app
  /// instance and it must outlive route changes.
  static VoipPushService? _instance;
  factory VoipPushService() {
    _instance ??= VoipPushService._();
    return _instance!;
  }
  VoipPushService._();

  static const MethodChannel _channel = MethodChannel(_channelName);

  bool _initialized = false;
  String? _voipToken;

  /// The most recent hex-encoded VoIP device token (iOS only).
  String? get voipToken => _voipToken;

  /// Whether the host platform supports VoIP pushes. Currently only
  /// iOS — Android uses the FCM path with `type: call` instead.
  bool get isSupported {
    if (kIsWeb) return false;
    try {
      return Platform.isIOS;
    } catch (_) {
      // Platform isn't available (e.g. in some unit-test harnesses).
      return false;
    }
  }

  /// Stream of incoming-call payloads from iOS PushKit.
  /// The payload is the `data` block forwarded by `AppDelegate.swift`
  /// from the home node's `call.invite` push, with shape:
  ///   { callId: string, callerOwnerId: string, callerName?: string }
  Stream<Map<String, dynamic>> get onIncomingCall =>
      _incomingCallController.stream;
  final _incomingCallController =
      StreamController<Map<String, dynamic>>.broadcast();

  /// Initialize the channel listener. Safe to call multiple times.
  Future<void> initialize() async {
    if (_initialized) return;
    if (!isSupported) {
      _initialized = true;
      return;
    }
    _initialized = true;
    _channel.setMethodCallHandler(_handleNativeCall);
  }

  /// Register the most recent VoIP token with the home node.
  ///
  /// The caller (typically the home-remote connection setup) supplies
  /// a function that knows how to invoke the `registerPushToken` RPC
  /// — keeping this service free of any home-remote dependency.
  Future<void> registerWithHomeNode(
    Future<dynamic> Function(String method,
            [Map<String, dynamic>? params])
        callRpc,
  ) async {
    if (!isSupported) return;
    final token = _voipToken;
    if (token == null || token.isEmpty) return;
    try {
      await callRpc('registerPushToken', {
        'platform': 'ios',
        'token': token,
        'tokenType': 'voip',
      });
    } catch (_) {
      // Best-effort — push is optional. The token will be re-registered
      // on the next successful RPC round-trip.
    }
  }

  /// Clear any cached VoIP token. Useful when the user signs out so
  /// the home node stops targeting the device for VoIP pushes.
  Future<void> clearToken() async {
    _voipToken = null;
  }

  Future<dynamic> _handleNativeCall(MethodCall call) async {
    switch (call.method) {
      case 'onVoipToken':
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        final token = args['token'] as String?;
        if (token != null && token.isNotEmpty) {
          _voipToken = token;
        }
        return null;
      case 'onIncomingCall':
        final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
        if (args.isNotEmpty) {
          _incomingCallController.add(args);
        }
        return null;
      default:
        return null;
    }
  }

  /// Tear down the channel listener. Call from a top-level scope's
  /// dispose (e.g. app teardown) if you want strict lifecycle hygiene.
  Future<void> dispose() async {
    await _incomingCallController.close();
  }
}
