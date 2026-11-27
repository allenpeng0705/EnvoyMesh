import 'package:envoygo/navigation/owner_tabs.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('buildHomeTabIds', () {
    test('owner gets Social Knowledge Terminal Me (Coding is not a tab)', () {
      expect(
        buildHomeTabIds(isOwner: true, mayUseCoding: true),
        [
          HomeTabId.social,
          HomeTabId.knowledge,
          HomeTabId.terminal,
          HomeTabId.me,
        ],
      );
      expect(
        buildHomeTabIds(isOwner: true, mayUseCoding: false),
        [
          HomeTabId.social,
          HomeTabId.knowledge,
          HomeTabId.terminal,
          HomeTabId.me,
        ],
      );
      expect(
        buildHomeTabIds(isOwner: true, mayUseCoding: true),
        isNot(contains(HomeTabId.coding)),
      );
    });

    test('family gets Chats Me regardless of mayUseCoding', () {
      expect(
        buildHomeTabIds(isOwner: false, mayUseCoding: true),
        [HomeTabId.chats, HomeTabId.me],
      );
      expect(
        buildHomeTabIds(isOwner: false, mayUseCoding: false),
        [HomeTabId.chats, HomeTabId.me],
      );
    });
  });

  group('resolveHomeTabId', () {
    test('falls back when stored Coding tab is no longer in the list', () {
      final tabs = buildHomeTabIds(isOwner: true, mayUseCoding: true);
      expect(
        resolveHomeTabId(HomeTabId.coding, tabs, fallback: HomeTabId.social),
        HomeTabId.social,
      );
    });

    test('falls back when stored id not in list (e.g. Terminal on family)', () {
      final tabs = buildHomeTabIds(isOwner: false, mayUseCoding: false);
      expect(
        resolveHomeTabId(HomeTabId.terminal, tabs, fallback: HomeTabId.chats),
        HomeTabId.chats,
      );
    });
  });
}
