import 'package:flutter_test/flutter_test.dart';

import 'package:envoygo/coding/eh_mesh_work_ref.dart';

void main() {
  test('parseEhMeshWorkRef round-trip footer', () {
    const footer =
        '[envoymesh-coding-work]{"kind":"eh-mesh-work","v":1,"workId":"w1","prompt":"fix","fromOwnerId":"envoy:owner:a","cwd":"/p"}';
    final parsed = parseEhMeshWorkRef('Hi\n\n$footer');
    expect(parsed?.workId, 'w1');
    expect(parsed?.prompt, 'fix');
    expect(parsed?.cwd, '/p');
  });
}