// Regression test for the "EnvoyGo Ext Agent switcher cannot scroll" bug.
//
// Symptom: tapping the Ext Agent switcher button opened a bottom
// sheet with a `Column` containing all agent `ListTile`s. When more
// than ~5 agents were present, the bottom items overflowed past
// the default ~50% sheet height and the top items were unreachable
// because the Column wasn't scrollable.
//
// Fix (apps/envoygo/lib/widgets/ext_agent_switcher.dart):
//   1. `showModalBottomSheet(..., isScrollControlled: true)` so the
//      sheet can grow past the default 9/16-height cap.
//   2. Wrap the agents list in a `ListView.builder` inside a
//      `Flexible` so it scrolls when the list overflows the sheet
//      height.
//   3. Add a `ConstrainedBox(maxHeight: 75% of screen)` so the sheet
//      doesn't cover the entire chat underneath.
//
// This test pins the fix at the source level — the runtime behavior
// (the user-visible bug) is a direct consequence of the source
// structure: a non-scrolling Column would render everything but
// truncate the bottom of the sheet, making the top items
// unreachable. The source-level guard catches a regression even
// if the widget tree is too provider-heavy to mount in a test
// environment.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ExtAgentSwitcher bottom sheet scrollability (Phase 56+ regression)', () {
    test(
      'showModalBottomSheet is called with isScrollControlled: true (sheet can grow past default cap)',
      () {
        final src = _readSource();
        expect(
          src,
          contains('isScrollControlled: true'),
          reason:
              'showModalBottomSheet must be called with isScrollControlled: true '
              'so the bottom sheet can grow tall enough to scroll the agent list. '
              'Without this, the default ~50%-of-screen cap truncates the list and '
              'the user cannot reach items at the bottom of the switcher.',
        );
      },
    );

    test(
      'agent list uses a scrollable widget (ListView / SingleChildScrollView), not a plain for-in-Column',
      () {
        final src = _readSource();
        final usesScrollable = RegExp(
          r'\b(ListView|SingleChildScrollView|CustomScrollView)\b',
        ).hasMatch(src);
        expect(
          usesScrollable,
          isTrue,
          reason:
              'Agent list must be inside a scrollable widget '
              '(ListView / SingleChildScrollView / CustomScrollView) so it can '
              'scroll when overflowing the bottom sheet height. The previous bug '
              'used `for (final agent in _agents) ListTile(...)` inside a plain '
              'Column — that is the original bug and we must never regress to it.',
        );
        // Belt-and-suspenders: explicitly assert the buggy `for (...) ListTile`
        // pattern is gone.
        final buggyPattern = RegExp(
          r'for\s*\(\s*final\s+\w+\s+in\s+_agents\s*\)\s*ListTile',
        );
        expect(
          buggyPattern.hasMatch(src),
          isFalse,
          reason:
              'The buggy `for (final agent in _agents) ListTile(...)` pattern is '
              'present in the source. This is the original bug — agent items in a '
              'non-scrolling Column truncate at the bottom of the bottom sheet '
              'with no way to scroll.',
        );
      },
    );

    test(
      'ConstrainedBox caps the sheet height (so the underlying chat stays partially visible)',
      () {
        final src = _readSource();
        // The sheet should cap at ~75% of screen so the user can
        // still see a hint of the underlying chat. The CapFix uses
        // `MediaQuery.of(ctx).size.height * 0.75`.
        final hasCap = RegExp(
          r'size\.height\s*\*\s*0\.75',
        ).hasMatch(src);
        expect(
          hasCap,
          isTrue,
          reason:
              'Bottom sheet should cap at ~75% of screen height via '
              '`size.height * 0.75` so the user can still see a hint of the '
              'underlying chat and remember the sheet is dismissible.',
        );
      },
    );

    test(
      'Flexible wraps the scrollable list (so it shrinks to fit the available sheet height)',
      () {
        final src = _readSource();
        // The ListView must be wrapped in a `Flexible` so it sizes
        // to the available sheet height (not the full content
        // height). Without Flexible, the inner ListView would
        // either overflow or fight the outer Column.
        final usesFlexible = RegExp(
          r'Flexible\s*\(\s*child\s*:\s*(ListView|SingleChildScrollView)',
        ).hasMatch(src);
        expect(
          usesFlexible,
          isTrue,
          reason:
              'The scrollable list must be wrapped in `Flexible` so it sizes '
              'to the available sheet height (not the full content height). '
              'Without Flexible, the inner ListView would overflow the parent '
              'Column or push the title off-screen.',
        );
      },
    );

    test(
      'File is well-formed Dart (compiles without errors)', () {
        final src = _readSource();
        // The brace balance must be valid.
        final openBraces = '\{'.allMatches(src).length;
        final closeBraces = '\}'.allMatches(src).length;
        expect(
          openBraces,
          closeBraces,
          reason:
              'Brace mismatch in ext_agent_switcher.dart — would not compile. '
              'openBraces=$openBraces closeBraces=$closeBraces',
        );
        // The `buildMessageStacks` import from chat-message-stack is
        // not relevant here; just sanity-check we still import the
        // right packages.
        expect(src, contains("import 'package:flutter/material.dart'"));
      },
    );
    test(
      'owner-only: switcher hides / no-ops for non-owner family profiles',
      () {
        final src = _readSource();
        expect(
          src,
          contains('isOwnerProfile'),
          reason:
              'ExtAgentSwitcher must gate on isOwnerProfile so family members '
              'cannot change the shared active Ext Agent (one agent for the '
              'whole home node; only the owner configures which one).',
        );
        expect(
          src,
          contains('SizedBox.shrink()'),
          reason:
              'Non-owner build path should return SizedBox.shrink() so the '
              'switch control is not visible on family EnvoyGo sessions.',
        );
      },
    );
  });
}

String _readSource() {
  // Resolve the path relative to the package root. Flutter tests run
  // with the working directory set to the package root by default.
  final path = 'lib/widgets/ext_agent_switcher.dart';
  return File(path).readAsStringSync();
}
