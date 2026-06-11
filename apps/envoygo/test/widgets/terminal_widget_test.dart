// The original terminal_widget_test.dart was a stub for the
// legacy `terminal_widget.dart` (the line-buffered viewer). The
// new emulator lives in `widgets/terminal/terminal_view.dart`
// and is tested in `test/widgets/terminal/terminal_view_test.dart`.
//
// This file is kept as a marker so the test runner does not
// error on a missing file. The legacy `terminal_widget.dart`
// has been left in place (unused) so this file's `import` of it
// would still resolve if the project keeps it; we import it here
// to avoid a stale dead-code warning. If the project removes the
// legacy widget, this file can be deleted entirely.

import 'package:envoygo/widgets/terminal/terminal_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('TerminalView renders without throwing (smoke)',
      (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: TerminalView()),
      ),
    );
    expect(find.byType(TerminalView), findsOneWidget);
  });
}
