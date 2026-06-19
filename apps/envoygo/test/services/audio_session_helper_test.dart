// Phase 42F — AudioSessionHelper unit tests.
//
// The helper is a thin wrapper over a MethodChannel that maps
// `configureForVoiceCall` and `reset` to AVAudioSession
// configuration calls on the iOS native side. Tests inject a
// recording MethodChannel mock so the helper can be exercised
// without a real device.
//
// The platform gate (`Platform.isIOS`) is bypassed in tests via the
// `forceEnabled: true` test seam, so the iOS branch is exercised
// on any host.

import 'dart:async';

import 'package:envoygo/services/audio_session_helper.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

/// Records method calls and lets tests assert on them.
class RecordingChannel {
  final List<MethodCall> calls = [];

  Future<dynamic> handler(MethodCall call) async {
    calls.add(call);
    return null;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('AudioSessionHelper (Phase 42F)', () {
    test('configureForVoiceCall calls configureForVoiceCall on the channel',
        () async {
      final recorder = RecordingChannel();
      const channel = MethodChannel('envoygo/audio_session_for_test_1');
      TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, recorder.handler);

      final helper = AudioSessionHelper(
        channelOverride: channel,
        forceEnabled: true,
      );
      await helper.configureForVoiceCall();

      expect(recorder.calls, hasLength(1));
      expect(recorder.calls.single.method, 'configureForVoiceCall');
    });

    test('reset calls reset on the channel', () async {
      final recorder = RecordingChannel();
      const channel = MethodChannel('envoygo/audio_session_for_test_2');
      TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, recorder.handler);

      final helper = AudioSessionHelper(
        channelOverride: channel,
        forceEnabled: true,
      );
      await helper.reset();

      expect(recorder.calls, hasLength(1));
      expect(recorder.calls.single.method, 'reset');
    });

    test('configureForVoiceCall and reset are no-ops when forceEnabled is false',
        () async {
      final recorder = RecordingChannel();
      const channel = MethodChannel('envoygo/audio_session_for_test_3');
      TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, recorder.handler);

      final helper = AudioSessionHelper(
        channelOverride: channel,
        forceEnabled: false,
      );
      await helper.configureForVoiceCall();
      await helper.reset();
      expect(recorder.calls, isEmpty);
    });

    test('configureForVoiceCall propagates channel errors', () async {
      const channel = MethodChannel('envoygo/audio_session_for_test_4');
      TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        throw PlatformException(code: 'TEST_ERROR', message: 'forced');
      });

      final helper = AudioSessionHelper(
        channelOverride: channel,
        forceEnabled: true,
      );
      expect(
        () => helper.configureForVoiceCall(),
        throwsA(isA<PlatformException>()),
      );
    });

    test('reset propagates channel errors', () async {
      const channel = MethodChannel('envoygo/audio_session_for_test_5');
      TestDefaultBinaryMessengerBinding
          .instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        throw PlatformException(code: 'TEST_ERROR', message: 'forced');
      });

      final helper = AudioSessionHelper(
        channelOverride: channel,
        forceEnabled: true,
      );
      expect(
        () => helper.reset(),
        throwsA(isA<PlatformException>()),
      );
    });
  });
}