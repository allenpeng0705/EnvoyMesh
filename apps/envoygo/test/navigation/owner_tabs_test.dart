import 'package:envoygo/navigation/owner_tabs.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('buildHomeTabIds', () {
    test('owner gets Social Coding Knowledge Terminal Me', () {
      expect(
        buildHomeTabIds(isOwner: true, mayUseCoding: true),
        [
          HomeTabId.social,
          HomeTabId.coding,
          HomeTabId.knowledge,
          HomeTabId.terminal,
          HomeTabId.me,
        ],
      );
      // Owner always sees Coding regardless of mayUseCoding flag.
      expect(
        buildHomeTabIds(isOwner: true, mayUseCoding: false),
        [
          HomeTabId.social,
          HomeTabId.coding,
          HomeTabId.knowledge,
          HomeTabId.terminal,
          HomeTabId.me,
        ],
      );
    });

    test('family+coding gets Chats Coding Me', () {
      expect(
        buildHomeTabIds(isOwner: false, mayUseCoding: true),
        [HomeTabId.chats, HomeTabId.coding, HomeTabId.me],
      );
    });

    test('family−coding gets Chats Me', () {
      expect(
        buildHomeTabIds(isOwner: false, mayUseCoding: false),
        [HomeTabId.chats, HomeTabId.me],
      );
    });
  });

  group('resolveHomeTabId', () {
    test('keeps stored id when still in tab list', () {
      final tabs = buildHomeTabIds(isOwner: true, mayUseCoding: true);
      expect(
        resolveHomeTabId(HomeTabId.coding, tabs, fallback: HomeTabId.social),
        HomeTabId.coding,
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
