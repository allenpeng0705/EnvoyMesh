/// Push Coding as a full-screen surface (not a bottom-nav tab).
///
/// Coding is a secondary tool — opened from Me, deep links, and session
/// switchers. Prefer this over [HomeTabId.coding] (removed from the tab bar).
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../app.dart';
import '../models/chat_thread.dart';
import '../models/terminal_session.dart';
import '../screens/chat/envoy_harness_chat_screen.dart';
import '../screens/coding/coding_home_screen.dart';
import '../screens/coding/coding_session_list_sheet.dart';
import '../screens/coding/ext_agent_coding_screen.dart';
import '../screens/coding/pi_coding_chat_screen.dart';
import '../services/coding_ext_sessions.dart';
import 'coding_open_nav.dart';

/// [Navigator] route name for [CodingHomeScreen] — used to avoid stacking.
const codingHomeRouteName = 'coding-home';

/// Buffer [detail] (if any) and open [CodingHomeScreen].
///
/// If Coding home is already on the stack, pops back to it then notifies the
/// live subscriber (avoids stacking another [CodingHomeScreen]).
Future<void> openCodingHome(
  BuildContext context, {
  CodingOpenDetail detail = const CodingOpenDetail(),
}) async {
  if (!context.mounted) return;
  final nav = Navigator.of(context);
  var found = false;
  nav.popUntil((route) {
    if (route.settings.name == codingHomeRouteName) {
      found = true;
      return true;
    }
    return route.isFirst;
  });
  // Always buffer detail first. Caller context may unmount if it lived
  // above Coding home (session screens); fall back to the root key.
  openCoding(detail);
  if (found) return;
  final pushCtx = context.mounted
      ? context
      : EnvoyGoApp.navigatorKey.currentContext;
  if (pushCtx == null || !pushCtx.mounted) return;
  await Navigator.of(pushCtx).push<void>(
    MaterialPageRoute<void>(
      settings: const RouteSettings(name: codingHomeRouteName),
      builder: (_) => const CodingHomeScreen(),
    ),
  );
}

Future<void> openCodingEhSession(
  BuildContext context, {
  required String threadId,
  required String displayName,
  String? chatId,
  bool readOnlyReview = false,
}) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => EnvoyHarnessChatScreen(
        threadId: threadId,
        displayName: displayName,
        chatId: chatId,
        readOnlyReview: readOnlyReview,
      ),
    ),
  );
}

Future<void> openCodingPiSession(
  BuildContext context, {
  required String sessionId,
  required String sessionName,
  String? cwd,
}) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => PiCodingChatScreen(
        sessionId: sessionId,
        sessionName: sessionName,
        cwd: cwd,
      ),
    ),
  );
}

Future<void> openCodingExtSession(
  BuildContext context, {
  required CodingExtSession session,
}) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute<void>(
      builder: (_) => ExtAgentCodingScreen(
        sessionId: session.id,
        harness: session.harness,
        cwd: session.cwd,
        title: session.title,
      ),
    ),
  );
}

/// In-task switcher used by EH / Pi / Ext screens.
Future<void> showCodingSessionSwitcher(
  BuildContext context,
  WidgetRef ref, {
  String? currentEhChatId,
  String? currentPiSessionId,
  String? currentExtSessionId,
}) {
  return showCodingSessionListSheet(
    context,
    ref,
    CodingSessionListHost(
      currentEhChatId: currentEhChatId,
      currentPiSessionId: currentPiSessionId,
      currentExtSessionId: currentExtSessionId,
      onNewTask: () async {
        // Session / Coding routes are popped below — do not use their
        // BuildContext (it unmounts). Root navigator key stays valid.
        final nav = EnvoyGoApp.navigatorKey.currentState;
        final rootCtx = EnvoyGoApp.navigatorKey.currentContext;
        if (nav == null || rootCtx == null) return;
        nav.popUntil((route) => route.isFirst);
        if (!rootCtx.mounted) return;
        await openCodingHome(
          rootCtx,
          detail: const CodingOpenDetail(startNew: true),
        );
      },
      onOpenEh: (ChatThread t) async {
        final parts = t.id.split(':eh:');
        final chatId = parts.length > 1 ? parts[1] : null;
        if (chatId != null &&
            chatId.isNotEmpty &&
            chatId == currentEhChatId) {
          return;
        }
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => EnvoyHarnessChatScreen(
              threadId: t.id,
              displayName: t.displayName,
              chatId: chatId,
            ),
          ),
        );
      },
      onOpenPi: (TerminalSession s) async {
        if (s.id == currentPiSessionId) return;
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => PiCodingChatScreen(
              sessionId: s.id,
              sessionName: s.name,
              cwd: s.cwd,
            ),
          ),
        );
      },
      onOpenExt: (CodingExtSession s) async {
        if (s.id == currentExtSessionId) return;
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => ExtAgentCodingScreen(
              sessionId: s.id,
              harness: s.harness,
              cwd: s.cwd,
              title: s.title,
            ),
          ),
        );
      },
    ),
  );
}
