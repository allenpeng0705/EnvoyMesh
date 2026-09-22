import 'package:envoygo/coding/coding_harness_probe.dart';
import 'package:envoygo/services/product/node_service_client.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeNodeService extends Fake implements NodeServiceClient {
  Map<String, dynamic> ehStatus = const {'state': 'ready'};
  Map<String, dynamic> piStatus = const {'state': 'ready'};
  Map<String, dynamic> extProbe = const {
    'installState': 'installed',
    'reachable': true,
  };

  @override
  Future<Map<String, dynamic>> getEnvoyHarnessStatus() async => ehStatus;

  @override
  Future<Map<String, dynamic>> getPiStatus() async => piStatus;

  @override
  Future<Map<String, dynamic>> probeExtAgent({String? agentId}) async =>
      extProbe;
}

void main() {
  group('CodingHarnessProbeResult', () {
    test('ready badge is distinct from notReady', () {
      const ready = CodingHarnessProbeResult(
        badge: CodingHarnessProbeBadge.ready,
      );
      const notReady = CodingHarnessProbeResult(
        badge: CodingHarnessProbeBadge.notReady,
        installCommand: 'npm i -g @example/cli',
      );
      expect(ready.isReady, isTrue);
      expect(notReady.needsResolve, isTrue);
      expect(notReady.installCommand, contains('npm'));
    });
  });

  group('readyCodingHarnessChoices / snapCodingHarnessToReady', () {
    test('filters to ready and snaps off not-ready', () {
      final probes = <String, CodingHarnessProbeResult>{
        'a': const CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.ready,
        ),
        'b': const CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.notReady,
        ),
        'c': const CodingHarnessProbeResult(
          badge: CodingHarnessProbeBadge.checking,
        ),
      };
      expect(
        readyCodingHarnessChoices(['a', 'b', 'c'], (id) => probes[id]),
        ['a'],
      );
      expect(
        snapCodingHarnessToReady('b', ['a', 'b', 'c'], (id) => probes[id]),
        'a',
      );
      expect(
        snapCodingHarnessToReady('a', ['a', 'b', 'c'], (id) => probes[id]),
        'a',
      );
      expect(
        snapCodingHarnessToReady('b', ['b', 'c'], (id) => probes[id]),
        isNull,
      );
    });
  });

  group('probeCodingHarnessByWireId', () {
    test('envoy-harness ready / not ready', () async {
      final client = _FakeNodeService();
      expect(
        (await probeCodingHarnessByWireId(client, wireId: 'envoy-harness'))
            .badge,
        CodingHarnessProbeBadge.ready,
      );

      client.ehStatus = {'state': 'disabled', 'error': 'no key'};
      final disabled =
          await probeCodingHarnessByWireId(client, wireId: 'envoy-harness');
      expect(disabled.badge, CodingHarnessProbeBadge.notReady);
      expect(disabled.hint, contains('no key'));
    });

    test('pi stopped/starting count as ready for picker', () async {
      final client = _FakeNodeService()..piStatus = {'state': 'stopped'};
      expect(
        (await probeCodingHarnessByWireId(client, wireId: 'pi')).badge,
        CodingHarnessProbeBadge.ready,
      );

      client.piStatus = {'state': 'starting'};
      expect(
        (await probeCodingHarnessByWireId(client, wireId: 'pi')).badge,
        CodingHarnessProbeBadge.ready,
      );

      client.piStatus = {'state': 'not-installed'};
      expect(
        (await probeCodingHarnessByWireId(client, wireId: 'pi')).badge,
        CodingHarnessProbeBadge.notReady,
      );

      client.piStatus = {'state': 'disabled'};
      expect(
        (await probeCodingHarnessByWireId(client, wireId: 'pi')).badge,
        CodingHarnessProbeBadge.notReady,
      );
    });

    test('ext agent install guide surfaces command as not-ready', () async {
      final client = _FakeNodeService()
        ..extProbe = {
          'installState': 'not-installed',
          'reachable': false,
          'installGuide': {
            'installed': false,
            'installCommand': 'npm i -g @anthropic-ai/claude-code',
            'installLink': 'https://example.com',
            'startHint': 'Install Claude Code CLI',
          },
        };
      final r = await probeCodingHarnessByWireId(
        client,
        wireId: 'claudecode',
        extAgentId: 'claudecode',
      );
      expect(r.badge, CodingHarnessProbeBadge.notReady);
      expect(r.reason, CodingHarnessNotReadyReason.absent);
      expect(r.installCommand, contains('claude-code'));
      expect(r.installLink, 'https://example.com');
    });
  });
}
