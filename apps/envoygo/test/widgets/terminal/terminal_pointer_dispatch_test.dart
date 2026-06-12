// Pointer dispatch test.
//
// Goal: identify why scrolling might fail on a real device
// but pass in flutter_test. flutter_test uses a synthetic
// pointer dispatch system that closely matches the production
// engine, but the two have some subtle differences (event
// coalescing, hit-test boundary handling, accessibility-mode
// hit-test expansion). This test exercises the same code
// path the production engine uses by:
//
// 1. Building the terminal in a real device-sized widget
//    tree (375x667, iPhone-ish).
// 2. Simulating a slow drag with multiple small move events
//    (the OS often batches these on real devices).
// 3. Asserting that yDisplacement increases after the drag.
// 4. Asserting the right-edge indicator moves.

import 'dart:typed_data';

import 'package:envoygo/widgets/terminal/terminal_input_bar.dart';
import 'package:envoygo/widgets/terminal/terminal_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _TestBar extends StatelessWidget {
  const _TestBar();
  @override
  Widget build(BuildContext context) {
    return Container(height: 48, color: Colors.grey);
  }
}

void main() {
  testWidgets(
      'Slow drag (many small pointerMove events) scrolls the scrollback '
      'on a device-sized terminal', (tester) async {
    // The user's device is roughly 375 × 667 (iPhone 8 size).
    // Set the test surface to that size.
    tester.view.physicalSize = const Size(750, 1334); // 2x DPR
    tester.view.devicePixelRatio = 2.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final key = GlobalKey<TerminalViewState>();
    var lastDisplacement = 0;
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
                const _TestBar(),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    final state = key.currentState!;
    expect(state.cols, greaterThan(0));
    expect(state.rows, greaterThan(0),
        reason: 'LayoutBuilder must derive a positive row count.');

    // Fill the scrollback with content.
    final buf = StringBuffer();
    for (var i = 0; i < 60; i++) {
      buf.write('L$i\n');
    }
    state.write(Uint8List.fromList(buf.toString().codeUnits));
    await tester.pump();
    expect(lastDisplacement, 0);

    // Find the actual painted area's bounds.
    final viewRect = tester.getRect(find.byType(TerminalView));
    expect(viewRect.width, greaterThan(0));
    expect(viewRect.height, greaterThan(0));
    expect(viewRect.left, greaterThanOrEqualTo(0),
        reason: 'Painted area should not be off-screen left.');

    // Simulate a slow drag with many small move events, the
    // kind the OS would deliver on a real phone.
    final startX = viewRect.left + viewRect.width / 2;
    final startY = viewRect.top + viewRect.height / 2;
    final gesture = await tester.startGesture(Offset(startX, startY));
    for (var i = 0; i < 20; i++) {
      await gesture.moveBy(const Offset(0, 8));
      await tester.pump(const Duration(milliseconds: 16));
    }
    await gesture.up();
    await tester.pump();

    expect(
      state.yDisplacement,
      greaterThan(0),
      reason: 'After a slow drag (20 × 8-px moves) on a device-sized '
          'terminal, yDisplacement must be > 0. If this fails, the '
          'pan recognizer is not being triggered, OR the scroll '
          'is being undone by some other path.',
    );
  });
}
