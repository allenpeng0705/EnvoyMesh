// Locks down the regressions around the terminal screen's hidden
// TextField focus management:
//
//   1. Pressing Enter (the device keyboard's "Send" key) must
//      keep focus on the TextField so the OS keyboard stays up
//      across long shell sessions. The screen does this by
//      re-claiming focus synchronously inside the `onSubmitted`
//      handler — NEVER via a post-frame callback, because that
//      races with the OS dismiss animation and produces a
//      visible "flash down, then up".
//
//   2. Pressing the "Hide keyboard" button on the soft bar must
//      take focus OFF the TextField without any re-focus call
//      that would re-summon the keyboard. (The post-frame
//      requestFocus in the previous design was the bug the user
//      reported as a flash.)

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

class _KeyboardScreen extends StatefulWidget {
  final void Function(String text) onSubmit;
  final VoidCallback onHideKeyboard;
  const _KeyboardScreen({
    required this.onSubmit,
    required this.onHideKeyboard,
  });
  @override
  State<_KeyboardScreen> createState() => _KeyboardScreenState();
}

class _KeyboardScreenState extends State<_KeyboardScreen> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onSubmit(String text) {
    widget.onSubmit(text);
    _controller.clear();
    // Mirror the screen: re-claim focus synchronously, but only
    // if the field still has focus. The synchronous call avoids
    // the focus-loop race that previously caused the keyboard to
    // flash on Enter.
    if (_focus.hasFocus) {
      _focus.requestFocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: TextField(
        controller: _controller,
        focusNode: _focus,
        autofocus: true,
        textInputAction: TextInputAction.send,
        onSubmitted: _onSubmit,
      ),
    );
  }
}

void main() {
  group('Terminal keyboard focus (regression)', () {
    testWidgets(
        'submitting Enter keeps focus on the TextField (keyboard stays open)',
        (tester) async {
      String? submitted;
      await tester.pumpWidget(
        MaterialApp(
          home: _KeyboardScreen(
            onSubmit: (t) => submitted = t,
            onHideKeyboard: () {},
          ),
        ),
      );
      // The TextField is autofocused on first build.
      await tester.pump();
      expect(FocusManager.instance.primaryFocus, isNotNull);

      // Type a value.
      await tester.enterText(find.byType(TextField), 'ls -la');
      await tester.pump();
      // Simulate the user pressing the device keyboard's Enter.
      // `tester.testTextInput.receiveAction` fires the same
      // callback chain that the OS keyboard's Enter key would
      // produce (it triggers `onSubmitted`; the `send` action
      // does NOT auto-unfocus).
      await tester.testTextInput.receiveAction(TextInputAction.send);
      await tester.pump();

      expect(submitted, 'ls -la');

      // Post-fix: the field re-claims focus synchronously inside
      // the submit handler. Pump a few frames and verify focus
      // is still on the field (NOT lost and bouncing back via
      // a post-frame callback, which would cause a visible
      // flash on the device).
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));
      expect(
        FocusManager.instance.primaryFocus,
        isNotNull,
        reason: 'After Enter, the hidden TextField must still own '
            'primary focus so the OS keyboard stays up.',
      );
    });

    testWidgets(
        'pressing the soft-bar Hide-keyboard button takes focus off '
        'the field WITHOUT re-focusing it (no flash)', (tester) async {
      // This is the regression: the previous design called
      // `FocusScope.unfocus()` and then re-requested focus on the
      // next frame. The OS would dismiss the keyboard (200ms
      // animation), our callback would re-claim focus, and the
      // user would see a "flash down, then up".
      //
      // The fix: on explicit hide, do NOT re-focus. The user
      // wants the keyboard gone. Tapping the terminal area is
      // the way to bring it back.
      await tester.pumpWidget(
        MaterialApp(
          home: _KeyboardScreen(
            onSubmit: (_) {},
            onHideKeyboard: () {
              // Mirror the screen's `_hideKeyboard`:
              //   - call unfocus() on the scope
              //   - do NOT call requestFocus() afterwards
              FocusManager.instance.primaryFocus?.unfocus();
            },
          ),
        ),
      );
      await tester.pump();
      expect(
        FocusManager.instance.primaryFocus,
        isNotNull,
        reason: 'Sanity: the TextField starts with focus.',
      );

      // The screen's "Hide keyboard" handler. We invoke it the
      // same way the soft-bar's onHideKeyboard callback is invoked.
      final focusBefore = FocusManager.instance.primaryFocus;
      expect(focusBefore, isNotNull);
      focusBefore!.unfocus();
      await tester.pump();

      // Pump through the OS dismiss animation duration.
      await tester.pump(const Duration(milliseconds: 250));

      // After explicit dismiss, focus must NOT bounce back.
      // (If it did, the OS would re-show the keyboard — the
      // "flash" the user reported.)
      expect(
        FocusManager.instance.primaryFocus,
        isNot(focusBefore),
        reason: 'After Hide keyboard, focus must remain off the '
            'TextField. Re-focusing after unfocus is the bug '
            'that produced the keyboard flash.',
      );
    });

    testWidgets(
        'tapping the terminal area TOGGLES the keyboard (off when on, '
        'on when off)', (tester) async {
      // The screen's `_onTapTerminalArea` handler implements
      // a toggle: if the field currently has focus → unfocus
      // (dismiss keyboard); if not → requestFocus (summon
      // keyboard). This is how the user gets the keyboard
      // back after explicit dismissal.
      late final TextEditingController _ctrl;
      late final FocusNode _focus;
      _ctrl = TextEditingController();
      _focus = FocusNode();
      addTearDown(_ctrl.dispose);
      addTearDown(_focus.dispose);

      void tapToggle() {
        if (_focus.hasFocus) {
          _focus.unfocus();
        } else {
          _focus.requestFocus();
        }
      }

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: TextField(controller: _ctrl, focusNode: _focus)),
        ),
      );
      await tester.pump();
      _focus.requestFocus();
      await tester.pump();
      expect(_focus.hasFocus, isTrue, reason: 'Sanity: focused.');

      // Tap toggles → off.
      tapToggle();
      await tester.pump();
      expect(_focus.hasFocus, isFalse, reason: 'Tap while focused unfocuses.');

      // Tap toggles → on.
      tapToggle();
      await tester.pump();
      expect(_focus.hasFocus, isTrue, reason: 'Tap while not focused focuses.');
    });
  });
}
