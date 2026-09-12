/// Bottom-nav tab ids for [HomeScreen] (Phase 68 — id-based, not index math).
///
/// Owner: Social | Coding | Knowledge | Terminal | Me
/// Family+coding: Chats | Coding | Me
/// Family−coding: Chats | Me
abstract final class HomeTabId {
  static const social = 'social';
  static const coding = 'coding';
  static const knowledge = 'knowledge';
  static const terminal = 'terminal';
  static const me = 'me';

  /// Family primary chat surface (IndexedStack body ≈ owner Social → Chats).
  static const chats = 'chats';
}

/// Tab list for the current profile. Prefer this over hard-coded indices.
List<String> buildHomeTabIds({
  required bool isOwner,
  required bool mayUseCoding,
}) {
  if (isOwner) {
    return const [
      HomeTabId.social,
      HomeTabId.coding,
      HomeTabId.knowledge,
      HomeTabId.terminal,
      HomeTabId.me,
    ];
  }
  if (mayUseCoding) {
    return const [HomeTabId.chats, HomeTabId.coding, HomeTabId.me];
  }
  return const [HomeTabId.chats, HomeTabId.me];
}

String fallbackHomeTabId({required bool isOwner}) =>
    isOwner ? HomeTabId.social : HomeTabId.chats;

/// Keep [stored] when still valid for [tabs]; otherwise [fallback].
String resolveHomeTabId(
  String? stored,
  List<String> tabs, {
  required String fallback,
}) {
  if (stored != null && tabs.contains(stored)) return stored;
  return fallback;
}

/// @Deprecated — use [HomeTabId]. Kept as aliases for gradual call-site migration.
abstract final class OwnerTabs {
  static const social = HomeTabId.social;
  static const coding = HomeTabId.coding;
  static const knowledge = HomeTabId.knowledge;
  static const terminal = HomeTabId.terminal;
  static const me = HomeTabId.me;
  static const chats = HomeTabId.chats;
}

/// Social top-tab indices inside [SocialScreen].
/// Order matches desktop Social: Chats | Feed | Blog | Market | Discover | Explore.
abstract final class SocialSurfaces {
  static const chats = 0;
  static const feeds = 1;
  static const blog = 2;
  static const market = 3;
  static const discover = 4;
  static const explore = 5;
}
