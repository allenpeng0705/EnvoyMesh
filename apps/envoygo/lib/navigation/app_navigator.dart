import 'package:flutter/material.dart';

import '../screens/call/voice_call_screen.dart';

/// Global navigator for flows that lack a [BuildContext] (VoIP accept, etc.).
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

void openVoiceCallScreen() {
  final nav = appNavigatorKey.currentState;
  if (nav == null) return;
  nav.push(MaterialPageRoute(builder: (_) => const VoiceCallScreen()));
}
