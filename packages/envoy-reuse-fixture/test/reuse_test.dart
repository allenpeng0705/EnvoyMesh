/// The reuse test — `docs/envoymesh-refactoring-plan.md` §4.4, Step 5.
///
/// Two jobs, and the second is the important one:
///
/// 1. **Exercise** the reusable surface so the fixture is a real consumer and
///    not a vacuous import check. Every assertion below is something a
///    non-social product genuinely needs.
/// 2. **Prove no social concept is reachable.** The fixture's own import
///    directives are scanned and cross-checked against the classification
///    manifest: every Dart module reachable from this package must be
///    classified `reusable`. If someone re-adds a social export to a reusable
///    library, this fails.
///
/// Note the division of labour with CI: `scripts/check-module-boundary.mjs`
/// enforces the graph rule (no `reusable` module depends on a `product-bound`
/// one) over the *repo*; this test enforces it from a *consumer's* perspective.
library;

import 'dart:convert';
import 'dart:io';

import 'package:envoy_reuse_fixture/envoy_reuse_fixture.dart';
import 'package:test/test.dart';

/// Repo root, found by walking up to the directory containing `scripts/`.
Directory findRepoRoot() {
  var dir = Directory.current;
  for (var i = 0; i < 6; i++) {
    if (File('${dir.path}/scripts/module-boundary.json').existsSync()) return dir;
    dir = dir.parent;
  }
  throw StateError('could not locate the repository root from ${Directory.current.path}');
}

void main() {
  group('the reusable surface is sufficient for a non-social product', () {
    test('a peer identity needs no owner profile, device certificate or bond', () {
      final identity = FixturePeerIdentity(label: 'fixture');
      expect(identity.peerId, startsWith('envoy_'));
      expect(identity.publicKeyPem, contains('PUBLIC KEY'));
      // Two identities differ — this is a real key pair, not a constant.
      expect(FixturePeerIdentity().peerId, isNot(identity.peerId));
    });

    test('signing and verification round-trip through canonical JSON', () {
      final identity = FixturePeerIdentity();
      final payload = <String, Object?>{'b': 2, 'a': 1, 'nested': {'z': true}};
      final signature = identity.sign(payload);

      expect(signature, isNotEmpty);
      expect(identity.verify(payload, signature), isTrue);
      // Key order must not matter — that is the point of canonical JSON.
      expect(
        identity.verify(<String, Object?>{'nested': {'z': true}, 'a': 1, 'b': 2}, signature),
        isTrue,
      );
      // A tampered payload must not verify.
      expect(identity.verify(<String, Object?>{'a': 999}, signature), isFalse);
    });

    test('an envelope can be built and verified without any social intent', () {
      final identity = FixturePeerIdentity();
      final envelope = buildSignedEnvelope(
        identity: identity,
        intent: 'discovery.request',
        payload: <String, Object?>{'messageId': 'm1', 'topic': 'capability:code'},
      );

      expect(envelope['signature'], isNotNull);
      expect(envelope['senderPeerId'], identity.peerId);
      expect(verifyEnvoyEnvelope(envelope), isTrue);

      // The envelope names no product concept.
      final encoded = jsonEncode(envelope);
      for (final concept in const ['familyProfile', 'bondTier', 'persona', 'isOwnerProfile']) {
        expect(encoded, isNot(contains(concept)),
            reason: 'a reusable envelope must not carry `$concept`');
      }
    });

    test('dialability is pure transport logic, not a trust decision', () {
      const direct = ['/ip4/1.2.3.4/tcp/4001'];
      const circuitOnly = ['/ip4/1.2.3.4/tcp/4001/p2p-circuit'];

      // A direct address wins outright — `hasHopSlot` is irrelevant to it.
      expect(canDialNow(hasHopSlot: true, multiaddrs: direct), isTrue);
      expect(canDialNow(hasHopSlot: false, multiaddrs: direct), isTrue,
          reason: 'a direct address is dialable even when a relay hop is not yet available');
      expect(canDialNow(hasHopSlot: null, multiaddrs: direct), isTrue);

      // For a circuit-only address, `hasHopSlot` decides: true = the live relay
      // hop exists, false = checked in but not dialable yet, null = the source
      // was silent so address presence is taken as dialability.
      expect(canDialNow(hasHopSlot: true, multiaddrs: circuitOnly), isTrue);
      expect(canDialNow(hasHopSlot: false, multiaddrs: circuitOnly), isFalse);
      expect(canDialNow(hasHopSlot: null, multiaddrs: circuitOnly), isTrue);

      // Nothing at all → not dialable.
      expect(canDialNow(hasHopSlot: null, multiaddrs: const []), isFalse);
    });

    test('a pairing URI parses into transport candidates', () {
      // Parameter names and escaping matter: a nested `ws://` value must be
      // percent-encoded or it breaks `Uri` parsing, and the legacy format uses
      // `wsUrl` / `relayWsUrl` / `homeNodePeerId` / `ownerId`.
      final uri = Uri(
        scheme: 'envoy',
        host: 'pair',
        queryParameters: <String, String>{
          'token': 't0ken',
          'wsUrl': 'ws://127.0.0.1:3030/ws',
          'relayWsUrl': 'wss://relay.example/ws',
          'homeNodePeerId': 'envoy_abc',
          'ownerId': 'envoy:owner:xyz',
        },
      ).toString();

      final pairing = parsePairing(uri);
      expect(pairing, isNotNull, reason: 'uri was: $uri');
      expect(pairing!.token, 't0ken');
      expect(pairing.wsUrl, 'ws://127.0.0.1:3030/ws');
      expect(pairing.relayWsUrl, 'wss://relay.example/ws');
      expect(pairing.homeNodePeerId, 'envoy_abc');
      expect(pairing.ownerId, 'envoy:owner:xyz');

      // Malformed / non-pairing URIs are rejected rather than throwing.
      expect(parsePairing('https://example.com'), isNull);
      expect(parsePairing(''), isNull);
    });

    test('interests map onto the discovery topic vocabulary', () {
      final topics = topicsForInterests(['Distributed Systems', 'rust']);
      expect(topics, hasLength(2));
      expect(topics.first, isNotEmpty);
      for (final t in topics) {
        expect(t, isNot(contains(' ')), reason: 'topics are slugs');
      }
    });

    test('the libp2p seed store round-trips through the reusable transport', () async {
      expect(await roundTripSeed('seed-bytes-abc'), 'seed-bytes-abc');
    });
  });

  group('no social concept is reachable from this consumer', () {
    /// The fixture's source with comments removed.
    ///
    /// Directives must be read from comment-stripped text: this fixture's doc
    /// comment *names* the social libraries to explain that it must not import
    /// them, and an unstripped scan reads that as a violation. That is the same
    /// trap the classifier hit when a doc comment became a dependency edge.
    String fixtureSourceWithoutComments() {
      final raw = File('lib/envoy_reuse_fixture.dart').readAsStringSync();
      return raw.replaceAll(RegExp(r'/\*[\s\S]*?\*/'), '').replaceAll(RegExp(r'//[^\n]*'), '');
    }

    test('the fixture imports only declared reusable libraries', () {
      final source = fixtureSourceWithoutComments();
      final imports = RegExp(r"^import\s+'([^']+)'", multiLine: true)
          .allMatches(source)
          .map((m) => m.group(1)!)
          .toList();

      expect(imports, isNotEmpty, reason: 'the scan must not silently find nothing');

      for (final forbidden in const [
        'package:envoy_mesh/envoy_mesh_social.dart',
        'package:envoy_mesh_libp2p/envoy_mesh_libp2p_social.dart',
      ]) {
        expect(imports, isNot(contains(forbidden)),
            reason: 'the reuse fixture must never import the social library `$forbidden`');
      }

      // Rule 2 from the consumer's side: no reaching into another package's src/.
      expect(imports.where((i) => RegExp(r'^package:[^/]+/src/').hasMatch(i)), isEmpty);

      // Every imported library file must itself be classified reusable.
      final manifest = jsonDecode(
        File('${findRepoRoot().path}/scripts/module-boundary.json').readAsStringSync(),
      ) as Map<String, dynamic>;
      final reusable = {
        for (final row in manifest['reusable'] as List) (row as Map)['path'] as String,
      };

      const libraryFiles = {
        'package:envoy_mesh/envoy_mesh.dart': 'packages/envoy-mesh-dart/lib/envoy_mesh.dart',
        'package:envoy_thin_client/envoy_thin_client.dart':
            'packages/envoy-thin-client-dart/lib/envoy_thin_client.dart',
        'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart':
            'packages/envoy-mesh-libp2p-dart/lib/envoy_mesh_libp2p.dart',
      };

      for (final imported in imports) {
        final modulePath = libraryFiles[imported];
        if (modulePath == null) continue; // dart: imports
        expect(reusable, contains(modulePath),
            reason: '`$imported` is classified product-bound — the reusable surface leaked');
      }
    });

    test('the social libraries are genuinely unreachable (they are not dependencies)', () {
      // `envoy_mesh_social.dart` lives inside the same pub package as
      // `envoy_mesh.dart`, so it *could* be imported. It is not — and that is
      // the encapsulation claim: separation of libraries, not of packages.
      final source = fixtureSourceWithoutComments();
      expect(source, isNot(contains("import 'package:envoy_mesh/envoy_mesh_social.dart'")));
      expect(
        source,
        isNot(contains("import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p_social.dart'")),
      );
    });
  });
}
