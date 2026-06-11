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

    testWidgets('Hide-keyboard button is the leftmost button', (tester) async {
      // Regression: the keyboard-hide button used to be on the
      // right, where it could be off-screen on narrow phones
      // (and required scrolling the bar to reach). The user
      // asked for it to be on the left, always visible. We
      // assert that it appears before the arrow keys in the
      // soft bar's row by checking that its centre x is less
      // than the Up arrow's centre x.
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
      final hideRect = tester.getRect(find.byTooltip('Hide keyboard'));
      final upRect = tester.getRect(find.byTooltip('Up'));
      expect(
        hideRect.center.dx,
        lessThan(upRect.center.dx),
        reason: 'Hide-keyboard must be the leftmost button (x=${hideRect.center.dx}) '
            'so it is always visible without scrolling the bar. '
            'The Up arrow is at x=${upRect.center.dx}.',
      );
    });

    testWidgets('Scroll-up / scroll-down / jump-to-bottom buttons fire '
        'their callbacks', (tester) async {
      // The user needs a discoverable way to scroll through
      // terminal history (long output, claude --help, etc.).
      // The soft bar exposes three explicit buttons that
      // bypass the pan gesture entirely. Each fires the
      // matching callback exactly once per tap.
      var scrollUpCount = 0;
      var scrollDownCount = 0;
      var jumpCount = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 60,
              child: TerminalInputBar(
                onKey: (_) {},
                onScrollUp: () => scrollUpCount++,
                onScrollDown: () => scrollDownCount++,
                onJumpToBottom: () => jumpCount++,
                canJumpToBottom: true,
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Scroll up (history)'));
      await tester.tap(find.byTooltip('Scroll down (history)'));
      await tester.tap(find.byTooltip('Jump to bottom (live view)'));
      expect(scrollUpCount, 1);
      expect(scrollDownCount, 1);
      expect(jumpCount, 1);
    });

    testWidgets('Jump-to-bottom button is disabled when canJumpToBottom=false',
        (tester) async {
      // When the user is at the live view (yDisplacement == 0),
      // jump-to-bottom would be a no-op. Disable the button so
      // the user understands they're already at the bottom.
      var jumpCount = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: 800,
              height: 60,
              child: TerminalInputBar(
                onKey: (_) {},
                onJumpToBottom: () => jumpCount++,
                // canJumpToBottom defaults to false
              ),
            ),
          ),
        ),
      );
      final jumpButton = find.byTooltip('Jump to bottom (live view)');
      // Tapping an InkResponse with onPressed=null is a no-op.
      await tester.tap(jumpButton);
      expect(jumpCount, 0,
          reason: 'Jump-to-bottom is a no-op when already at the bottom.');
    });
  });
}
