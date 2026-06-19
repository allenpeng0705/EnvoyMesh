import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/services.dart';

/// Phase 42F — iOS AVAudioSession configuration helper.
///
/// On iOS, the AVAudioSession must be configured to `playAndRecord` with
/// the `voiceChat` mode (and `.allowBluetooth` option) before a WebRTC
/// audio session is started, otherwise the OS will route audio through
/// the default ringer/speaker path and the call sounds wrong. The mode
/// also unlocks the Bluetooth headset profile.
///
/// On Android we no-op — Android handles the routing automatically
/// based on the active media stream type. (Android-specific audio
/// routing refinements live outside Phase 42F.)
///
/// The helper talks to a platform method channel
/// (`envoygo/audio_session`) that the iOS `AppDelegate.swift` listens
/// to. Tests inject a `MethodChannel` mock so the helper can be
/// exercised without a real device.
class AudioSessionHelper {
  /// Channel name. Must match the iOS-side handler registered in
  /// `AppDelegate.swift`.
  static const String _channelName = 'envoygo/audio_session';

  /// Method name — configure the session for a voice call.
  static const String _configureMethod = 'configureForVoiceCall';

  /// Method name — reset to ambient (idle) state.
  static const String _resetMethod = 'reset';

  /// Pluggable channel — production callers leave this null and the
  /// helper uses [MethodChannel]. Tests inject a mock channel that
  /// records the calls without needing platform code.
  final MethodChannel? channelOverride;

  /// Test seam — force the helper to act as if running on iOS even
  /// when the host is Linux/macOS/desktop. Production callers leave
  /// this null and the helper uses [Platform.isIOS] as the gate.
  final bool? forceEnabled;

  AudioSessionHelper({this.channelOverride, this.forceEnabled});

  /// Whether the helper should invoke the platform channel. True on
  /// iOS or when `forceEnabled` is set (test seam).
  bool get _enabled => forceEnabled ?? Platform.isIOS;

  /// Configure the audio session for an active voice call.
  ///
  /// Idempotent — repeated calls are safe; the platform handler
  /// re-applies the category/mode/options. On non-iOS platforms
  /// (Android, desktop, web) this is a no-op.
  Future<void> configureForVoiceCall() async {
    if (!_enabled) return;
    final channel = channelOverride ??
        const MethodChannel(_channelName);
    await channel.invokeMethod<void>(_configureMethod);
  }

  /// Tear down the voice-call audio session, returning to the
  /// ambient state. Call this from `endCall` / `declineCall` /
  /// transport `close()` so other apps (music, voice memos) can
  /// take over the speaker route again. No-op on non-iOS.
  Future<void> reset() async {
    if (!_enabled) return;
    final channel = channelOverride ??
        const MethodChannel(_channelName);
    await channel.invokeMethod<void>(_resetMethod);
  }
}