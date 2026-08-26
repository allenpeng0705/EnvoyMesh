import 'package:envoygo/widgets/eh/eh_split_diff.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('stacked narrow layout does not throw', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 320,
            child: SingleChildScrollView(
              child: EhSplitDiff(
                diff: '--- a\n+++ b\n@@\n-old\n+new\n context\n',
              ),
            ),
          ),
        ),
      ),
    );
    expect(find.textContaining('old'), findsOneWidget);
    expect(find.textContaining('new'), findsOneWidget);
  });

  testWidgets('wide layout renders side-by-side without throw', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 800,
            child: EhSplitDiff(
              diff: '--- a\n+++ b\n@@\n-old\n+new\n',
            ),
          ),
        ),
      ),
    );
    expect(tester.takeException(), isNull);
  });
}
