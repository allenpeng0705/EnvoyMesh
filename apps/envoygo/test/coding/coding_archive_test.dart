import 'package:envoygo/coding/coding_archive.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('coding_archive', () {
    test('archive / unarchive keys', () async {
      expect(codingArchiveKey('eh', 'chat-1'), 'eh:chat-1');
      expect(codingArchiveKey('pi', 'sess'), 'pi:sess');
      expect(codingArchiveKey('ext', 'ext:codex:1'), 'ext:ext:codex:1');

      await archiveCodingTask('eh:chat-1');
      await archiveCodingTask('pi:sess');
      var keys = await loadCodingArchivedKeys();
      expect(keys, containsAll(['eh:chat-1', 'pi:sess']));

      await archiveCodingTask('eh:chat-1'); // idempotent
      keys = await loadCodingArchivedKeys();
      expect(keys, hasLength(2));

      await unarchiveCodingTask('eh:chat-1');
      keys = await loadCodingArchivedKeys();
      expect(keys, equals({'pi:sess'}));
    });

    test('history filter persists', () async {
      expect(await loadCodingHistoryFilter(), CodingHistoryFilter.all);
      await saveCodingHistoryFilter(CodingHistoryFilter.archived);
      expect(await loadCodingHistoryFilter(), CodingHistoryFilter.archived);
      await saveCodingHistoryFilter(CodingHistoryFilter.all);
      expect(await loadCodingHistoryFilter(), CodingHistoryFilter.all);
    });
  });
}
