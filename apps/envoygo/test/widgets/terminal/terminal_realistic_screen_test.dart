// Realistic integration test: the terminal mounted inside the
// SAME widget tree shape that the real screen uses (Scaffold +
// SafeArea + Column[Expanded(Container(Stack[Align]))] +
// TerminalInputBar). The previous unit tests pumped the view
// in a raw SizedBox, which doesn't catch issues that arise
// from the real layout (Stack/Align size constraints, soft
// bar reserving vertical space, etc.).
//
// Run this test alongside the unit tests; if pan works in the
// unit tests but fails here, the bug is in the layout
// (likely an Align/Stack interaction that clips the painted
// area outside the gesture detector's bounds).

import 'dart:typed_data';

import 'package:envoygo/widgets/terminal/terminal_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Placeholder for the soft bar in this test. We don't need
/// the bar's gestures; we only need it to occupy vertical
/// space so the terminal area is sized the way the real
/// screen sizes it.
class _TestBar extends StatelessWidget {
  const _TestBar();
  @override
  Widget build(BuildContext context) {
    return Container(height: 48, color: Colors.grey);
  }
}

void main() {
  testWidgets(
      'Pan scrolls the scrollback when the terminal is mounted in the '
      'realistic screen layout (Scaffold + Column + Stack + Align)',
      (tester) async {
    var lastDisplacement = -1;
    final key = GlobalKey<TerminalViewState>();

    // Replicate the screen's widget tree.
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          appBar: AppBar(title: const Text('Test')),
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: Container(
                    color: Colors.black,
                    child: Stack(
                      children: [
                        Align(
                          alignment: Alignment.topCenter,
                          child: TerminalView(
                            key: key,
                            onScrollbackOffsetChanged: (d) =>
                                lastDisplacement = d,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox.shrink(), // placeholder for the soft bar in this test
                // (we don't need the actual bar — only the
                // terminal layout matters for the pan test).
                const _TestBar(),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    // Verify the painted area is actually receiving touches by
    // computing the expected bounds.
    final state = key.currentState!;
    expect(state.cols, greaterThan(0),
        reason: 'LayoutBuilder must derive a positive col count.');
    expect(state.rows, greaterThan(0),
        reason: 'LayoutBuilder must derive a positive row count.');

    // Fill the scrollback with content so the pan has something
    // to scroll through.
    final buf = StringBuffer();
    for (var i = 0; i < 60; i++) {
      buf.write('line $i\n');
    }
    state.write(Uint8List.fromList(buf.toString().codeUnits));
    await tester.pump();
    expect(lastDisplacement, 0);

    // Find the actual rendered TerminalView bounds. The
    // GestureDetector covers the same area, so a tap inside
    // these bounds should hit the pan recognizer.
    final viewFinder = find.byType(TerminalView);
    final viewRect = tester.getRect(viewFinder);
    expect(viewRect.width, greaterThan(0));
    expect(viewRect.height, greaterThan(0));
    // Make sure the view is actually inside the screen — the
    // painted area should be visible, not clipped off-screen.
    final screenSize = tester.getSize(find.byType(MaterialApp));
    expect(viewRect.left, greaterThanOrEqualTo(0),
        reason: 'Painted area should not be off-screen left.');
    expect(viewRect.top, greaterThanOrEqualTo(0),
        reason: 'Painted area should not be off-screen top.');

    // Tap the centre of the painted area to verify it's
    // hit-testable. We don't care about the callback result
    // (terminal no longer fires onTap); we just need the
    // touch to land on a real widget.
    final center = viewRect.center;
    await tester.tapAt(center);
    await tester.pump();

    // Now perform a vertical drag inside the painted area. The
    // drag should scroll the scrollback.
    final startX = viewRect.left + viewRect.width / 2;
    final startY = viewRect.top + viewRect.height / 2;
    final gesture = await tester.startGesture(Offset(startX, startY));
    // Drag down by 100 px (well past the touch slop of ~18 px).
    await gesture.moveBy(const Offset(0, 100));
    await tester.pump();
    await gesture.up();
    await tester.pump();

    // After the drag, the scrollback should have been scrolled
    // into (yDisplacement > 0).
    expect(
      lastDisplacement,
      greaterThan(0),
      reason: 'Dragging down 100 px inside the painted area '
          'must scroll the scrollback (yDisplacement > 0). '
          'If this is 0, the GestureDetector is not receiving '
          'the pan — likely an Align/Stack/sized-child '
          'interaction.',
    );
  });
}
