import '../l10n/app_localizations.dart';
import '../models/chat_thread.dart';
import '../providers/node_provider.dart';

/// Stable English sentinels stored by [ChatNotifier] / push routing.
/// Localized only at display time (providers have no BuildContext).
class ThreadTitleSentinels {
  static const group = 'Group';
  static const familyGroup = 'Family group';
  static const extAgent = 'Ext Agent';
  static const terminalPrefix = 'Terminal: ';
}

/// Localize a thread title for UI (list tiles, app bars, deep links).
String localizeThreadTitle(
  AppLocalizations l10n, {
  required String displayName,
  ChatThreadType? type,
}) {
  final name = displayName.trim();
  if (name.isEmpty) {
    if (type == ChatThreadType.familyGroup) {
      return l10n.chatsDefaultFamilyGroup;
    }
    if (type == ChatThreadType.group) return l10n.chatsDefaultGroup;
    if (type == ChatThreadType.externalAgent) return l10n.chatsExtAgent;
    if (type == ChatThreadType.terminal) {
      return l10n.chatsTerminalTitle('');
    }
    return name;
  }
  if (name == ThreadTitleSentinels.group) return l10n.chatsDefaultGroup;
  if (name == ThreadTitleSentinels.familyGroup) {
    return l10n.chatsDefaultFamilyGroup;
  }
  if (name == ThreadTitleSentinels.extAgent) return l10n.chatsExtAgent;
  if (name.startsWith(ThreadTitleSentinels.terminalPrefix)) {
    return l10n.chatsTerminalTitle(
      name.substring(ThreadTitleSentinels.terminalPrefix.length),
    );
  }
  return name;
}

String localizeConnectionState(
  AppLocalizations l10n,
  NodeConnectionState state,
) {
  switch (state) {
    case NodeConnectionState.connected:
      return l10n.connStateConnected;
    case NodeConnectionState.connecting:
      return l10n.connStateConnecting;
    case NodeConnectionState.disconnected:
      return l10n.connStateDisconnected;
    case NodeConnectionState.error:
      return l10n.connStateError;
  }
}
