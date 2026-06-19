import AVFoundation
import Flutter
import PushKit
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
  // Phase 42I — MethodChannel that lets Dart subscribe to VoIP-push
  // events. The Dart-side PushService subscribes on startup and
  // forwards the device token to the home node and surfaces incoming
  // call metadata to CallProvider.
  private let voipChannelName = "envoygo/voip_push"

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

    // Phase 42I — register the voip_push method channel and the
    // PKPushRegistry. iOS wakes the app via this channel when a VoIP
    // push arrives, even if the app is terminated. The token is
    // forwarded to Dart over the same channel; Dart then registers
    // it with the home node (with `tokenType: "voip"`).
    let voipChannel = FlutterMethodChannel(
      name: voipChannelName,
      binaryMessenger: controller.binaryMessenger
    )
    registerVoipPushRegistry(channel: voipChannel)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  /// Phase 42I — register PushKit for VoIP pushes.
  ///
  /// PushKit (`PKPushRegistry`) is the only mechanism Apple allows
  /// to wake a terminated iOS app for an incoming call. We register
  /// for `.voIP` pushes and forward:
  ///   1. The device token (as a hex string) to Dart so it can be
  ///      registered with the home node.
  ///   2. The incoming call metadata (callerOwnerId, callId,
  ///      callerName) to Dart so it can update CallProvider state
  ///      and present a CallKit screen via flutter_callkit_incoming.
  private func registerVoipPushRegistry(channel: FlutterMethodChannel) {
    let registry = PKPushRegistry(queue: DispatchQueue.main)
    registry.delegate = self
    registry.desiredPushTypes = [.voIP]
    // The delegate is `self` (UIResponder conformance); we stash the
    // channel via associated object so the delegate callbacks can
    // forward payloads without an instance-property dance.
    objc_setAssociatedObject(
      registry,
      UnsafePointer(bitPattern: "voip_channel"),
      channel,
      .OBJC_ASSOCIATION_RETAIN
    )
  }
}

// MARK: - Phase 42I — PKPushRegistryDelegate

extension AppDelegate: PKPushRegistryDelegate {
  /// Phase 42I — forward the VoIP device token to Dart as a hex string.
  /// The Dart PushService picks it up and registers it with the home
  /// node (with `tokenType: "voip"`) on the next push-token sync.
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
      UnsafePointer(bitPattern: "voip_channel")
    ) as? FlutterMethodChannel
    channel?.invokeMethod("onVoipToken", arguments: ["token": hex])
  }

  /// Phase 42I — surface an incoming VoIP push to Dart. The push
  /// payload from the home node has shape:
  ///   { aps: { voip: 1 }, data: { callId, callerOwnerId, callerName? } }
  /// We forward the `data` block to Dart, which calls
  /// `CallProvider.onIncomingCallFromPush` and presents a CallKit
  /// screen via flutter_callkit_incoming.
  func pushRegistry(
    _ registry: PKPushRegistry,
    didReceiveIncomingPushWith payload: PKPushPayload,
    for type: PKPushType,
    completion: @escaping () -> Void
  ) {
    defer { completion() }
    guard type == .voIP else { return }
    let userInfo = payload.dictionaryPayload["data"] as? [String: Any] ?? [:]
    let channel = objc_getAssociatedObject(
      registry,
      UnsafePointer(bitPattern: "voip_channel")
    ) as? FlutterMethodChannel
    channel?.invokeMethod("onIncomingCall", arguments: userInfo)
  }
}