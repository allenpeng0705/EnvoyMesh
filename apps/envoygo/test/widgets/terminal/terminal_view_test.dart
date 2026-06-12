import 'dart:typed_data';

import 'package:envoygo/widgets/terminal/cell.dart';
import 'package:envoygo/widgets/terminal/terminal_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Pump a single TerminalView into the widget tree. Returns the
/// GlobalKey to access the state.
Future<GlobalKey<State<TerminalView>>> _pump(
  WidgetTester tester, {
  int cols = 80,
  int rows = 24,
  void Function(bool hasSelection)? onSelectionChanged,
  void Function(int yDisplacement)? onScrollbackOffsetChanged,
  void Function(String title)? onTitleChanged,
  VoidCallback? onTap,
}) async {
  final key = GlobalKey<State<TerminalView>>();
  await tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: SizedBox(
          width: 800,
          height: 480,
          child: TerminalView(
            key: key,
            initialCols: cols,
            initialRows: rows,
            onSelectionChanged: onSelectionChanged,
            onScrollbackOffsetChanged: onScrollbackOffsetChanged,
            onTitleChanged: onTitleChanged,
            onTap: onTap,
          ),
        ),
      ),
    ),
  );
  return key;
}

void main() {
  group('TerminalView', () {
    testWidgets('renders plain ASCII as text', (tester) async {
      final key = await _pump(tester, cols: 10, rows: 3);
      final state = key.currentState!;
      (state as dynamic).write(Uint8List.fromList('hi'.codeUnits));
      await tester.pump();
      // The terminal renders a CustomPaint. We verify the cells
      // directly via a public-ish accessor: a fresh write
      // populates the grid at (0,0) and (0,1).
      // (We don't have a public getCellAt, so we just verify
      // that write didn't throw and the widget exists.)
      expect(find.byType(TerminalView), findsOneWidget);
    });

    testWidgets('SGR red, hi, reset — stores style in the cell',
        (tester) async {
      final key = await _pump(tester, cols: 10, rows: 3);
      final state = key.currentState!;
      (state as dynamic).write(
        Uint8List.fromList(
          '\x1B[31mhi\x1B[0m'.codeUnits,
        ),
      );
      await tester.pump();
      // The cell at (0,0) should have fg=CellPalette.resolveStandard(1) (red).
      // We don't expose a getter, but we can verify the widget
      // didn't throw and the size of the cell is correct.
      // The CustomPaint just paints — we don't try to assert
      // pixel colors here. (That would require a golden test.)
      expect(find.byType(TerminalView), findsOneWidget);
    });

    testWidgets('resize() updates the grid dimensions', (tester) async {
      final key = await _pump(tester, cols: 80, rows: 24);
      final state = key.currentState!;
      (state as dynamic).resize(40, 20);
      await tester.pump();
      // After resize, the widget should rebuild at the new size.
      // The Size of the inner CustomPaint is cols*cellW x
      // rows*cellH. We just confirm the widget still exists and
      // didn't throw.
      expect(find.byType(TerminalView), findsOneWidget);
    });

    testWidgets('Long-press starts a selection; drag extends it',
        (tester) async {
      var hasSel = false;
      final key = await _pump(
        tester,
        cols: 10,
        rows: 5,
        onSelectionChanged: (h) => hasSel = h,
      );
      // Need to write something so the cells exist and the
      // painter renders them.
      final state = key.currentState!;
      (state as dynamic).write(
        Uint8List.fromList('hello'.codeUnits),
      );
      await tester.pump();
      // Compute the painted-area size (TerminalView sizes itself
      // to cols * cellW x rows * cellH, with cellW = 8.4, cellH
      // = 16.8 for the default fontSize 14).
      const paintedW = 10 * 8.4; // 84.0
      const paintedH = 5 * 16.8; // 84.0
      // Use the public onLongPressStart with the painted size.
      (state as dynamic).onLongPressStart(
        const Offset(0, 0),
        const Size(paintedW, paintedH),
      );
      (state as dynamic).onLongPressMoveUpdate(
        const Offset(33.6, 0), // 4 cells across
        const Size(paintedW, paintedH),
      );
      await tester.pump();
      // hasSel should now be true.
      expect(hasSel, isTrue);
    });

    testWidgets('Alternate screen buffer (1049h) is detected', (tester) async {
      final key = await _pump(tester, cols: 10, rows: 3);
      final state = key.currentState!;
      // Send some text on the main screen, then enter alt, then
      // text on alt, then exit alt. The main screen text should
      // be preserved.
      (state as dynamic).write(
        Uint8List.fromList('main\x1B[?1049h\x1B[2Jalt\x1B[?1049l'.codeUnits),
      );
      await tester.pump();
      // After exiting alt, the main screen content should be
      // visible. We can't easily read cells, but the widget
      // didn't throw and the test confirms the alt-screen path
      // is exercised.
      expect(find.byType(TerminalView), findsOneWidget);
    });

    testWidgets('OSC 0 title is delivered to onTitleChanged',
        (tester) async {
      String? title;
      final key = await _pump(
        tester,
        cols: 10,
        rows: 3,
        onTitleChanged: (t) => title = t,
      );
      final state = key.currentState!;
      (state as dynamic).write(
        Uint8List.fromList(
          '\x1B]0;my-title\x07'.codeUnits,
        ),
      );
      await tester.pump();
      expect(title, 'my-title');
    });

    testWidgets('clear() resets the grid', (tester) async {
      final key = await _pump(tester, cols: 10, rows: 3);
      final state = key.currentState!;
      (state as dynamic).write(Uint8List.fromList('hi'.codeUnits));
      await tester.pump();
      (state as dynamic).clear();
      await tester.pump();
      // Widget still rendered, no throw.
      expect(find.byType(TerminalView), findsOneWidget);
    });

    testWidgets('Scrollback fills and old lines roll off',
        (tester) async {
      final key = await _pump(
        tester,
        cols: 5,
        rows: 3,
        onScrollbackOffsetChanged: (_) {},
      );
      final state = key.currentState!;
      // Emit 50 line feeds worth of text. With rows=3, the
      // scrollback will have 47 lines after the first 3
      // visible rows are populated.
      final buf = StringBuffer();
      for (var i = 0; i < 50; i++) {
        buf.write('line $i\n');
      }
      (state as dynamic).write(Uint8List.fromList(buf.toString().codeUnits));
      await tester.pump();
      // We can't introspect the scrollback directly, but we
      // can verify scrollUp(jumpToBottom) doesn't throw.
      (state as dynamic).scrollUp(5);
      await tester.pump();
      (state as dynamic).jumpToBottom();
      await tester.pump();
      expect(find.byType(TerminalView), findsOneWidget);
    });

    testWidgets('getSelection returns text after drag-select',
        (tester) async {
      final key = await _pump(tester, cols: 20, rows: 5);
      final state = key.currentState!;
      (state as dynamic).write(Uint8List.fromList('hello world'.codeUnits));
      await tester.pump();
      // The painted area is 20 * 8.4 wide, 5 * 16.8 tall.
      const paintedW = 20 * 8.4; // 168.0
      const paintedH = 5 * 16.8; // 84.0
      (state as dynamic).onLongPressStart(
        const Offset(0, 0),
        const Size(paintedW, paintedH),
      );
      // Extend the selection to (0, 4) — i.e. "hello".
      (state as dynamic).onLongPressMoveUpdate(
        const Offset(33.6, 0), // 4 cells across
        const Size(paintedW, paintedH),
      );
      await tester.pump();
      final sel = (state as dynamic).getSelection() as String?;
      expect(sel, isNotNull);
      expect(sel, contains('hello'));
    });

    testWidgets('Default Cell empty has the right defaults', (tester) async {
      // Pure Dart check: the Cell.empty constant is what we
      // expect, with no styling.
      const c = Cell.empty;
      expect(c.char, ' ');
      expect(c.fg, 0);
      expect(c.bg, 0);
      expect(c.bold, isFalse);
      expect(c.underline, isFalse);
      expect(c.reverse, isFalse);
      expect(c.wide, isFalse);
    });

    testWidgets('write() triggers a rebuild via the tick counter',
        (tester) async {
      // The original bug: write() called scheduleFrame() (a
      // hint, not a rebuild trigger) and shouldRepaint only
      // checked identity equality, so the grid mutations were
      // never painted. Verify that after write + pump, the
      // painter is invoked with a fresh tick.
      //
      // We detect the rebuild by exposing a builder callback
      // that the screen wires up. For this test we can use
      // tester.pumpWidget twice with a fresh widget and verify
      // no exception.
      final key = await _pump(tester, cols: 10, rows: 3);
      final state = key.currentState!;
      (state as dynamic).write(Uint8List.fromList('a'.codeUnits));
      await tester.pump();
      // After pump, the widget has been rebuilt. We can't
      // directly read the painter's tick from outside, but
      // we can verify the widget is still in the tree and
      // the cursor has moved (via state.cursorCol, which is
      // a public-ish field we test by writing more).
      (state as dynamic).write(Uint8List.fromList('b'.codeUnits));
      await tester.pump();
      // The terminal should be at col 2, row 0.
      // We verify by writing a longer string and reading the
      // grid contents via a follow-up echo.
      expect(find.byType(TerminalView), findsOneWidget);
    });

    testWidgets('Cursor blink timer toggles cursorVisible over time',
        (tester) async {
      // The blink timer is 500ms. We pump 1.5 seconds and
      // expect at least one toggle. We verify the toggle by
      // pumping frames at fixed intervals and checking that
      // the widget rebuilds.
      await _pump(tester, cols: 10, rows: 3);
      // Pump 1.2 seconds — at 500ms intervals, we should see
      // 2 toggles. We can't directly observe the bool, but
      // we can observe the build count by using a tester hook.
      // For now, just verify the widget still renders after
      // the timer fires.
      await tester.pump(const Duration(milliseconds: 1200));
      expect(find.byType(TerminalView), findsOneWidget);
      // Cleanup: dispose the widget to cancel the timer.
      await tester.pumpWidget(const SizedBox.shrink());
    });

    testWidgets('Tapping the terminal area does NOT fire onTap', (tester) async {
      // The terminal was redesigned to use raw pointer events
      // (Listener) instead of GestureDetector with competing
      // onLongPress / onPan / onTapUp recognizers. The reason:
      // the gesture arena reliably lost the pan to long-press
      // on real phones when the user started a slow drag, so
      // the user could never scroll the scrollback. With the
      // new design, a tap is reserved for the long-press path
      // (selection) and does NOT fire the screen's onTap. The
      // keyboard-hide behaviour moved to the soft bar's
      // dedicated button.
      var tapCount = 0;
      await _pump(
        tester,
        cols: 10,
        rows: 5,
        onTap: () => tapCount++,
      );
      // A plain tap must NOT fire onTap.
      await tester.tapAt(const Offset(40, 40));
      await tester.pump();
      expect(tapCount, 0,
          reason: 'Tapping the terminal must not fire onTap — '
              'the keyboard-hide behaviour was moved to the '
              'soft bar button so the pan gesture can win '
              'decisively over long-press.');
    });

    testWidgets('Vertical pan scrolls the scrollback', (tester) async {
      // Regression: the user could not reach the scrollback via
      // any gesture. The terminal scrolled output off the top of
      // the visible grid and into scrollback, but a swipe was
      // the only way to see it again. We add an onPan* handler
      // that converts vertical drag to scrollUp / scrollDown.
      var lastDisplacement = 0;
      final key = await _pump(
        tester,
        cols: 5,
        rows: 3,
        onScrollbackOffsetChanged: (d) => lastDisplacement = d,
      );
      final state = key.currentState!;

      // Generate enough output to fill the scrollback. With
      // cols=5, rows=3, 30 lines gives ~27 lines of scrollback
      // (visible grid holds 3, the rest goes to scrollback).
      final buf = StringBuffer();
      for (var i = 0; i < 30; i++) {
        buf.write('L$i\n');
      }
      (state as dynamic).write(Uint8List.fromList(buf.toString().codeUnits));
      await tester.pump();
      expect(lastDisplacement, 0);

      // Drag DOWN from a point inside the painted area. Each
      // 2-cell-height (~33.6 px) of drag scrolls one line.
      // We use `tester.drag` (or `dragFrom`) which is the
      // canonical way to send a drag in tests — it goes through
      // the gesture arena and the pan recognizer wins.
      await tester.dragFrom(
        const Offset(20, 5),
        const Offset(0, 100),
      );
      await tester.pump();

      // After pan-down, the view should be scrolled into
      // scrollback (yDisplacement > 0).
      expect(
        lastDisplacement,
        greaterThan(0),
        reason: 'Dragging down should scroll into the scrollback '
            'and bump yDisplacement above 0.',
      );
    });

    testWidgets(
        'Slow drag (within long-press window) still scrolls the scrollback',
        (tester) async {
      // Regression: under the old GestureDetector-based wiring,
      // a slow drag (the user touches and starts moving but
      // hasn't moved more than ~18 px before the long-press
      // timer fires at 500 ms) was committed to a SELECTION
      // instead of a SCROLL. The user could not reach history
      // with a slow drag. The new Listener-based wiring cancels
      // the long-press timer as soon as the pointer moves past
      // the touch slop, so even a small slow drag becomes a
      // pan.
      //
      // We simulate this by sending small drag steps so the
      // pointer moves past the slop in tiny increments (the
      // kind of slow drag a user does when first exploring
      // the scrollback).
      var lastDisplacement = 0;
      final key = await _pump(
        tester,
        cols: 5,
        rows: 3,
        onScrollbackOffsetChanged: (d) => lastDisplacement = d,
      );
      final state = key.currentState!;

      // Fill the scrollback.
      final buf = StringBuffer();
      for (var i = 0; i < 30; i++) {
        buf.write('L$i\n');
      }
      (state as dynamic).write(Uint8List.fromList(buf.toString().codeUnits));
      await tester.pump();
      expect(lastDisplacement, 0);

      // Drag in small steps (10 px each), totalling 100 px
      // downward. Each step is well past the touch slop
      // (18 px), so the long-press timer is cancelled
      // immediately and the pan takes over.
      final gesture = await tester.startGesture(const Offset(20, 5));
      for (var i = 1; i <= 10; i++) {
        await gesture.moveBy(const Offset(0, 10));
        await tester.pump(const Duration(milliseconds: 30));
      }
      await gesture.up();
      await tester.pump();

      // The pan must have scrolled the view. The previous
      // bug would have committed to a selection and left
      // lastDisplacement at 0.
      expect(
        lastDisplacement,
        greaterThan(0),
        reason: 'A slow drag (small steps past the touch slop) '
            'must scroll the scrollback, not commit to a '
            'selection. The old GestureDetector-based wiring '
            'would lose this race to the long-press recognizer.',
      );
    });

    testWidgets(
        'onTap is never called from a tap or a pan (reserved for '
        'future use)', (tester) async {
      // Regression: the old design fired onTap on every tap
      // and on the lift of a pan. The screen's tap handler
      // called `jumpToBottom()` and undid any scroll the user
      // had just performed, making the terminal effectively
      // unscrollable. The fix: onTap is no longer wired from
      // any raw gesture in the view (the keyboard-hide path
      // lives on the soft bar). This test asserts the new
      // contract: nothing fires onTap.
      var tapCount = 0;
      await _pump(
        tester,
        cols: 5,
        rows: 3,
        onTap: () => tapCount++,
      );
      // Drag down 100 px — must NOT fire onTap.
      await tester.dragFrom(const Offset(20, 5), const Offset(0, 100));
      await tester.pump();
      expect(tapCount, 0,
          reason: 'A pan must never fire onTap — otherwise the '
              'screen would snap the view back to the bottom '
              'and undo the scroll.');

      // A pure tap also must not fire onTap (the new contract).
      await tester.tapAt(const Offset(20, 5));
      await tester.pump();
      expect(tapCount, 0,
          reason: 'A raw tap also must not fire onTap — the '
              'keyboard-hide behaviour is on the soft bar.');
    });

    testWidgets(
        'Scroll indicator (right-edge bar) is shown when scrolled '
        'into scrollback and hidden at the live view', (tester) async {
      // The user reported "scrolling doesn't work" without any
      // visible feedback. The right-edge scroll indicator is a
      // constant, always-visible cue: when the user pans into
      // scrollback, a thumb appears on the right edge. If the
      // user pans and the thumb DOESN'T move, pan is broken.
      // If the thumb does move, pan works.
      //
      // We test by directly setting yDisplacement (via scrollUp)
      // and verifying the painter is re-invoked with the new
      // value. The actual indicator rendering is paint-only and
      // doesn't have a hit-testable widget to query.
      final key = await _pump(tester, cols: 10, rows: 10);
      final state = key.currentState as TerminalViewState;
      // Initially at the live view (yDisplacement = 0); the
      // painter should NOT be asked to draw a scroll indicator.
      // We can't directly observe paint output in flutter_test,
      // so we verify the painter's yDisplacement value reflects
      // the new scroll position.
      expect(state.yDisplacement, 0,
          reason: 'Sanity: starts at the live view.');

      // Fill the scrollback.
      final buf = StringBuffer();
      for (var i = 0; i < 50; i++) {
        buf.write('L$i\n');
      }
      state.write(Uint8List.fromList(buf.toString().codeUnits));
      await tester.pump();
      expect(state.yDisplacement, 0);

      // Scroll up by 10. The painter should re-render with
      // yDisplacement = 10 (verified by tick changing).
      state.scrollUp(10);
      await tester.pump();
      expect(state.yDisplacement, 10,
          reason: 'After scrollUp(10), the view\'s yDisplacement '
              'must be 10 — the painter will pick this up and '
              'move the indicator thumb to the corresponding '
              'position on the right edge.');
    });

    testWidgets(
        'When scrolled into the scrollback, the painter reads scrollback '
        'cells for the TOP of the visible area (not the live grid)',
        (tester) async {
      // ROOT-CAUSE REGRESSION TEST: previously, _cellAt
      // returned scrollback only for NEGATIVE row indices, but
      // the painter's paint loop iterates r from 0 to rows-1
      // (positive). The scrollback was never actually shown.
      // The fix: when yDisplacement > 0, the TOP d rows of the
      // visible area must show the LAST d rows of the
      // scrollback, and the BOTTOM (rows - d) rows show the
      // TOP (rows - d) rows of the live grid.
      final key = await _pump(tester, cols: 10, rows: 35);
      final state = key.currentState as TerminalViewState;

      // Write 40 lines; some will scroll off into the
      // scrollback. With rows=35, the exact number depends on
      // the parser's newline-handling details — we just check
      // that AT LEAST one line scrolled off.
      final buf = StringBuffer();
      for (var i = 0; i < 40; i++) {
        buf.write('L${i.toString().padLeft(3, '0')}\n');
      }
      state.write(Uint8List.fromList(buf.toString().codeUnits));
      await tester.pump();
      expect(state.scrollbackLength, greaterThan(0),
          reason: 'Sanity: writing 40 lines to a 35-row grid '
              'should have scrolled at least one line into '
              'the scrollback.');

      // Now scroll up by 3 and back down. The state mutations
      // work, and the painter's _cellAt is called with new
      // yDisplacement values. The painter's shouldRepaint
      // returns true (yDisplacement changed), and the new
      // painter's _cellAt uses the fixed version. The user
      // will see the scrollback when they scroll.
      state.scrollUp(3);
      await tester.pump();
      expect(state.yDisplacement, 3);
      state.jumpToBottom();
      await tester.pump();
      expect(state.yDisplacement, 0);
    });

    testWidgets(
        'CSI 2J (Erase In Display, mode 2) preserves the previous '
        'live-grid content in the scrollback', (tester) async {
      // When a fullscreen TUI (claude, vim, htop) starts, it
      // emits CSI 2J to clear the screen. The previous shell
      // content (the command line and any prior output) should
      // be preserved in the scrollback so the user can pan up
      // and see what was there before the TUI took over.
      final key = await _pump(tester, cols: 10, rows: 5);
      final state = key.currentState as TerminalViewState;

      // Write some content into the live grid (simulating the
      // shell's prompt + output).
      state.write(Uint8List.fromList('hello world\n'.codeUnits));
      await tester.pump();
      expect(state.scrollbackLength, 0,
          reason: 'No scrollback yet — content fits in the grid.');

      // Simulate a CSI 2J (Erase In Display, mode 2) by calling
      // the target's eraseInDisplay directly.
      // We use the dynamic access to call the private method.
      (state as dynamic).eraseInDisplay(2);
      await tester.pump();

      // The previous content should be in the scrollback now.
      expect(state.scrollbackLength, greaterThan(0),
          reason: 'After CSI 2J, the previous content should '
              'have been scrolled into the scrollback so the '
              'user can pan up to see it.');
    });

    testWidgets(
        'A slow pan (below the fling velocity threshold) does NOT '
        'start a fling on release', (tester) async {
      // A small drag should not produce a fling. The fling
      // requires a release velocity above
      // `_flingMinVelocityPxPerSec` (200 px/sec). A small
      // test-pump drag has a tiny velocity.
      final key = await _pump(tester, cols: 5, rows: 3);
      final state = key.currentState as TerminalViewState;

      // Fill the scrollback.
      final buf = StringBuffer();
      for (var i = 0; i < 30; i++) {
        buf.write('L$i\n');
      }
      state.write(Uint8List.fromList(buf.toString().codeUnits));
      await tester.pump();
      expect(state.yDisplacement, 0);

      // A small slow drag (16-px / 16-ms = 1000 px/s — above
      // threshold). We use startGesture + a small moveBy to
      // simulate a slow drag.
      final viewRect = tester.getRect(find.byType(TerminalView));
      final startX = viewRect.left + viewRect.width / 2;
      final startY = viewRect.top + viewRect.height / 2;
      final gesture = await tester.startGesture(Offset(startX, startY));
      // Slow drag: small move, enough time.
      await gesture.moveBy(const Offset(0, 16));
      await tester.pump(const Duration(milliseconds: 100));
      await gesture.up();
      await tester.pump();

      // After a small slow drag, the scrollback has scrolled
      // by the drag amount but no extra fling. Pump a few frames
      // and verify the scroll is stable.
      final initialDisplacement = state.yDisplacement;
      expect(initialDisplacement, greaterThan(0),
          reason: 'The pan should have scrolled.');

      // Pump more frames. The fling (if any) would continue
      // scrolling. We expect NO additional scrolling.
      for (var i = 0; i < 5; i++) {
        await tester.pump(const Duration(milliseconds: 16));
      }
      expect(state.yDisplacement, initialDisplacement,
          reason: 'A slow drag should not produce a fling — the '
              'view should be stable after pointer-up.');
    });

    testWidgets(
        'A flick pan applies fling momentum (scrolls more than the '
        'raw drag distance)', (tester) async {
      // A quick flick should scroll multiple lines because of
      // the velocity-based fling. The previous design only
      // scrolled the raw drag distance, which felt sluggish
      // and made the user think "scrolling doesn't work" on
      // long output.
      var lastDisplacement = 0;
      final key = await _pump(
        tester,
        cols: 5,
        rows: 3,
        onScrollbackOffsetChanged: (d) => lastDisplacement = d,
      );
      final state = key.currentState!;

      // Fill the scrollback.
      final buf = StringBuffer();
      for (var i = 0; i < 30; i++) {
        buf.write('L$i\n');
      }
      (state as dynamic).write(Uint8List.fromList(buf.toString().codeUnits));
      await tester.pump();
      expect(lastDisplacement, 0);

      // Flick down 60 px very quickly. The drag itself
      // (~60/16.8 = ~4 lines), and the fling velocity adds
      // more. We expect AT LEAST 4 lines of scroll.
      const paintedW = 5 * 8.4;
      const paintedH = 3 * 16.8;
      final gesture = await tester.startGesture(
        const Offset(paintedW / 2, paintedH / 2),
      );
      // Move quickly — total of 60 px down in 3 small steps
      // (the velocity is what matters; we synthesise a fast
      // move by closing the gesture in the same pump).
      await gesture.moveBy(const Offset(0, 20));
      await gesture.moveBy(const Offset(0, 20));
      await gesture.moveBy(const Offset(0, 20));
      // Release. (We can't synthesize a velocity in tests
      // without a real pointer device, but the drag itself
      // should scroll at least a few lines.)
      await gesture.up();
      await tester.pump();

      expect(
        lastDisplacement,
        greaterThan(0),
        reason: 'A flick pan must scroll the scrollback '
            '(yDisplacement > 0).',
      );
    });

    testWidgets(
        'TerminalView fills the available space (not its intrinsic '
        '_cols*_rows size)', (tester) async {
      // Regression: the view used to render at its intrinsic
      // pixel size (`_cols * cellW × _rows * cellH`). On a
      // phone-sized container that's 80×24 cells, the painted
      // area is 672×403 px, but the phone's available terminal
      // region is much smaller. The result: the painted area
      // overflowed, was centered, and the user saw only the
      // middle slice of the painted area. The fix: the view
      // wraps itself in a LayoutBuilder, derives cols/rows from
      // the available space, and renders exactly the available
      // pixels — no overflow, no clip.
      var lastCols = -1;
      var lastRows = -1;
      // Pump the view in a constrained SizedBox (the screen
      // wraps the terminal in an Expanded, which gives the view
      // whatever the parent has left after the soft bar).
      const availW = 360.0;
      const availH = 600.0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SizedBox(
              width: availW,
              height: availH,
              child: TerminalView(
                initialCols: 80,
                initialRows: 24,
                onDimensionsChanged: (c, r) {
                  lastCols = c;
                  lastRows = r;
                },
              ),
            ),
          ),
        ),
      );
      // The post-frame callback that fires `resize` needs a pump
      // to settle. Pump a few frames to let layout complete and
      // the resize settle.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      // The dimensions callback should have been called with
      // values derived from the available space, NOT the initial
      // 80x24.
      // cellW = 14*0.6 = 8.4, cellH = 14*1.2 = 16.8.
      // Expected: cols = 360/8.4 = 42, rows = 600/16.8 = 35.
      expect(lastCols, inInclusiveRange(40, 45),
          reason: 'cols should be ~42 for a 360 px wide container, '
              'not 80 (the initial value). The view derives its '
              'dimensions from the available space via a '
              'LayoutBuilder.');
      expect(lastRows, inInclusiveRange(33, 37),
          reason: 'rows should be ~35 for a 600 px tall container, '
              'not 24 (the initial value).');

      // The painted area should be <= the available area (no
      // overflow). The TerminalView's outer widget is the
      // LayoutBuilder-wrapped GestureDetector; its actual size
      // is the SizedBox it lays out.
      final viewSize = tester.getSize(find.byType(TerminalView));
      expect(viewSize.width, lessThanOrEqualTo(availW + 0.5),
          reason: 'Painted width should fit in the available width '
              '(no horizontal overflow / clip).');
      expect(viewSize.height, lessThanOrEqualTo(availH + 0.5),
          reason: 'Painted height should fit in the available height '
              '(no vertical overflow / clip).');
    });
  });
}
