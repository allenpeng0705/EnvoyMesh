import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';

import 'package:envoygo/services/vault_content_fetch.dart';

void main() {
  group('fetchVaultContent', () {
    test('assembles multiple offset chunks under tunnel-safe size', () async {
      final payload = Uint8List.fromList(
        List<int>.generate(vaultReadChunkBytes + 50, (i) => i % 256),
      );
      final calls = <Map<String, int?>>[];

      final result = await fetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) async {
          calls.add({'maxBytes': maxBytes, 'offset': offset});
          final start = offset ?? 0;
          final end = (start + (maxBytes ?? payload.length))
              .clamp(0, payload.length);
          final slice = payload.sublist(start, end);
          return {
            'contentBase64': base64Encode(slice),
            'mimeType': 'image/jpeg',
            'sizeBytes': payload.length,
            'truncated': end < payload.length,
          };
        },
        relativePath: 'profile/thumbnail.jpg',
      );

      expect(calls.length, 2);
      expect(calls[0]['offset'], 0);
      expect(calls[1]['offset'], vaultReadChunkBytes);
      expect(result.bytes, payload);
      expect(result.mimeType, 'image/jpeg');
      // Each chunk body (base64) must stay under prior 128KiB tunnel cap.
      final chunkB64Len = base64Encode(
        payload.sublist(0, vaultReadChunkBytes),
      ).length;
      expect(chunkB64Len, lessThan(128 * 1024));
    });

    test('falls back to full read when home rejects chunked offset', () async {
      final payload = Uint8List.fromList(
        List<int>.generate(80 * 1024, (i) => i % 256),
      );
      var sawOffset = false;
      final result = await fetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) async {
          if (offset != null) {
            sawOffset = true;
            throw Exception(
              'File too large for preview (${payload.length} bytes, max $maxBytes)',
            );
          }
          return {
            'contentBase64': base64Encode(payload),
            'mimeType': 'image/jpeg',
            'sizeBytes': payload.length,
            'truncated': false,
          };
        },
        relativePath: 'profile/thumbnail.jpg',
      );
      expect(sawOffset, isTrue);
      expect(result.bytes, payload);
    });

    test('single chunk when file fits', () async {
      final payload = Uint8List.fromList([1, 2, 3, 4]);
      var calls = 0;
      final result = await fetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) async {
          calls++;
          return {
            'contentBase64': base64Encode(payload),
            'mimeType': 'image/png',
            'sizeBytes': payload.length,
            'truncated': false,
          };
        },
        relativePath: 'profile/a.png',
      );
      expect(calls, 1);
      expect(result.bytes, payload);
    });
  });
}
