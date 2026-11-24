import 'package:envoygo/coding/coding_archive.dart';
import 'package:envoygo/coding/coding_history.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('codingRowMatchesFilter', () {
    final archived = {'eh:old'};

    test('archived filter only shows archived rows', () {
      final row = CodingHistoryRowMeta(
        kind: 'eh',
        id: 'old',
        lastUsedAt: DateTime.now(),
      );
      expect(
        codingRowMatchesFilter(row, CodingHistoryFilter.archived, archived),
        isTrue,
      );
      expect(
        codingRowMatchesFilter(
          row.copyWith(id: 'new'),
          CodingHistoryFilter.archived,
          archived,
        ),
        isFalse,
      );
    });

    test('needsYou uses EH uiBucket', () {
      final row = CodingHistoryRowMeta(
        kind: 'eh',
        id: 'a',
        lastUsedAt: DateTime.now(),
        uiBucket: 'needs_input',
      );
      expect(
        codingRowMatchesFilter(row, CodingHistoryFilter.needsYou, const {}),
        isTrue,
      );
    });
  });
}

extension on CodingHistoryRowMeta {
  CodingHistoryRowMeta copyWith({String? id}) {
    return CodingHistoryRowMeta(
      kind: kind,
      id: id ?? this.id,
      lastUsedAt: lastUsedAt,
      uiBucket: uiBucket,
      extNeedsInstall: extNeedsInstall,
    );
  }
}