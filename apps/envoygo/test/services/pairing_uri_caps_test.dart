import 'dart:convert';
import 'dart:math';

import 'package:archive/archive.dart';
import 'package:envoy_thin_client/envoy_thin_client.dart';
import 'package:flutter_test/flutter_test.dart';

/// Build a compressed pairing URI (`envoy://pair?pairing=…`) from [json].
String compressedPairingUri(String json) {
  final gz = GZipEncoder().encode(utf8.encode(json));
  expect(gz, isNotNull);
  final b64 = base64UrlEncode(gz!);
  return 'envoy://pair?pairing=$b64';
}

/// Minimal valid pairing JSON the decoder understands.
Map<String, dynamic> validPairingJson() => {
      'v': 1,
      'ws': 'ws://home.local/ws',
      'tok': 'tok-1',
      'oid': 'envoy:owner:abc',
    };

void main() {
  group('compressed pairing token bounds', () {
    test('parses a normal compressed pairing blob', () {
      final data =
          parsePairingUri(compressedPairingUri(jsonEncode(validPairingJson())));
      expect(data, isNotNull);
      expect(data!.token, 'tok-1');
      expect(data.isInviteUri, isFalse);
    });

    test('refuses a pairing blob whose decompressed JSON exceeds 64 KiB', () {
      // ~70 KiB of mostly-repetitive ws text — compresses far under the
      // 8 KiB compressed-input cap, so only the decompressed cap can trip.
      final big = validPairingJson();
      big['ws'] = 'ws://home.local/' + ('a' * (70 * 1024));
      final uri = compressedPairingUri(jsonEncode(big));
      // Sanity: the compressed blob really is small.
      expect(uri.length, lessThan(3000));

      // No legacy params, so a refused compressed blob parses to null.
      expect(parsePairingUri(uri), isNull);
    });

    test('refuses a pairing blob with an oversized compressed input', () {
      final rng = Random(42);
      final noise =
          List.generate(12 * 1024, (_) => rng.nextInt(256)).map((b) => b).join(
                ',',
              );
      final json = jsonEncode({
        'v': 1,
        'ws': 'ws://home.local/ws',
        'tok': 'tok-1',
        'oid': 'o',
        'pad': noise,
      });
      final gz = GZipEncoder().encode(utf8.encode(json))!;
      expect(gz.length, greaterThan(8 * 1024),
          reason: 'test needs an incompressible blob > 8 KiB');

      final uri = 'envoy://pair?pairing=${base64UrlEncode(gz)}';
      expect(parsePairingUri(uri), isNull);
    });
  });
}
