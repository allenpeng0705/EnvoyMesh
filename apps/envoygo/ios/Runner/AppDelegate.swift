import AVFoundation
import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate {
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

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}