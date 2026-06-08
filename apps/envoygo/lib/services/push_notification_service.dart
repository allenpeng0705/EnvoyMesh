import 'package:flutter/foundation.dart';

/// Push notification service for EnvoyGo.
///
/// On iOS: uses native APNs via `flutter_apns` or similar.
/// On Android: uses Firebase Cloud Messaging (FCM).
/// On web: push notifications are not supported.
///
/// The home node sends push notifications when the companion app
/// is closed or backgrounded and a new message arrives.
class PushNotificationService {
  static PushNotificationService? _instance;

  factory PushNotificationService() {
    _instance ??= PushNotificationService._();
    return _instance!;
  }

  PushNotificationService._();

  bool _initialized = false;
  String? _token;

  /// Whether push notifications are supported on this platform.
  bool get isSupported => !kIsWeb;

  /// The device push token (APNs token or FCM token).
  String? get token => _token;

  /// Initialize push notifications and obtain a device token.
  ///
  /// On iOS: requests notification permissions and obtains an APNs token.
  /// On Android: initializes Firebase and obtains an FCM token.
  /// On web: no-op.
  Future<void> initialize() async {
    if (_initialized) return;
    if (!isSupported) return;

    _initialized = true;

    // TODO(31I): Platform-specific push setup.
    //
    // iOS:
    //   final apns = FlutterApns();
    //   await apns.requestPermission();
    //   _token = await apns.token;
    //
    // Android:
    //   await Firebase.initializeApp();
    //   _token = await FirebaseMessaging.instance.getToken();
    //
    // After obtaining the token, register it with the home node:
    //   if (connected) {
    //     await nodeService.registerPushToken({
    //       'platform': Platform.isIOS ? 'ios' : 'android',
    //       'token': _token,
    //     });
    //   }
  }

  /// Register the push token with the connected home node.
  Future<void> registerWithHomeNode(
    Future<dynamic> Function(String method,
            [Map<String, dynamic>? params])
        callRpc,
  ) async {
    if (_token == null) return;
    try {
      await callRpc('registerPushToken', {
        'platform': defaultTargetPlatform == TargetPlatform.iOS
            ? 'ios'
            : 'android',
        'token': _token,
      });
    } catch (_) {
      // Silently ignore — push is optional.
    }
  }

  /// Handle an incoming push notification tap.
  ///
  /// Returns the thread data to navigate to, or null.
  Map<String, dynamic>? handleNotificationTap(
      Map<String, dynamic> data) {
    final threadType = data['threadType'] as String?;
    if (threadType == null) return null;
    return {
      'threadType': threadType,
      'senderOwnerId': data['senderOwnerId'],
      'roomId': data['roomId'],
      'messageId': data['messageId'],
    };
  }
}
