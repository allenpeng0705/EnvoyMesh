import 'dart:convert';
import 'dart:io';

import 'package:envoygo/coding/coding_composer.dart';
import 'package:flutter_test/flutter_test.dart';

/// FH-P1-C — EnvoyGo composer matrix matches committed Mesh snapshot.
void main() {
  test('featured harness rows match scripts/family-catalog-snapshot.json', () {
    final snapshotFile = File(
      '${Directory.current.path}/../../scripts/family-catalog-snapshot.json',
    );
    expect(snapshotFile.existsSync(), isTrue,
        reason: 'run from apps/envoygo');
    final snapshot = jsonDecode(snapshotFile.readAsStringSync()) as Map;
    final harnesses = snapshot['harnesses'] as List;
    final live = exportFamilyCatalogMesh();

    expect(live.length, harnesses.length);
    for (var i = 0; i < harnesses.length; i++) {
      final expected = harnesses[i] as Map<String, dynamic>;
      final row = live[i];
      expect(row.id, expected['id']);
      expect(row.extAgentId, expected['extAgentId']);
      expect(row.canSetMode, expected['canSetMode']);
      expect(row.permissions, expected['permissions']);
      expect(row.agentModeIds, expected['agentModeIds']);
      expect(row.askingControl, expected['askingControl']);
    }
  });
}