import AVFoundation
import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  // Alert (chat / bond / feed / incoming-call) APNs MethodChannel.
  // Dart registers a listener on this channel for:
  //   - onAlertToken / onAlertTokenError — device-token registration
  //   - onNotificationTap              — user tapped a non-call notification
  //   - onIncomingCall                  — incoming-call push (banner tap,
  //                                     content-available wake, or cold start)
  private let alertChannelName = "envoygo/alert_push"
  private var alertChannel: FlutterMethodChannel?

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    // Register the audio_session method channel so the Dart-side
    // AudioSessionHelper can configure AVAudioSession for voice calls
    // (playAndRecord + voiceChat + allowBluetooth). Must be set before
    // flutter_webrtc's getUserMedia so the OS routes audio correctly.
    let controller = window?.rootViewController as! FlutterViewController
    let audioChannel = FlutterMethodChannel(
      name: "envoygo/audio_session",
      binaryMessenger: controller.binaryMessenger
    )
    audioChannel.setMethodCallHandler { (call, result) in
      switch call.method {
      case "configureForVoiceCall":
        do {
          let session = AVAudioSession.sharedInstance()
          try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.allowBluetooth, .allowBluetoothA2DP]
          )
          try session.setActive(true)
          result(nil)
        } catch {
          result(FlutterError(
            code: "AUDIO_SESSION_CONFIGURE_FAILED",
            message: "Failed to configure AVAudioSession: \(error.localizedDescription)",
            details: nil
          ))
        }
      case "reset":
        do {
          let session = AVAudioSession.sharedInstance()
          try session.setActive(
            false,
            options: [.notifyOthersOnDeactivation]
          )
          result(nil)
        } catch {
          result(FlutterError(
            code: "AUDIO_SESSION_RESET_FAILED",
            message: "Failed to reset AVAudioSession: \(error.localizedDescription)",
            details: nil
          ))
        }
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    // Standard APNs MethodChannel. Dart calls
    // `requestPermissionAndRegister`; we forward the device token and
    // notification / incoming-call payloads back over the same channel.
    let alertChannel = FlutterMethodChannel(
      name: alertChannelName,
      binaryMessenger: controller.binaryMessenger
    )
    self.alertChannel = alertChannel
    alertChannel.setMethodCallHandler { [weak self] (call, result) in
      switch call.method {
      case "requestPermissionAndRegister":
        self?.requestAlertPushPermissionAndRegister()
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }

    let launched = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // FlutterAppDelegate may assign itself as the notification center
    // delegate during `super.application`; re-assert so our tap
    // override receives userNotificationCenter(_:didReceive:).
    UNUserNotificationCenter.current().delegate = self

    // Cold start: app launched from a remote-notification (banner tap
    // or content-available wake while terminated). Defer until the
    // Flutter engine can receive MethodChannel invokes.
    if let userInfo = launchOptions?[.remoteNotification] as? [AnyHashable: Any] {
      DispatchQueue.main.async { [weak self] in
        self?.forwardPushPayload(userInfo)
      }
    }

    return launched
  }

  // MARK: - APNs standard alert registration

  private func requestAlertPushPermissionAndRegister() {
    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound]
    ) { [weak self] granted, error in
      if let error = error {
        NSLog("[push] notification permission error: \(error.localizedDescription)")
        self?.alertChannel?.invokeMethod("onAlertTokenError", arguments: [
          "error": error.localizedDescription,
        ])
      }
      guard granted else {
        NSLog("[push] notification permission denied — no APNs token")
        self?.alertChannel?.invokeMethod("onAlertTokenError", arguments: [
          "error": "notification permission denied",
        ])
        return
      }
      DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
    alertChannel?.invokeMethod("onAlertToken", arguments: ["token": hex])
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    // Best-effort — simulator / missing Push entitlement.
    NSLog("[push] APNs registration failed: \(error.localizedDescription)")
    alertChannel?.invokeMethod("onAlertTokenError", arguments: [
      "error": error.localizedDescription,
    ])
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  // MARK: - Notification tap forwarding

  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    // Show the standard banner + sound when a notification arrives while
    // the app is foregrounded. This is what surfaces an `incomingCall`
    // push to the user when the Flutter app is already up.
    completionHandler([.banner, .sound, .badge])
  }

  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    forwardPushPayload(response.notification.request.content.userInfo)
    completionHandler()
  }

  // MARK: - Silent / background push forwarding

  /// Standard APNs supports a `content-available: 1` payload that
  /// wakes the app in the background. We forward it to Dart so an
  /// `incomingCall` payload can surface the in-app call screen.
  /// Call `completionHandler` once here — do not also call `super`,
  /// which would complete the fetch a second time.
  override func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any],
    fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
  ) {
    forwardPushPayload(userInfo)
    completionHandler(.newData)
  }

  // MARK: - Shared payload routing

  /// Extract the EnvoyGo `data` dict (or flat custom keys) and route:
  /// - `type == "incomingCall"` → `onIncomingCall` (in-app call screen)
  /// - everything else → `onNotificationTap` (deep-link router)
  private func forwardPushPayload(_ userInfo: [AnyHashable: Any]) {
    let payload = extractPushData(userInfo)
    guard !payload.isEmpty else { return }
    let type = payload["type"] as? String
    if type == "incomingCall" {
      NSLog("[push] incomingCall callId=\(payload["callId"] ?? "?")")
      alertChannel?.invokeMethod("onIncomingCall", arguments: payload)
    } else {
      alertChannel?.invokeMethod("onNotificationTap", arguments: payload)
    }
  }

  private func extractPushData(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
    if let data = userInfo["data"] as? [String: Any] {
      return data
    }
    var payload: [String: Any] = [:]
    for (key, value) in userInfo {
      if let key = key as? String, key != "aps" {
        payload[key] = value
      }
    }
    return payload
  }
}
