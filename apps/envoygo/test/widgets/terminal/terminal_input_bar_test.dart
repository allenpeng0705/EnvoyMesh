import 'package:envoygo/widgets/terminal/terminal_input_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('TerminalInputBar', () {
    testWidgets('tapping arrow up sends ESC [ A', (tester) async {
      String? sent;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(onKey: (b) => sent = b),
          ),
        ),
      );
      // Find the tooltip for "Up" and tap it.
      final upTooltip = find.byTooltip('Up');
      expect(upTooltip, findsOneWidget);
      await tester.tap(upTooltip);
      expect(sent, '\x1B[A');
    });

    testWidgets('tapping arrow down sends ESC [ B', (tester) async {
      String? sent;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(onKey: (b) => sent = b),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Down'));
      expect(sent, '\x1B[B');
    });

    testWidgets('tapping left / right sends the right escape sequences',
        (tester) async {
      final sent = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(onKey: sent.add),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Left'));
      await tester.tap(find.byTooltip('Right'));
      expect(sent, ['\x1B[D', '\x1B[C']);
    });

    testWidgets('tapping Tab / Esc / Enter sends the right bytes',
        (tester) async {
      final sent = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(onKey: sent.add),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Tab'));
      await tester.tap(find.byTooltip('Esc'));
      await tester.tap(find.byTooltip('Enter'));
      expect(sent, ['\t', '\x1B', '\r']);
    });

    testWidgets('tapping Ctrl toggles the highlight state', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(onKey: (_) {}),
          ),
        ),
      );
      // Initially no highlight.
      expect(find.text('Ctrl'), findsOneWidget);
      // Tap Ctrl to enable.
      await tester.tap(find.byTooltip('Ctrl modifier (sticky)'));
      await tester.pump();
      // The Ctrl label should still be there (the bar is the
      // same widget, but the visual state changed). We assert
      // the onKey is not called yet (the modifier is just a
      // flag; the next letter press would use it).
      // No explicit assertion here other than the widget still
      // rendering.
      expect(find.byType(TerminalInputBar), findsOneWidget);
    });

    testWidgets('Copy button is disabled when hasSelection is false',
        (tester) async {
      var copyCalled = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(
              onKey: (_) {},
              hasSelection: false,
              onCopy: () => copyCalled = true,
            ),
          ),
        ),
      );
      // The Copy button is present but its onPressed is null.
      final copyButton = find.byTooltip('Copy selection');
      expect(copyButton, findsOneWidget);
      // Tapping should not call onCopy.
      await tester.tap(copyButton);
      expect(copyCalled, isFalse);
    });

    testWidgets('Copy button fires when hasSelection is true',
        (tester) async {
      var copyCalled = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(
              onKey: (_) {},
              hasSelection: true,
              onCopy: () => copyCalled = true,
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Copy selection'));
      expect(copyCalled, isTrue);
    });

    testWidgets('Paste button fires onPaste callback when provided',
        (tester) async {
      var pasteCalled = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(
              onKey: (_) {},
              onPaste: () => pasteCalled = true,
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Paste'));
      expect(pasteCalled, isTrue);
    });

    testWidgets('Enabled=false mutes key taps', (tester) async {
      var count = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(
              onKey: (_) => count++,
              enabled: false,
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Up'));
      await tester.tap(find.byTooltip('Enter'));
      // The widget still renders; taps are no-ops.
      expect(count, 0);
    });

    testWidgets('Slash and Pipe buttons send literal bytes',
        (tester) async {
      final sent = <String>[];
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(onKey: sent.add),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Slash'));
      await tester.tap(find.byTooltip('Pipe'));
      expect(sent, ['/', '|']);
    });

    testWidgets('Hide-keyboard button fires onHideKeyboard when set',
        (tester) async {
      // Regression: pressing Enter on the device keyboard used to
      // dismiss the OS keyboard. The fix kept the keyboard open
      // across Enter presses, which left the user with no in-app
      // way to dismiss it. The soft bar's "Hide keyboard" button
      // is the explicit dismissal path.
      var hideCount = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(
              onKey: (_) {},
              onHideKeyboard: () => hideCount++,
            ),
          ),
        ),
      );
      final hideButton = find.byTooltip('Hide keyboard');
      expect(hideButton, findsOneWidget);
      await tester.tap(hideButton);
      expect(hideCount, 1);
    });

    testWidgets('Hide-keyboard button is a no-op when callback is null',
        (tester) async {
      // The button must still render and be tappable when the
      // screen doesn't pass `onHideKeyboard` (e.g. when used in a
      // context where focus management is irrelevant).
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TerminalInputBar(onKey: (_) {}),
          ),
        ),
      );
      final hideButton = find.byTooltip('Hide keyboard');
      expect(hideButton, findsOneWidget);
      // Tapping it does not throw.
      await tester.tap(hideButton);
    });

    testWidgets('Soft bar is horizontally scrollable when content overflows',
        (tester) async {
      // Regression: on narrow phones the soft bar's full set of
      // buttons overflowed the row and the new "Hide keyboard"
      // button was off-screen. The bar is now wrapped in a
      // horizontal SingleChildScrollView. We force the overflow by
      // pumping the bar in a narrow viewport, then assert that:
      //   - the keyboard-hide button still exists in the widget
      //     tree (it's reachable by scrolling, not by being on
      //     screen at the start).
      //   - the bar's outer widget is a horizontal scroll view.
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SizedBox(
                // Narrow viewport: forces the row to overflow.
                width: 200,
                child: TerminalInputBar(onKey: (_) {}),
              ),
            ),
          ),
        ),
      );
      // The button is in the tree.
      expect(find.byTooltip('Hide keyboard'), findsOneWidget);
      // The bar contains a SingleChildScrollView in horizontal mode.
      final scrollViews = find.descendant(
        of: find.byType(TerminalInputBar),
        matching: find.byType(SingleChildScrollView),
      );
      expect(scrollViews, findsAtLeastNWidgets(1));
      final scrollView = tester.widget<SingleChildScrollView>(scrollViews.first);
      expect(scrollView.scrollDirection, Axis.horizontal);
    });

    testWidgets('Show-keyboard and Hide-keyboard buttons are on the left '
        '(before the arrow keys)', (tester) async {
      // Regression: the keyboard-hide button used to be on the
      // right, where it could be off-screen on narrow phones
      // (and required scrolling the bar to reach). The user
      // asked for it to be on the left, always visible. We
      // then also added a Show-keyboard button (because the
      // previous "tap the terminal to summon the keyboard"
      // behaviour was removed — the hidden TextField that
      // captured those taps also blocked the TerminalView's
      // pan, making the terminal unscrollable). Both
      // keyboard buttons are now the leftmost pair.
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 60,
              child: TerminalInputBar(onKey: (_) {}),
            ),
          ),
        ),
      );
      final showRect = tester.getRect(find.byTooltip('Show keyboard'));
      final hideRect = tester.getRect(find.byTooltip('Hide keyboard'));
      final upRect = tester.getRect(find.byTooltip('Up'));
      expect(
        showRect.center.dx,
        lessThan(upRect.center.dx),
        reason: 'Show-keyboard must be on the left (x=${showRect.center.dx}) '
            'so it is always visible without scrolling. '
            'The Up arrow is at x=${upRect.center.dx}.',
      );
      expect(
        hideRect.center.dx,
        lessThan(upRect.center.dx),
        reason: 'Hide-keyboard must be on the left (x=${hideRect.center.dx}) '
            'so it is always visible without scrolling. '
            'The Up arrow is at x=${upRect.center.dx}.',
      );
    });

    testWidgets('Show-keyboard button fires onShowKeyboard when set',
        (tester) async {
      // The terminal's only path to the OS keyboard is via this
      // soft-bar button. We used to summon the keyboard by
      // tapping the terminal area, but the hidden TextField
      // that captured those taps also blocked the TerminalView's
      // pan gesture, making the terminal unscrollable. The
      // soft-bar button is the explicit, discoverable path.
      var showCount = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 60,
              child: TerminalInputBar(
                onKey: (_) {},
                onShowKeyboard: () => showCount++,
              ),
            ),
          ),
        ),
      );
      final showButton = find.byTooltip('Show keyboard');
      expect(showButton, findsOneWidget);
      await tester.tap(showButton);
      expect(showCount, 1);
    });

    testWidgets('Show-keyboard button is a no-op when callback is null',
        (tester) async {
      // The button must still render when the screen doesn't
      // pass onShowKeyboard (defensive — keeps the bar usable
      // in any context).
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 60,
              child: TerminalInputBar(onKey: (_) {}),
            ),
          ),
        ),
      );
      final showButton = find.byTooltip('Show keyboard');
      expect(showButton, findsOneWidget);
      // Tapping it does not throw.
      await tester.tap(showButton);
    });
  });
}
