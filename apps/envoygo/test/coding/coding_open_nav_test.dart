import 'package:envoygo/coding/coding_open_nav.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUp(resetCodingOpenNavForTests);

  test('openCoding / takePendingCodingOpen round-trip', () {
    expect(takePendingCodingOpen(), isNull);
    openCoding(
      const CodingOpenDetail(
        meshWorkQueue: true,
        runMeshWorkId: 'w1',
        meshWorkEnqueue: CodingMeshWorkEnqueueRequest(
          prompt: 'fix lint',
          cwd: '/tmp/p',
          title: 'Lint',
        ),
      ),
    );
    final pending = takePendingCodingOpen();
    expect(pending?.meshWorkQueue, isTrue);
    expect(pending?.runMeshWorkId, 'w1');
    expect(pending?.meshWorkEnqueue?.prompt, 'fix lint');
    expect(takePendingCodingOpen(), isNull);
  });

  test('subscribeCodingOpen notifies live listeners', () {
    CodingOpenDetail? seen;
    final unsub = subscribeCodingOpen((detail) => seen = detail);
    openCoding(const CodingOpenDetail(meshWorkQueue: true));
    expect(seen?.meshWorkQueue, isTrue);
    unsub();
    seen = null;
    openCoding(const CodingOpenDetail(runMeshWorkId: 'x'));
    expect(seen, isNull);
    expect(takePendingCodingOpen()?.runMeshWorkId, 'x');
  });
}
