import AVFoundation
import CallKit
import Flutter
import PushKit
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate {
  // Phase 42I — MethodChannel that lets Dart subscribe to VoIP-push
  // events. The Dart-side PushService subscribes on startup and
  // forwards the device token to the home node and surfaces incoming
  // call metadata to CallProvider.
  private let voipChannelName = "envoygo/voip_push"

  // Phase 31I — alert (chat / bond / feed) APNs channel. Separate from
  // VoIP: home `sendApns` needs the standard remote-notification token
  // (hex), not the PushKit VoIP token.
  private let alertChannelName = "envoygo/alert_push"
  private var alertChannel: FlutterMethodChannel?

  // Phase 42I — CallKit provider + call controller. `cxProvider`
  // must exist for the lifetime of the app so we can report incoming
  // calls synchronously in the PushKit delegate (Apple requires
  // `reportNewIncomingCall` to be called within a few seconds of
  // receiving a VoIP push, or the OS terminates the app and may
  // revoke future VoIP delivery). The Dart side cannot satisfy this
  // contract reliably (MethodChannel.invokeMethod is async and the
  // Flutter engine may not even be running when a terminated app is
  // woken), so we own the CXProvider here in Swift.
  private var cxProvider: CXProvider?
  private var cxController: CXCallController?
  // callId → UUID map so CallKit answer/end actions (which carry the
  // UUID) can be correlated back to the EnvoyMesh callId handed to Dart.
  private var callUuids: [String: UUID] = [:]

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    // Phase 42F — register the audio_session method channel so the
    // Dart-side AudioSessionHelper can configure AVAudioSession for
    // voice calls. The helper talks to channel
    // `envoygo/audio_session`; methods:
    //   - `configureForVoiceCall`: playAndRecord + voiceChat mode +
    //     allowBluetooth option. Must be set before flutter_webrtc's
    //     getUserMedia so the OS routes audio correctly.
    //   - `reset`: returns the session to ambient state.
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

    // Phase 42I — configure CallKit. Done synchronously at launch so
    // the provider is ready the moment a VoIP push arrives (which may
    // be before the Flutter engine is fully up).
    configureCallKit()

    // Phase 42I — register the voip_push method channel and the
    // PKPushRegistry. iOS wakes the app via this channel when a VoIP
    // push arrives, even if the app is terminated. The token is
    // forwarded to Dart over the same channel; Dart then registers
    // it with the home node (with `tokenType: "voip"`).
    let voipChannel = FlutterMethodChannel(
      name: voipChannelName,
      binaryMessenger: controller.binaryMessenger
    )
    voipChannel.setMethodCallHandler { [weak self] (call, result) in
      // Dart → native bridge. The two methods let CallProvider tell
      // CallKit to end a call (on local hangup/decline) without going
      // through the native answer/end delegate flow.
      switch call.method {
      case "endCall":
        let args = (call.arguments as? [String: Any]) ?? [:]
        let callId = args["callId"] as? String
        self?.endCallKitCall(callId: callId)
        result(nil)
      default:
        result(FlutterMethodNotImplemented)
      }
    }
    registerVoipPushRegistry(channel: voipChannel)

    // Phase 31I — alert APNs MethodChannel. Dart calls
    // `requestPermissionAndRegister`; we forward the device token and
    // notification-tap payloads back over the same channel.
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
    return launched
  }

  /// Phase 31I — ask the user for alert permission, then register with APNs.
  private func requestAlertPushPermissionAndRegister() {
    UNUserNotificationCenter.current().requestAuthorization(
      options: [.alert, .badge, .sound]
    ) { granted, _ in
      guard granted else { return }
      DispatchQueue.main.async {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  /// Phase 31I — forward the standard APNs device token to Dart as hex.
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
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  /// Phase 31I — user tapped an alert notification (chat / bond / feed).
  override func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let userInfo = response.notification.request.content.userInfo
    var payload: [String: Any] = [:]
    if let data = userInfo["data"] as? [String: Any] {
      payload = data
    } else {
      for (key, value) in userInfo {
        if let key = key as? String, key != "aps" {
          payload[key] = value
        }
      }
    }
    if !payload.isEmpty {
      alertChannel?.invokeMethod("onNotificationTap", arguments: payload)
    }
    super.userNotificationCenter(center, didReceive: response, withCompletionHandler: completionHandler)
  }

  /// Phase 42I — set up the CXProvider with an audio-call configuration.
  private func configureCallKit() {
    let config = CXProviderConfiguration()
    config.maximumCallGroups = 1
    config.maximumCallsPerCallGroup = 1
    config.supportsVideo = false
    config.supportedHandleTypes = [.generic]
    // Keep audio active when the app backgrounds during a call.
    config.includesCallsInRecents = false

    let provider = CXProvider(configuration: config)
    provider.setDelegate(self, queue: nil)
    cxProvider = provider
    cxController = CXCallController()
  }

  /// Phase 42I — register PushKit for VoIP pushes.
  ///
  /// PushKit (`PKPushRegistry`) is the only mechanism Apple allows
  /// to wake a terminated iOS app for an incoming call. We register
  /// for `.voIP` pushes and forward:
  ///   1. The device token (as a hex string) to Dart so it can be
  ///      registered with the home node.
  ///   2. The incoming call metadata (callerOwnerId, callId,
  ///      callerName) to Dart so it can update CallProvider state.
  private func registerVoipPushRegistry(channel: FlutterMethodChannel) {
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    objc_setAssociatedObject(
      registry,
      &AppDelegate.VoipChannelKey,
      channel,
      .OBJC_ASSOCIATION_RETAIN
    )
  }

  /// Phase 42I — tell CallKit a call ended locally (Dart-side hangup/
  /// decline). Reports the end action so the native call screen
  /// dismisses; no-ops if CallKit doesn't know this callId.
  private func endCallKitCall(callId: String?) {
    guard let callId = callId, let provider = cxProvider, let uuid = callUuids[callId] else {
      return
    }
    let end = CXEndCallAction(call: uuid)
    let transaction = CXTransaction(action: end)
    cxController?.request(transaction) { _ in }
  }

  // File-private associated-object key (idiomatic Swift; the previous
  // `UnsafePointer(bitPattern: "voip_channel")` relied on string-literal
  // pointer decay and was brittle across compiler versions).
  private static var VoipChannelKey: UInt8 = 0
}

// MARK: - Phase 42I — PKPushRegistryDelegate

extension AppDelegate: PKPushRegistryDelegate {
  /// Phase 42I — forward the VoIP device token to Dart as a hex string.
  func pushRegistry(
    _ registry: PKPushRegistry,
    didUpdate pushCredentials: PKPushCredentials,
    for type: PKPushType
  ) {
    guard type == .voIP else { return }
    let tokenBytes = [UInt8](pushCredentials.token)
    let hex = tokenBytes.map { String(format: "%02x", $0) }.joined()
    let channel = objc_getAssociatedObject(
      registry,
      &AppDelegate.VoipChannelKey
    ) as? FlutterMethodChannel
    channel?.invokeMethod("onVoipToken", arguments: ["token": hex])
  }

  /// Phase 42I — surface an incoming VoIP push.
  ///
  /// CRITICAL: on iOS 13+, Apple requires `CXProvider.reportNewIncomingCall`
  /// to be called synchronously before `completion()`, or the OS terminates
  /// the app and may revoke future VoIP push delivery. The previous
  /// implementation only forwarded the payload to Dart and immediately
  /// called `completion()` — the Dart round-trip (async, and the Flutter
  /// engine may not even be running for a terminated-app wake) could not
  /// satisfy the contract. We now report to CallKit directly in Swift,
  /// THEN forward metadata to Dart for the WebRTC handshake.
  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    guard type == .voIP else {
      completion()
      return
    }

    // The home's VoIP push payload: { aps: { voip: 1 }, data: { callId,
    // callerOwnerId, callerName? } } (see apps/node/src/push-notification.ts
    // sendVoipPush). Fall back to the top-level payload if `data` is absent.
    let userInfo = payload.dictionaryPayload
    let data = userInfo["data"] as? [String: Any] ?? [:]
    let callId = data["callId"] as? String
    let callerName = (data["callerName"] as? String) ?? "Incoming call"

    // Synchronously report to CallKit BEFORE completion(). Use a stable
    // UUID per callId so the answer/end delegate can correlate back.
    let uuid = UUID()
    if let callId = callId {
      callUuids[callId] = uuid
    }
    let update = CXCallUpdate()
    update.remoteHandle = CXHandle(type: .generic, value: callerName)
    update.hasVideo = false
    cxProvider?.reportNewIncomingCall(with: uuid, update: update) { _ in
      // CallKit has been told about the call — safe to complete.
      completion()
    }

    // Forward the metadata to Dart so CallProvider can start the WebRTC
    // handshake (the SDP arrives later over the WebSocket call:incoming
    // event, not in the push). Best-effort: if the Flutter engine isn't
    // up yet, the Dart PushService will still receive the call:incoming
    // WS event once the app finishes resuming.
    let channel = objc_getAssociatedObject(
      registry,
      &AppDelegate.VoipChannelKey
    ) as? FlutterMethodChannel
    channel?.invokeMethod("onIncomingCall", arguments: data)
  }
}

// MARK: - Phase 42I — CXProviderDelegate (CallKit answer/end → Dart)

extension AppDelegate: CXProviderDelegate {
  /// CallKit → "the user tapped Accept". Bridge to Dart so
  /// CallProvider.acceptCall() runs the WebRTC answer flow.
  func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
    // The UUID correlates to a callId; find it. (UUIDs are unique per
    // call, so the reverse lookup is at most one match.)
    if let callId = callUuids.first(where: { $0.value == action.callUUID })?.key {
      let channel = (window?.rootViewController as? FlutterViewController).map {
        FlutterMethodChannel(name: voipChannelName, binaryMessenger: $0.binaryMessenger)
      }
      channel?.invokeMethod("onCallAccepted", arguments: ["callId": callId])
    }
    action.fulfill()
  }

  /// CallKit → "the user tapped Decline / ended the call". Bridge to Dart.
  func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
    if let callId = callUuids.first(where: { $0.value == action.callUUID })?.key {
      callUuids.removeValue(forKey: callId)
      let channel = (window?.rootViewController as? FlutterViewController).map {
        FlutterMethodChannel(name: voipChannelName, binaryMessenger: $0.binaryMessenger)
      }
      channel?.invokeMethod("onCallDeclined", arguments: ["callId": callId])
    }
    action.fulfill()
  }

  func providerDidReset(_ provider: CXProvider) {
    callUuids.removeAll()
  }
}