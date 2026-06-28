import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:envoygo/widgets/voice_note_recorder_bar.dart';

void main() {
  testWidgets('VoiceNoteRecorderBar shows stop while recording and send when ready',
      (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: VoiceNoteRecorderBar(
            isCapturing: true,
            recordingSeconds: 5,
            maxSeconds: 120,
            sending: false,
            onCancel: () {},
            onStop: () {},
            onSend: () {},
          ),
        ),
      ),
    );

    expect(find.text('Recording'), findsOneWidget);
    expect(find.text('Stop'), findsOneWidget);
    expect(find.text('Send'), findsNothing);

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: VoiceNoteRecorderBar(
            isCapturing: false,
            recordingSeconds: 5,
            maxSeconds: 120,
            sending: false,
            onCancel: () {},
            onStop: () {},
            onSend: () {},
          ),
        ),
      ),
    );

    expect(find.text('Ready to send'), findsOneWidget);
    expect(find.text('Send'), findsOneWidget);
  });
}
