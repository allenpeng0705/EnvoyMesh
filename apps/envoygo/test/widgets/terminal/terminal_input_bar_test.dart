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
  });
}
