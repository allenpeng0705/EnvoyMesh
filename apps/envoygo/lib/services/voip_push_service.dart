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

  /// Phase 42I — CallKit "Accept" action (user tapped Accept on the
  /// native incoming-call screen). Emits the callId so the app can drive
  /// `CallProvider.acceptCall()`.
  Stream<String> get onCallAccepted => _acceptedController.stream;
  final _acceptedController = StreamController<String>.broadcast();

  /// Phase 42I — CallKit "Decline"/End action. Emits the callId so the
  /// app can drive `CallProvider.declineCall()` / `endCall()`.
  Stream<String> get onCallDeclined => _declinedController.stream;
  final _declinedController = StreamController<String>.broadcast();

  /// Initialize the channel listener. Safe to call multiple times.
  ///
  /// The MethodChannel handler is installed on every platform (it's a
  /// no-op on non-iOS — the channel simply never receives native calls).
  /// This keeps the payload-parsing logic unit-testable on the host VM
  /// while behaving identically on a real iOS device. Platform-gated
  /// work (token registration) lives in [registerWithHomeNode].
  Future<void> initialize() async {
    if (_initialized) return;
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
        callRpc, {
    String? ownerId,
  }) async {
    if (!isSupported) return;
    final token = _voipToken;
    if (token == null || token.isEmpty) return;
    try {
      final params = <String, dynamic>{
        'platform': 'ios',
        'token': token,
        'tokenType': 'voip',
      };
      if (ownerId != null && ownerId.isNotEmpty) {
        params['ownerId'] = ownerId;
      }
      await callRpc('registerPushToken', params);
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
      case 'onCallAccepted':
        final args = (call.arguments as Map?)?.cast<String, dynamic>();
        final callId = args?['callId'] as String?;
        if (callId != null) _acceptedController.add(callId);
        return null;
      case 'onCallDeclined':
        final args = (call.arguments as Map?)?.cast<String, dynamic>();
        final callId = args?['callId'] as String?;
        if (callId != null) _declinedController.add(callId);
        return null;
      default:
        return null;
    }
  }

  /// Test seam — invokes the same dispatch logic the MethodChannel
  /// handler runs when `AppDelegate.swift` calls into Dart. Lets unit
  /// tests exercise the parsing/dispatch without depending on the
  /// binary-messenger delivery timing.
  @visibleForTesting
  Future<void> debugDispatch(String method, Map<String, dynamic> args) async {
    await _handleNativeCall(MethodCall(method, args));
    // StreamControllers deliver asynchronously; pump two microtasks
    // so listeners observe the just-added events before assertions.
    await Future<void>.delayed(Duration.zero);
    await Future<void>.delayed(Duration.zero);
  }

  /// Phase 42I — tell the native side to dismiss the CallKit screen for
  /// [callId]. Call this when the call ends locally (hangup/decline) so
  /// the native UI tears down in sync with the Dart-side state. No-op on
  /// non-iOS or if CallKit isn't tracking this callId.
  Future<void> reportEndCall(String callId) async {
    if (!isSupported) return;
    try {
      await _channel.invokeMethod('endCall', {'callId': callId});
    } catch (_) {
      // Best-effort — CallKit teardown is cosmetic; a missed dismiss
      // resolves itself on the next providerDidReset.
    }
  }

  /// Tear down the channel listener. Call from a top-level scope's
  /// dispose (e.g. app teardown) if you want strict lifecycle hygiene.
  Future<void> dispose() async {
    await _incomingCallController.close();
    await _acceptedController.close();
    await _declinedController.close();
  }
}
